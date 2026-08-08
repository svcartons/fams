import { Download, Edit2, Check, X, ChevronDown, ChevronUp, Lock, Unlock } from 'lucide-react';
import { useState, useEffect, Fragment } from 'react';
import { toast } from 'sonner';
import {
  getSalaryReport,
  updateWorker,
  getSettings,
  saveSalaryOverride,
  clearSalaryOverride,
  createPayrollExport,
  downloadPayrollExport,
  unfinalizePayrollExport,
  type SalaryRecord,
} from '../../api/client';
import { useAuth } from '../hooks/useAuth';
import { PageShell, DataPanel, EmptyState } from './layout/PageShell';
import { PrintButton } from './ui/PrintButton';

type DayOverrideEdit = {
  employeeCode: string;
  date: string;
  regularHours: string;
  overtimeHours: string;
  reason: string;
};

function currencySymbol(code?: string) {
  if (code === 'USD') return '$';
  if (code === 'EUR') return '€';
  if (code === 'GBP') return '£';
  return '₹';
}

export function SalaryCalculator({ embedded = false }: { embedded?: boolean }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [totalPayout, setTotalPayout] = useState(0);
  const [totalTax, setTotalTax] = useState(0);
  const [totalNet, setTotalNet] = useState(0);
  const [incompleteDayCount, setIncompleteDayCount] = useState(0);
  const [currency, setCurrency] = useState('INR');
  const [finalized, setFinalized] = useState(false);
  const [finalizedExportId, setFinalizedExportId] = useState<string | null>(null);
  const [canExport, setCanExport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRate, setEditingRate] = useState<string>('');
  const [editingOtId, setEditingOtId] = useState<string | null>(null);
  const [editingOtRate, setEditingOtRate] = useState<string>('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingDay, setEditingDay] = useState<DayOverrideEdit | null>(null);

  const [isUpdating, setIsUpdating] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const { user } = useAuth();
  const sym = currencySymbol(currency);

  useEffect(() => {
    getSettings()
      .then((s) => {
        if (user?.role !== 'admin' && s.perm_supervisor_salary_view === 'false') {
          setHasPermission(false);
        } else {
          setHasPermission(true);
        }
        setCurrency(s.payroll_currency || 'INR');
        setCanExport(user?.role === 'admin' || s.perm_supervisor_export_payroll === 'true');
      })
      .catch(() => {
        if (user?.role !== 'admin') setHasPermission(false);
        else setHasPermission(true);
      });
  }, [user?.role]);

  const fetchData = async (month: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSalaryReport(month);
      setRecords(data.records);
      setTotalPayout(data.totalPayout);
      setTotalTax(data.totalTax ?? data.records.reduce((s, r) => s + (r.tax ?? 0), 0));
      setTotalNet(data.totalNet ?? data.records.reduce((s, r) => s + (r.net ?? r.salary), 0));
      setIncompleteDayCount(data.incompleteDayCount ?? 0);
      setFinalized(!!data.finalized);
      setFinalizedExportId(data.finalizedExportId ?? null);
      if (data.currency) setCurrency(data.currency);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load salary report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasPermission === true) {
      fetchData(selectedMonth);
    }
  }, [selectedMonth, hasPermission]);

  const handleExportFinalize = async () => {
    if (!canExport) {
      toast.error('You do not have permission to export payroll');
      return;
    }
    if (incompleteDayCount > 0) {
      const proceed = confirm(
        `${incompleteDayCount} incomplete day(s) in this month. Export and finalize anyway?`,
      );
      if (!proceed) return;
    }
    setExporting(true);
    try {
      const created = await createPayrollExport({
        month: selectedMonth,
        period: selectedMonth,
        format: 'csv',
        finalize: true,
      });
      await downloadPayrollExport(created.id);
      toast.success('Payroll exported and finalized');
      await fetchData(selectedMonth);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to export payroll');
    } finally {
      setExporting(false);
    }
  };

  const handleUnfinalize = async () => {
    if (!finalizedExportId || user?.role !== 'admin') return;
    if (!confirm('Unfinalize this pay period? Overrides and wage edits will be allowed again.')) return;
    try {
      await unfinalizePayrollExport(finalizedExportId);
      toast.success('Pay period unlocked');
      await fetchData(selectedMonth);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to unfinalize');
    }
  };

  const handleStartEditRate = (record: SalaryRecord) => {
    if (finalized) {
      toast.error('This month is finalized. Unfinalize before changing daily wages.');
      return;
    }
    setEditingOtId(null);
    setEditingId(record.employeeCode);
    setEditingRate(record.dailyWage.toString());
  };

  const handleSaveRate = async (employeeCode: string) => {
    setIsUpdating(true);
    try {
      if (!editingRate || isNaN(parseFloat(editingRate))) throw new Error('Invalid wage');
      const rate = parseFloat(editingRate);
      await updateWorker(employeeCode, { dailyWage: rate } as any);
      await fetchData(selectedMonth);
      setEditingId(null);
      toast.success('Daily wage updated');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update rate');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStartEditOtRate = (record: SalaryRecord) => {
    if (finalized) {
      toast.error('This month is finalized. Unfinalize before changing overtime rates.');
      return;
    }
    setEditingId(null);
    setEditingOtId(record.employeeCode);
    setEditingOtRate((record.overtimeRate ?? 0).toString());
  };

  const handleSaveOtRate = async (employeeCode: string) => {
    setIsUpdating(true);
    try {
      if (editingOtRate === '' || isNaN(parseFloat(editingOtRate))) throw new Error('Invalid OT rate');
      const rate = parseFloat(editingOtRate);
      await updateWorker(employeeCode, { overtimeRate: rate } as any);
      await fetchData(selectedMonth);
      setEditingOtId(null);
      toast.success('Overtime rate updated — OT pay uses this profile rate');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update OT rate');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveOverride = async () => {
    if (!editingDay) return;
    try {
      setIsUpdating(true);
      const reg = parseFloat(editingDay.regularHours);
      const ot = parseFloat(editingDay.overtimeHours);
      if (isNaN(reg) || isNaN(ot)) throw new Error('Invalid hours');

      await saveSalaryOverride({
        employeeCode: editingDay.employeeCode,
        date: editingDay.date,
        regularHours: reg,
        overtimeHours: ot,
        reason: editingDay.reason.trim() || 'Manual adjustment in salary calculator',
      });

      toast.success('Hours updated');
      await fetchData(selectedMonth);
      setEditingDay(null);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save override');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClearOverride = async (employeeCode: string, date: string) => {
    if (finalized) {
      toast.error('This month is finalized. Unfinalize before clearing overrides.');
      return;
    }
    try {
      setIsUpdating(true);
      await clearSalaryOverride({ employeeCode, date });
      toast.success('Override cleared');
      await fetchData(selectedMonth);
      setEditingDay(null);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to clear override');
    } finally {
      setIsUpdating(false);
    }
  };

  if (hasPermission === null) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--background)]">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (hasPermission === false) {
    const denied = (
      <EmptyState
        title="Access restricted"
        description="You do not have permission to view payroll data."
        action={{ label: 'View attendance reports', to: '/reports?tab=attendance' }}
      />
    );
    if (embedded) return denied;
    return <PageShell title="Salary">{denied}</PageShell>;
  }

  const toolbar = (
    <div className="flex flex-wrap gap-2 mb-4 items-center">
      <input
        type="month"
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
        data-tour="salary-month"
        className="fams-input w-auto"
      />
      {canExport && (
        <button
          type="button"
          id="btn-download-payroll"
          data-tour="btn-download-payroll"
          onClick={handleExportFinalize}
          disabled={exporting}
          className="fams-btn fams-btn-primary"
        >
          <Download className="w-3.5 h-3.5" /> {exporting ? 'Exporting…' : 'Export & finalize CSV'}
        </button>
      )}
      {finalized && user?.role === 'admin' && finalizedExportId && (
        <button type="button" onClick={handleUnfinalize} className="fams-btn fams-btn-outline">
          <Unlock className="w-3.5 h-3.5" /> Unfinalize
        </button>
      )}
      <PrintButton />
      {finalized && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--warning)] px-2.5 py-1 border border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] rounded-md bg-[color-mix(in_srgb,var(--warning)_8%,white)]">
          <Lock className="w-3.5 h-3.5" /> Finalized
        </span>
      )}
    </div>
  );

  const totalRegHours = records.reduce((s, r) => s + (r.totalRegularHours ?? 0), 0);

  const content = (
    <>
      {toolbar}
      {incompleteDayCount > 0 && (
        <div className="fams-alert fams-alert-warning mb-4" role="status">
          {incompleteDayCount} incomplete day(s) this month (checked in without checkout). Review before finalizing.
        </div>
      )}
      <div className="fams-stat-bar mb-4">
        <div className="fams-stat-cell">
          <p className="fams-stat-value text-lg">{loading ? '—' : records.length}</p>
          <p className="fams-stat-label">Workers</p>
        </div>
        <div className="fams-stat-cell">
          <p className="fams-stat-value text-lg">{loading ? '—' : totalRegHours.toFixed(1)}</p>
          <p className="fams-stat-label">Regular hrs</p>
        </div>
        <div className="fams-stat-cell">
          <p className="fams-stat-value text-lg">
            {loading ? '—' : records.reduce((s, r) => s + r.overtimeHours, 0).toFixed(1)}
          </p>
          <p className="fams-stat-label">OT hours</p>
        </div>
        <div className="fams-stat-cell">
          <p className="fams-stat-value text-lg fams-mono">
            {loading ? '—' : `${sym}${totalPayout.toLocaleString('en-IN')}`}
          </p>
          <p className="fams-stat-label">Gross</p>
        </div>
        <div className="fams-stat-cell">
          <p className="fams-stat-value text-lg fams-mono">
            {loading ? '—' : `${sym}${totalTax.toLocaleString('en-IN')}`}
          </p>
          <p className="fams-stat-label">Tax (flat %)</p>
        </div>
        <div className="fams-stat-cell">
          <p className="fams-stat-value text-lg fams-mono">
            {loading ? '—' : `${sym}${totalNet.toLocaleString('en-IN')}`}
          </p>
          <p className="fams-stat-label">Net</p>
        </div>
      </div>

      <DataPanel id="payroll-table" data-tour="payroll-table">
        <div className="overflow-x-auto">
          <table className="fams-table">
            <thead>
              <tr>
                <th className="w-10" />
                <th>Worker</th>
                <th>Regular hrs</th>
                <th>Daily wage / base</th>
                <th>OT (profile ₹/hr)</th>
                <th>Gross</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-[var(--danger)]">
                    {error}
                  </td>
                </tr>
              ) : loading && records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-[var(--muted)]">
                    Calculating payroll…
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-[var(--muted)]">
                    No records for this month
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <Fragment key={record.employeeCode}>
                    <tr className={expandedId === record.employeeCode ? 'bg-[var(--gray-50)]' : ''}>
                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(expandedId === record.employeeCode ? null : record.employeeCode)
                          }
                          className="fams-btn fams-btn-outline px-1.5 py-1"
                        >
                          {expandedId === record.employeeCode ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td>
                        <p className="font-medium">{record.name}</p>
                        <p className="fams-mono text-[11px] text-[var(--muted)]">{record.employeeCode}</p>
                      </td>
                      <td className="fams-mono">{(record.totalRegularHours ?? 0).toFixed(1)}</td>
                      <td>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 group">
                            {editingId === record.employeeCode && user?.role === 'admin' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[var(--muted)] text-[11px]">/day</span>
                                <span className="text-[var(--muted)]">{sym}</span>
                                <input
                                  type="number"
                                  className="fams-input w-20 text-right py-1"
                                  value={editingRate}
                                  onChange={(e) => setEditingRate(e.target.value)}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRate(record.employeeCode)}
                                  disabled={isUpdating}
                                  className="text-[var(--success)]"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  disabled={isUpdating}
                                  className="text-[var(--danger)]"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="font-medium fams-mono">
                                  {sym}
                                  {record.baseSalary.toLocaleString('en-IN')}
                                </span>
                                {user?.role === 'admin' && !finalized && (
                                  <button
                                    type="button"
                                    title="Edit daily wage (₹/day)"
                                    onClick={() => handleStartEditRate(record)}
                                    className="opacity-0 group-hover:opacity-100 text-[var(--muted)]"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          <span className="text-[11px] text-[var(--muted)]">
                            {record.daysPresent} days · daily wage {sym}
                            {record.dailyWage.toLocaleString('en-IN')}/day
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col group">
                          {editingOtId === record.employeeCode && user?.role === 'admin' ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[var(--muted)] text-[11px]">/hr</span>
                              <span className="text-[var(--muted)]">{sym}</span>
                              <input
                                type="number"
                                className="fams-input w-20 text-right py-1"
                                value={editingOtRate}
                                onChange={(e) => setEditingOtRate(e.target.value)}
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveOtRate(record.employeeCode)}
                                disabled={isUpdating}
                                className="text-[var(--success)]"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingOtId(null)}
                                disabled={isUpdating}
                                className="text-[var(--danger)]"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="fams-mono">
                                {record.overtimeHours}h / {sym}
                                {record.overtimePay.toLocaleString('en-IN')}
                              </span>
                              {user?.role === 'admin' && !finalized && (
                                <button
                                  type="button"
                                  title="Edit overtime rate (₹/hr) from worker profile"
                                  onClick={() => handleStartEditOtRate(record)}
                                  className="opacity-0 group-hover:opacity-100 text-[var(--muted)]"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                          <span className="text-[11px] text-[var(--muted)]">
                            rate {sym}
                            {(record.overtimeRate ?? 0).toLocaleString('en-IN')}/hr
                          </span>
                        </div>
                      </td>
                      <td className="font-medium fams-mono">
                        {sym}
                        {record.salary.toLocaleString('en-IN')}
                      </td>
                      <td className="font-medium fams-mono">
                        {sym}
                        {(record.net ?? record.salary).toLocaleString('en-IN')}
                      </td>
                    </tr>

                    {expandedId === record.employeeCode && (
                      <tr>
                        <td colSpan={7} className="bg-[var(--gray-50)]">
                          <div className="p-4 border border-[var(--border)] bg-[var(--surface)]">
                            <h3 className="text-xs font-semibold text-[var(--muted)] uppercase mb-3">
                              Daily breakdown — shift hrs | OT hrs | pay
                            </h3>
                            <div
                              id="payroll-override"
                              data-tour="payroll-override"
                              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2"
                            >
                              {record.dailyBreakdown.map((day) => (
                                <div
                                  key={day.date}
                                  className={`p-2 border text-left text-xs ${
                                    day.isOverridden
                                      ? 'border-[var(--warning)] bg-[var(--gray-50)]'
                                      : day.status === 'incomplete'
                                        ? 'border-[var(--danger)]'
                                        : 'border-[var(--border)]'
                                  }`}
                                >
                                  <p className="text-[10px] text-[var(--muted)] mb-1">
                                    {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
                                      day: 'numeric',
                                      month: 'short',
                                    })}
                                    {day.status === 'incomplete' && (
                                      <span className="ml-1 text-[var(--danger)]">• incomplete</span>
                                    )}
                                  </p>

                                  {editingDay?.employeeCode === record.employeeCode &&
                                  editingDay?.date === day.date &&
                                  user?.role === 'admin' ? (
                                    <div className="flex flex-col gap-1">
                                      <label className="text-[10px] text-[var(--muted)]">Regular</label>
                                      <input
                                        type="number"
                                        value={editingDay.regularHours}
                                        onChange={(e) =>
                                          setEditingDay({ ...editingDay, regularHours: e.target.value })
                                        }
                                        className="fams-input w-full text-center py-0.5"
                                        autoFocus
                                      />
                                      <label className="text-[10px] text-[var(--muted)]">OT</label>
                                      <input
                                        type="number"
                                        value={editingDay.overtimeHours}
                                        onChange={(e) =>
                                          setEditingDay({ ...editingDay, overtimeHours: e.target.value })
                                        }
                                        className="fams-input w-full text-center py-0.5"
                                      />
                                      <label className="text-[10px] text-[var(--muted)]">Reason</label>
                                      <input
                                        type="text"
                                        value={editingDay.reason}
                                        onChange={(e) =>
                                          setEditingDay({ ...editingDay, reason: e.target.value })
                                        }
                                        className="fams-input w-full text-left py-0.5"
                                        placeholder="Required for audit"
                                      />
                                      <div className="flex gap-2 mt-1 justify-center">
                                        <button
                                          type="button"
                                          onClick={handleSaveOverride}
                                          disabled={isUpdating}
                                          className="text-[var(--success)]"
                                        >
                                          <Check className="w-3 h-3" />
                                        </button>
                                        {day.isOverridden && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleClearOverride(record.employeeCode, day.date)
                                            }
                                            disabled={isUpdating}
                                            className="text-[11px] text-[var(--danger)]"
                                          >
                                            Clear
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => setEditingDay(null)}
                                          disabled={isUpdating}
                                          className="text-[var(--danger)]"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      onClick={() =>
                                        user?.role === 'admin' &&
                                        !finalized &&
                                        setEditingDay({
                                          employeeCode: record.employeeCode,
                                          date: day.date,
                                          regularHours: day.regularHours.toString(),
                                          overtimeHours: day.overtimeHours.toString(),
                                          reason: '',
                                        })
                                      }
                                      className={`${user?.role === 'admin' && !finalized ? 'cursor-pointer hover:bg-[var(--gray-50)]' : ''}`}
                                    >
                                      <p className="fams-mono">
                                        <span className={day.isOverridden ? 'text-[var(--warning)]' : ''}>
                                          {day.regularHours}h
                                        </span>
                                        {' | '}
                                        <span className={day.overtimeHours > 0 ? 'text-[var(--accent)]' : ''}>
                                          {day.overtimeHours}h OT
                                        </span>
                                      </p>
                                      <p className="text-[10px] text-[var(--muted)] mt-0.5">
                                        {sym}
                                        {day.dayPay.toLocaleString('en-IN')}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            <p className="mt-3 text-[11px] text-[var(--muted)]">
                              {finalized
                                ? 'Period is finalized — unfinalize to edit overrides or wages.'
                                : user?.role === 'admin'
                                  ? 'Click a day to override regular and OT hours (include a reason).'
                                  : 'Submit a manual correction for admin approval to fix missing hours.'}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DataPanel>
    </>
  );

  if (embedded) return content;
  return (
    <PageShell title="Salary" description="Monthly salary summary with per-day shift and OT breakdown.">
      {content}
    </PageShell>
  );
}
