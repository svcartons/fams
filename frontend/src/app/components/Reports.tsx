import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { PageShell } from './layout/PageShell';
import { DailyReport } from './DailyReport';
import { SalaryCalculator } from './SalaryCalculator';
import { PrintButton } from './ui/PrintButton';
import { usePayrollPermission } from '../hooks/usePayrollPermission';
import { useAuth } from '../hooks/useAuth';

const TABS = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'payroll', label: 'Salary' },
] as const;

export function Reports() {
  const [params, setParams] = useSearchParams();
  const payrollAllowed = usePayrollPermission();
  const { isAdmin } = useAuth();
  const tab = (params.get('tab') === 'payroll' ? 'payroll' : 'attendance') as 'attendance' | 'payroll';

  useEffect(() => {
    if (payrollAllowed === false && tab === 'payroll') {
      setParams({ tab: 'attendance' }, { replace: true });
    }
  }, [payrollAllowed, tab, setParams]);

  const visibleTabs = payrollAllowed === false
    ? TABS.filter(t => t.id === 'attendance')
    : TABS;

  const printSubtitle = tab === 'payroll'
    ? 'Salary summary'
    : 'Daily attendance report';

  return (
    <PageShell
      title="Reports"
      description={
        isAdmin
          ? 'Export attendance records and payroll summaries for accounting and compliance.'
          : payrollAllowed
            ? 'Export attendance and payroll records for your team.'
            : 'Export attendance records for your team.'
      }
      printTitle={`FAMS Reports — ${printSubtitle}`}
      actions={<PrintButton />}
    >
      {visibleTabs.length > 1 && (
        <div className="fams-tabs fams-no-print">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              type="button"
              data-active={tab === t.id}
              className="fams-tab"
              onClick={() => setParams({ tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {payrollAllowed === null && tab === 'payroll' ? (
        <div className="py-12 text-center text-[13px] text-[var(--muted)]">Loading reports…</div>
      ) : tab === 'attendance' || payrollAllowed === false ? (
        <DailyReport embedded />
      ) : (
        <SalaryCalculator embedded />
      )}
    </PageShell>
  );
}
