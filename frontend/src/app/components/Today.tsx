import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router';
import { RefreshCw, Download } from 'lucide-react';
import {
  getDashboard,
  getLiveStatus,
  getCorrections,
  type LiveWorker,
} from '../../api/client';
import { PageShell, DataPanel, ErrorState, EmptyState } from './layout/PageShell';
import { StatusBadge } from './StatusBadge';
import { DataTable, type DataTableColumn } from './ui/DataTable';
import { downloadCsv } from './ui/csv';
import { PrintButton } from './ui/PrintButton';
import { connectSocket, subscribeSocket, subscribeSocketConnection } from '../utils/socket';
import { useAuth } from '../hooks/useAuth';

type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
type StatusFilter = 'all' | LiveWorker['status'] | 'on-break' | 'missed-punch';

type WorkerFlag = { kind: 'danger' | 'warning'; label: string };

function getWorkerFlags(worker: LiveWorker, missedPunchIds: Set<string>): WorkerFlag[] {
  const flags: WorkerFlag[] = [];
  if (worker.status === 'absent') {
    flags.push({ kind: 'danger', label: 'Absent' });
  }
  if (missedPunchIds.has(worker.id)) {
    flags.push({ kind: 'warning', label: 'Missed punch' });
  }
  if (worker.durationMins > 20 && worker.status.includes('break')) {
    flags.push({ kind: 'warning', label: 'Long break' });
  }
  if (worker.status === 'checked-out' && worker.durationMins > 0) {
    flags.push({ kind: 'warning', label: 'Left early' });
  }
  return flags;
}

function pickActiveShift(shifts: DashboardData['shifts']) {
  if (!shifts?.length) return null;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const parseMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const active = shifts.find(shift => {
    const start = parseMinutes(shift.startTime);
    const end = parseMinutes(shift.endTime);
    if (end >= start) return currentMinutes >= start && currentMinutes <= end;
    return currentMinutes >= start || currentMinutes <= end;
  });

  return active ?? shifts[0];
}

function exportRosterCsv(workers: LiveWorker[], missedPunchIds: Set<string>) {
  downloadCsv(
    `fams-roster-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Employee ID', 'Name', 'Department', 'Status', 'Last Event', 'Duration', 'Flags'],
    workers.map(w => {
      const flags = getWorkerFlags(w, missedPunchIds).map(f => f.label).join('; ');
      const lastEvent = w.lastEvent
        ? new Date(w.lastEvent).toLocaleString('en-IN', { hour12: false })
        : '';
      return [w.id, w.name, w.department, w.status, lastEvent, w.duration, flags];
    }),
  );
}

export function Today() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [workers, setWorkers] = useState<LiveWorker[]>([]);
  const [pendingCorrections, setPendingCorrections] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const fetchAll = useCallback(async () => {
    try {
      const [dash, live, corrections] = await Promise.all([
        getDashboard(),
        getLiveStatus(),
        getCorrections().catch(() => []),
      ]);
      setDashboard(dash);
      setWorkers(live);
      setPendingCorrections(corrections.filter(c => c.status === 'pending').length);
      setLastUpdatedAt(new Date());
      setError(null);
    } catch (err: any) {
      const message = err.message ?? 'Failed to load today\'s data';
      setError(message);
      // Stop hammering the API when rate-limited
      if (String(message).toLowerCase().includes('rate limit') || err.status === 429) {
        return 'rate-limited' as const;
      }
    } finally {
      setLoading(false);
    }
    return 'ok' as const;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let delayMs = 60_000;

    const tick = async () => {
      if (cancelled) return;
      const result = await fetchAll();
      if (cancelled) return;
      if (result === 'rate-limited') {
        delayMs = Math.min(delayMs * 2, 5 * 60_000);
      } else {
        delayMs = 60_000;
      }
      timeoutId = setTimeout(tick, delayMs);
    };

    void tick();
    const onVis = () => {
      if (!document.hidden && !cancelled) void fetchAll();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fetchAll]);

  const { isAdmin, isAuthenticated, authReady } = useAuth();

  useEffect(() => {
    if (!authReady || !isAuthenticated) {
      setConnected(false);
      return;
    }

    const unsubscribeConnection = subscribeSocketConnection(setConnected);
    const unsubscribeWorkerScanned = subscribeSocket('worker_scanned', () => void fetchAll());
    const unsubscribeSyncComplete = subscribeSocket('bulk_sync_complete', () => void fetchAll());
    connectSocket();

    return () => {
      unsubscribeConnection();
      unsubscribeWorkerScanned();
      unsubscribeSyncComplete();
    };
  }, [authReady, fetchAll, isAuthenticated]);

  const scrollToRoster = () => {
    document.getElementById('workforce-roster')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const kpi = dashboard?.kpi;
  const alerts = dashboard?.alerts ?? [];
  const activeShift = pickActiveShift(dashboard?.shifts ?? []);
  const missedPunchIds = useMemo(
    () => new Set((dashboard?.missedPunchWorkers ?? []).map(w => w.employeeCode)),
    [dashboard?.missedPunchWorkers],
  );

  const exceptions = useMemo(() => {
    const items: { id: string; type: 'danger' | 'warning'; text: string; action?: () => void }[] = [];

    const absent = workers.filter(w => w.status === 'absent');
    if (absent.length > 0) {
      items.push({
        id: 'absent',
        type: 'danger',
        text: `${absent.length} worker${absent.length > 1 ? 's' : ''} with no punch today`,
        action: () => setStatusFilter('absent'),
      });
    }

    const missedPunch = dashboard?.missedPunchWorkers ?? [];
    if (missedPunch.length > 0) {
      items.push({
        id: 'missed-punch',
        type: 'warning',
        text: `${missedPunch.length} worker${missedPunch.length > 1 ? 's' : ''} missed punch out`,
        action: () => setStatusFilter('missed-punch'),
      });
      missedPunch.slice(0, 3).forEach(w => {
        items.push({
          id: `missed-${w.employeeCode}`,
          type: 'warning',
          text: `${w.name} — missed punch out`,
          action: () => {
            setSearch(w.name);
            setStatusFilter('missed-punch');
          },
        });
      });
    }

    const longBreaks = workers.filter(w => w.durationMins > 20 && w.status.includes('break'));
    longBreaks.slice(0, 5).forEach(w => {
      items.push({
        id: `break-${w.id}`,
        type: 'warning',
        text: `${w.name} — break ${w.duration}`,
        action: () => {
          setSearch(w.name);
          setStatusFilter(w.status);
        },
      });
    });

    if (pendingCorrections > 0) {
      items.push({
        id: 'corrections',
        type: 'warning',
        text: `${pendingCorrections} correction${pendingCorrections > 1 ? 's' : ''} awaiting approval`,
      });
    }

    alerts.forEach((a: any, i: number) => {
      items.push({ id: `alert-${i}`, type: a.type === 'warning' ? 'warning' : 'danger', text: a.message });
    });

    return items;
  }, [workers, pendingCorrections, alerts, dashboard?.missedPunchWorkers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return workers.filter(w => {
      const match = w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q) || w.department.toLowerCase().includes(q);
      const statusMatch = statusFilter === 'all'
        || (statusFilter === 'on-break' ? w.status.includes('break') : statusFilter === 'missed-punch' ? missedPunchIds.has(w.id) : w.status === statusFilter);
      return match && statusMatch;
    });
  }, [workers, search, statusFilter, missedPunchIds]);

  const rosterColumns: DataTableColumn<LiveWorker>[] = useMemo(() => [
    {
      id: 'worker',
      header: 'Worker',
      sortable: true,
      sortValue: row => row.name,
      render: row => (
        <>
          <p className="font-medium">{row.name}</p>
          <p className="fams-mono text-[11px] text-[var(--muted)]">{row.id}</p>
        </>
      ),
    },
    {
      id: 'dept',
      header: 'Department',
      sortable: true,
      sortValue: row => row.department,
      render: row => <span className="text-[var(--muted)]">{row.department}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      sortValue: row => row.status,
      render: row => <StatusBadge status={row.status as any} size="sm" />,
    },
    {
      id: 'since',
      header: 'Since',
      sortable: true,
      sortValue: row => row.lastEvent ?? '',
      render: row => (
        <span className="fams-mono text-[12px]">
          {row.lastEvent ? new Date(row.lastEvent).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
        </span>
      ),
    },
    {
      id: 'duration',
      header: 'Duration',
      sortable: true,
      sortValue: row => row.durationMins,
      render: row => (
        <span className={`fams-mono text-[12px] font-medium ${row.durationMins > 20 && row.status.includes('break') ? 'text-[var(--danger)]' : ''}`}>
          {row.duration}
        </span>
      ),
    },
    {
      id: 'flag',
      header: 'Flag',
      render: row => {
        const flags = getWorkerFlags(row, missedPunchIds);
        if (flags.length === 0) return <span className="text-[12px] text-[var(--muted)]">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {flags.map(f => (
              <span key={f.label} className={`fams-flag fams-flag-${f.kind}`}>{f.label}</span>
            ))}
          </div>
        );
      },
    },
  ], [missedPunchIds]);

  const dateLabel = kpi?.workDate
    ? new Date(`${kpi.workDate}T12:00:00`).toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : new Date().toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });

  if (error) {
    return <ErrorState message={error} onRetry={fetchAll} />;
  }

  const presentPct = kpi && kpi.total > 0
    ? ((kpi.present / kpi.total) * 100).toFixed(1)
    : '—';

  const statFilters: { label: string; value: StatusFilter; count: string | number; accent?: string }[] = [
    { label: 'Expected', value: 'all', count: kpi?.total ?? '—' },
    { label: 'Present', value: 'checked-in', count: kpi?.present ?? '—' },
    { label: 'Absent', value: 'absent', count: kpi?.absent ?? '—', accent: kpi?.absent ? 'var(--danger)' : undefined },
    { label: 'On break', value: 'on-break', count: kpi?.onBreak ?? '—' },
    { label: 'Attendance', value: 'all', count: `${presentPct}%` },
  ];

  const shiftVariance = activeShift ? activeShift.present - activeShift.capacity : null;

  return (
    <PageShell
      title="Today"
      description="Who is on site, what needs attention, and what changed recently."
      printTitle="FAMS — Today"
      actions={
        <>
          <PrintButton />
          <button
            type="button"
            onClick={() => exportRosterCsv(filtered, missedPunchIds)}
            disabled={filtered.length === 0}
            className="fams-btn fams-btn-outline"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button type="button" onClick={fetchAll} disabled={loading} data-tour="btn-refresh" className="fams-btn fams-btn-outline">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </>
      }
    >
      <div className="fams-context-bar">
        <span><strong>{dateLabel}</strong></span>
        {activeShift && (
          <span>
            Shift: <strong>{activeShift.name}</strong> ({activeShift.startTime}–{activeShift.endTime})
          </span>
        )}
        <span className="fams-mono text-[12px]" style={{ color: connected ? 'var(--success)' : 'var(--muted)' }}>
          {connected ? 'Live feed active' : 'Live feed unavailable'}
        </span>
        {lastUpdatedAt && (
          <span className="fams-mono text-[12px] text-[var(--muted)]">
            Updated {lastUpdatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="fams-sticky-bar">
        <div data-tour="kpi-grid" className="fams-stat-bar">
          {statFilters.map(s => {
            const isAttendance = s.label === 'Attendance';
            const isExpected = s.label === 'Expected';
            const isActive = !isAttendance && !isExpected && statusFilter === s.value;

            if (isAttendance || isExpected) {
              return (
                <div key={s.label} className="fams-stat-cell">
                  <p className="fams-stat-value" style={s.accent ? { color: s.accent } : undefined}>{s.count}</p>
                  <p className="fams-stat-label">{s.label}</p>
                </div>
              );
            }

            return (
              <button
                key={s.label}
                type="button"
                className="fams-stat-cell-btn"
                data-active={isActive}
                onClick={() => setStatusFilter(prev => (prev === s.value ? 'all' : s.value))}
                aria-pressed={isActive}
              >
                <p className="fams-stat-value" style={s.accent ? { color: s.accent } : undefined}>{s.count}</p>
                <p className="fams-stat-label">{s.label}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <DataPanel title="Requires action" className="lg:col-span-1" data-tour="panel-alerts">
          {exceptions.length === 0 ? (
            <EmptyState
              title="No exceptions"
              description="All shifts are within normal parameters."
              action={{ label: 'View full roster', onClick: scrollToRoster }}
            />
          ) : (
            <div>
              {exceptions.map(ex => {
                const content = (
                  <>
                    <span className={`fams-dot fams-dot-${ex.type}`} />
                    <span className="text-[var(--text)] leading-snug">{ex.text}</span>
                  </>
                );

                if (ex.id === 'corrections') {
                  return (
                    <Link key={ex.id} to="/corrections" className="fams-exception-btn">
                      {content}
                    </Link>
                  );
                }

                if (ex.action) {
                  return (
                    <button key={ex.id} type="button" onClick={ex.action} className="fams-exception-btn">
                      {content}
                    </button>
                  );
                }

                return (
                  <div key={ex.id} className="fams-exception">
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </DataPanel>

        <DataPanel title="Shift status" className="lg:col-span-1" data-tour="shift-status">
          {!activeShift ? (
            <EmptyState
              title="No shift configured"
              description="Configure shifts to track capacity and variance."
              action={isAdmin ? { label: 'Open settings', to: '/settings' } : undefined}
            />
          ) : (
            <dl className="divide-y divide-[var(--border)]">
              {[
                { label: 'Expected capacity', value: activeShift.capacity },
                { label: 'Present on shift', value: activeShift.present },
                { label: 'Variance', value: shiftVariance != null ? (shiftVariance >= 0 ? `+${shiftVariance}` : shiftVariance) : '—' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between px-4 py-3 text-[13px]">
                  <dt className="text-[var(--muted)]">{row.label}</dt>
                  <dd className="font-semibold fams-mono">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </DataPanel>

        <DataPanel title="Recent events" className="lg:col-span-1 lg:row-span-1" data-tour="panel-activity">
          {!dashboard?.recentActivity?.length ? (
            <EmptyState
              title="No events yet today"
              description="Check-ins and breaks will appear here as workers scan."
              action={{ label: 'Refresh', onClick: fetchAll }}
            />
          ) : (
            <table className="fams-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Action</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentActivity.slice(0, 6).map((a: any, i: number) => (
                  <tr key={i}>
                    <td className="font-medium">{a.worker}</td>
                    <td className="text-[var(--muted)]">{a.action}</td>
                    <td className="fams-mono text-[12px]">{a.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataPanel>
      </div>

      <DataPanel
        id="workforce-roster"
        title="Workforce roster"
        action={
          <span className="text-[12px] text-[var(--muted)] fams-mono">
            {filtered.length} of {workers.length}
          </span>
        }
        data-tour="worker-table"
      >
        <DataTable
          columns={rosterColumns}
          data={filtered}
          rowKey={row => row.id}
          loading={loading && workers.length === 0}
          emptyTitle="No workers match filters"
          emptyDescription={statusFilter !== 'all' || search ? 'Clear filters to see the full roster.' : undefined}
          search={{
            value: search,
            onChange: setSearch,
            placeholder: 'Search name, ID, department…',
            'data-tour': 'input-search',
          }}
          toolbar={
            <>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                data-tour="filter-bar"
                className="fams-input w-full sm:w-auto sm:min-w-[140px]"
              >
                <option value="all">All statuses</option>
                <option value="checked-in">Checked in</option>
                <option value="on-break">On break (all)</option>
                <option value="tea-break">Tea break</option>
                <option value="lunch-break">Lunch break</option>
                <option value="checked-out">Checked out</option>
                <option value="absent">Absent</option>
              </select>
              {(search || statusFilter !== 'all') && (
                <button
                  type="button"
                  className="fams-btn fams-btn-ghost"
                  onClick={() => { setSearch(''); setStatusFilter('all'); }}
                >
                  Clear filters
                </button>
              )}
            </>
          }
          footer={`${filtered.length} of ${workers.length} workers`}
        />
      </DataPanel>
    </PageShell>
  );
}
