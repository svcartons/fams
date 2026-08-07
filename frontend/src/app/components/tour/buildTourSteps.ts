import type { TourStep } from './tourSteps';
import { adminSteps, supervisorSteps } from './tourSteps';

const PAYROLL_STEP_IDS = new Set([
  'salary-month',
  'btn-download-payroll',
  'payroll-table',
  'payroll-override',
]);

export function buildTourSteps(options: {
  isAdmin: boolean;
  payrollAllowed?: boolean;
  canApproveCorrections?: boolean;
}): TourStep[] {
  if (options.isAdmin) return adminSteps;

  return supervisorSteps.filter(step => {
    if (step.tourId === 'btn-grant-access') return false;
    if (
      !options.canApproveCorrections &&
      (step.tourId === 'btn-approve' || step.tourId === 'btn-reject')
    ) {
      return false;
    }
    if (options.payrollAllowed === false && PAYROLL_STEP_IDS.has(step.id)) {
      return false;
    }
    return true;
  });
}
