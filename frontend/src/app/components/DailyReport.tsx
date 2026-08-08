import { Download } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { getDailyReport, type DailyRecord } from '../../api/client';
import { PageShell, DataPanel } from './layout/PageShell';
import { DataTable, type DataTableColumn } from './ui/DataTable';
import { downloadCsv } from './ui/csv';
import { PrintButton } from './ui/PrintButton';
import { PercentageRing } from './ui/PercentageRing';

export function DailyReport({ embedded = false }: { embedded?: boolean }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [summary, setSummary] = useState({
    total: 0, complete: 0, incomplete: 0, absent: 0, present: 0, attendancePct: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (date: string) => {
    try {
      setLoading(true);
      const data = await getDailyReport(date);
      setRecords(data.records);
      setSummary({
        total: data.summary.total,
        complete: data.summary.complete,
        incomplete: data.summary.incomplete,
        absent: data.summary.absent,
        present: data.summary.present ?? (data.summary.total - data.summary.absent),
        attendancePct: data.summary.attendancePct ?? (
          data.summary.total > 0
            ? parseFloat((((data.summary.total - data.summary.absent) / data.summary.total) * 100).toFixed(1))
            : 0
        ),
      });
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load daily report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(selectedDate); }, [selectedDate]);

  const columns: DataTableColumn<DailyRecord>[] = useMemo(() => [
    {
      id: 'worker',
      header: 'Worker',
      sortable: true,
      sortValue: row => row.name,
      render: row => (
        <>
          <p className="font-medium">{row.name}</p>
          <p className="fams-mono text-[11px] text-[var(--muted)]">{row.employeeCode}</p>
        </>
      ),
    },
    {
      id: 'dept',
      header: 'Dept',
      sortable: true,
      sortValue: row => row.department,
      render: row => <span className="text-[var(--muted)]">{row.department}</span>,
    },
    { id: 'in', header: 'In', mono: true, sortable: true, sortValue: row => row.checkIn, render: row => row.checkIn },
    { id: 'out', header: 'Out', mono: true, sortable: true, sortValue: row => row.checkOut, render: row => row.checkOut },
    { id: 'presence', header: 'Presence', sortable: true, sortValue: row => row.totalPresence, render: row => row.totalPresence },
    { id: 'net', header: 'Net work', sortable: true, sortValue: row => row.netWork, render: row => <span className="font-medium">{row.netWork}</span> },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      sortValue: row => row.status,
      render: row => <span className="capitalize text-[12px]">{row.status}</span>,
    },
  ], []);

  const handleExportCSV = () => {
    downloadCsv(
      `attendance-report-${selectedDate}.csv`,
      ['Worker ID', 'Name', 'Department', 'Check In', 'Tea Break', 'Lunch Break', 'Check Out', 'Total Presence', 'Net Work', 'Status'],
      records.map(r => [
        r.employeeCode, r.name, r.department, r.checkIn, r.teaBreak,
        r.lunchBreak, r.checkOut, r.totalPresence, r.netWork, r.status,
      ]),
    );
  };

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <div id="report-calendar" data-tour="report-calendar">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="fams-input"
          style={{ width: 'calc(10.5rem + 2px)' }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          id="btn-download-csv"
          data-tour="btn-export-csv"
          onClick={handleExportCSV}
          className="fams-btn fams-btn-primary"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
        <PrintButton />
      </div>
    </div>
  );

  const content = error ? (
    <div className="fams-card p-6 text-center">
      <p className="text-[13px] text-[var(--danger)] mb-3">{error}</p>
      <button type="button" onClick={() => fetchData(selectedDate)} className="fams-btn fams-btn-outline">Retry</button>
    </div>
  ) : (
    <>
      {toolbar}

      <div data-tour="report-summary" className="fams-stat-bar mb-4 items-center">
        <div className="fams-stat-cell flex flex-row items-center gap-3 !py-3">
          <PercentageRing pct={loading ? 0 : summary.attendancePct} size={72} stroke={6} label="present" />
          <div>
            <p className="fams-stat-value text-lg">{loading ? '—' : `${summary.attendancePct}%`}</p>
            <p className="fams-stat-label">Attendance rate</p>
          </div>
        </div>
        {[
          { label: 'Total', value: loading ? '—' : summary.total },
          { label: 'Complete', value: loading ? '—' : summary.complete },
          { label: 'Incomplete', value: loading ? '—' : summary.incomplete },
          { label: 'Absent', value: loading ? '—' : summary.absent },
        ].map(s => (
          <div key={s.label} className="fams-stat-cell">
            <p className="fams-stat-value text-lg">{s.value}</p>
            <p className="fams-stat-label">{s.label}</p>
          </div>
        ))}
      </div>

      <DataPanel id="report-timeline" data-tour="report-table">
        <DataTable
          columns={columns}
          data={records}
          rowKey={row => row.employeeCode}
          loading={loading}
          emptyTitle="No records for this date"
          footer={`${records.length} worker${records.length === 1 ? '' : 's'}`}
        />
      </DataPanel>
    </>
  );

  if (embedded) return <>{content}</>;
  return (
    <PageShell title="Daily report" description={`Attendance records for ${selectedDate}.`}>
      {content}
    </PageShell>
  );
}
