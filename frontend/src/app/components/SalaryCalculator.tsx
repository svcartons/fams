import { Download, Edit2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useEffect, Fragment } from 'react';
import { toast } from 'sonner';
import { getSalaryReport, updateWorker, getSettings, saveSalaryOverride, type SalaryRecord } from '../../api/client';
import { useAuth } from '../hooks/useAuth';
import { PageShell, DataPanel, EmptyState } from './layout/PageShell';
import { downloadCsv } from './ui/csv';
import { PrintButton } from './ui/PrintButton';

type DayOverrideEdit = {
  employeeCode: string;
  date: string;
  regularHours: string;
  overtimeHours: string;
};

export function SalaryCalculator({ embedded = false }: { embedded?: boolean }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [totalPayout, setTotalPayout] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRate, setEditingRate] = useState<string>('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingDay, setEditingDay] = useState<DayOverrideEdit | null>(null);

  const [isUpdating, setIsUpdating] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    getSettings()
      .then(s => {
        if (user?.role !== 'admin' && s.perm_supervisor_salary_view === 'false') {
          setHasPermission(false);
        } else {
          setHasPermission(true);
        }
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

  const handleExportCSV = () => {
    downloadCsv(
      `salary-report-${selectedMonth}.csv`,
      ['Worker ID', 'Name', 'Department', 'Role', 'Days Present', 'Regular Hours', 'Base Salary (₹)', 'Overtime Hours', 'Overtime Pay (₹)', 'Total Payout (₹)'],
      records.map(r => [
        r.employeeCode, r.name, r.department, r.role, r.daysPresent,
        r.totalRegularHours ?? 0, r.baseSalary, r.overtimeHours, r.overtimePay, r.salary,
      ]),
    );
  };

  const handleStartEditRate = (record: SalaryRecord) => {
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
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update rate');
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
        reason: 'Manual adjustment in salary calculator',
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
    <div className="flex flex-wrap gap-2 mb-4">
      <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} data-tour="salary-month" className="fams-input w-auto" />
      <button type="button" id="btn-download-payroll" data-tour="btn-download-payroll" onClick={handleExportCSV} className="fams-btn fams-btn-primary">
        <Download className="w-3.5 h-3.5" /> Export CSV
      </button>
      <PrintButton />
    </div>
  );

  const totalRegHours = records.reduce((s, r) => s + (r.totalRegularHours ?? 0), 0);

  const content = (
    <>
      {toolbar}
      <div className="fams-stat-bar mb-4">
        <div className="fams-stat-cell"><p className="fams-stat-value text-lg">{loading ? '—' : records.length}</p><p className="fams-stat-label">Workers</p></div>
        <div className="fams-stat-cell"><p className="fams-stat-value text-lg">{loading ? '—' : totalRegHours.toFixed(1)}</p><p className="fams-stat-label">Regular hrs</p></div>
        <div className="fams-stat-cell"><p className="fams-stat-value text-lg">{loading ? '—' : records.reduce((s, r) => s + r.overtimeHours, 0).toFixed(1)}</p><p className="fams-stat-label">OT hours</p></div>
        <div className="fams-stat-cell"><p className="fams-stat-value text-lg fams-mono">{loading ? '—' : `₹${totalPayout.toLocaleString('en-IN')}`}</p><p className="fams-stat-label">Total payout</p></div>
      </div>
      <DataPanel id="payroll-table" data-tour="payroll-table">
        <div className="overflow-x-auto">
          <table className="fams-table">
            <thead>
              <tr>
                <th className="w-10" />
                <th>Worker</th>
                <th>Regular hrs</th>
                <th>Base salary</th>
                <th>OT hours</th>
                <th>OT pay</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-[var(--danger)]">{error}</td></tr>
              ) : loading && records.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-[var(--muted)]">Calculating payroll…</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-[var(--muted)]">No records for this month</td></tr>
              ) : records.map((record) => (
                <Fragment key={record.employeeCode}>
                  <tr className={expandedId === record.employeeCode ? 'bg-[var(--gray-50)]' : ''}>
                    <td>
                      <button type="button" onClick={() => setExpandedId(expandedId === record.employeeCode ? null : record.employeeCode)} className="fams-btn fams-btn-outline px-1.5 py-1">
                        {expandedId === record.employeeCode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
                              <span className="text-[var(--muted)]">₹</span>
                              <input type="number" className="fams-input w-20 text-right py-1" value={editingRate} onChange={e => setEditingRate(e.target.value)} autoFocus />
                              <button type="button" onClick={() => handleSaveRate(record.employeeCode)} disabled={isUpdating} className="text-[var(--success)]"><Check className="w-4 h-4" /></button>
                              <button type="button" onClick={() => setEditingId(null)} disabled={isUpdating} className="text-[var(--danger)]"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <>
                              <span className="font-medium fams-mono">₹{record.baseSalary.toLocaleString('en-IN')}</span>
                              {user?.role === 'admin' && (
                                <button type="button" onClick={() => handleStartEditRate(record)} className="opacity-0 group-hover:opacity-100 text-[var(--muted)]"><Edit2 className="w-3 h-3" /></button>
                              )}
                            </>
                          )}
                        </div>
                        <span className="text-[11px] text-[var(--muted)]">{record.daysPresent} days present</span>
                      </div>
                    </td>
                    <td className="fams-mono">{record.overtimeHours} hrs</td>
                    <td className="fams-mono">₹{record.overtimePay.toLocaleString('en-IN')}</td>
                    <td className="font-medium fams-mono">₹{record.salary.toLocaleString('en-IN')}</td>
                  </tr>

                  {expandedId === record.employeeCode && (
                    <tr>
                      <td colSpan={7} className="bg-[var(--gray-50)]">
                        <div className="p-4 border border-[var(--border)] bg-[var(--surface)]">
                          <h3 className="text-xs font-semibold text-[var(--muted)] uppercase mb-3">Daily breakdown — shift hrs | OT hrs | pay</h3>
                          <div id="payroll-override" data-tour="payroll-override" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {record.dailyBreakdown.map(day => (
                              <div
                                key={day.date}
                                className={`p-2 border text-left text-xs ${
                                  day.isOverridden ? 'border-[var(--warning)] bg-[var(--gray-50)]'
                                  : day.status === 'incomplete' ? 'border-[var(--danger)]'
                                  : 'border-[var(--border)]'
                                }`}
                              >
                                <p className="text-[10px] text-[var(--muted)] mb-1">
                                  {new Date(day.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                                  {day.status === 'incomplete' && <span className="ml-1 text-[var(--danger)]">• incomplete</span>}
                                </p>

                                {editingDay?.employeeCode === record.employeeCode && editingDay?.date === day.date && user?.role === 'admin' ? (
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-[var(--muted)]">Regular</label>
                                    <input
                                      type="number"
                                      value={editingDay.regularHours}
                                      onChange={(e) => setEditingDay({ ...editingDay, regularHours: e.target.value })}
                                      className="fams-input w-full text-center py-0.5"
                                      autoFocus
                                    />
                                    <label className="text-[10px] text-[var(--muted)]">OT</label>
                                    <input
                                      type="number"
                                      value={editingDay.overtimeHours}
                                      onChange={(e) => setEditingDay({ ...editingDay, overtimeHours: e.target.value })}
                                      className="fams-input w-full text-center py-0.5"
                                    />
                                    <div className="flex gap-2 mt-1 justify-center">
                                      <button type="button" onClick={handleSaveOverride} disabled={isUpdating} className="text-[var(--success)]"><Check className="w-3 h-3" /></button>
                                      <button type="button" onClick={() => setEditingDay(null)} disabled={isUpdating} className="text-[var(--danger)]"><X className="w-3 h-3" /></button>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    onClick={() => user?.role === 'admin' && setEditingDay({
                                      employeeCode: record.employeeCode,
                                      date: day.date,
                                      regularHours: day.regularHours.toString(),
                                      overtimeHours: day.overtimeHours.toString(),
                                    })}
                                    className={`${user?.role === 'admin' ? 'cursor-pointer hover:bg-[var(--gray-50)]' : ''}`}
                                  >
                                    <p className="fams-mono">
                                      <span className={day.isOverridden ? 'text-[var(--warning)]' : ''}>{day.regularHours}h</span>
                                      {' | '}
                                      <span className={day.overtimeHours > 0 ? 'text-[var(--accent)]' : ''}>{day.overtimeHours}h OT</span>
                                    </p>
                                    <p className="text-[10px] text-[var(--muted)] mt-0.5">₹{day.dayPay.toLocaleString('en-IN')}</p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          <p className="mt-3 text-[11px] text-[var(--muted)]">
                            {user?.role === 'admin'
                              ? 'Click a day to override regular and OT hours separately.'
                              : 'Submit a manual correction for admin approval to fix missing hours.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        </DataPanel>
    </>
  );

  if (embedded) return content;
  return <PageShell title="Salary" description="Monthly salary summary with per-day shift and OT breakdown.">{content}</PageShell>;
}
