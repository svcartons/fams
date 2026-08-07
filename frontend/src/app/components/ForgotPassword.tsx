import { useNavigate } from 'react-router';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { AuthLayout } from './layout/AuthLayout';

export function ForgotPassword() {
  const navigate = useNavigate();

  return (
    <AuthLayout
      title="Account recovery"
      subtitle="Password recovery requires an administrator approval."
      footer={(
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="fams-auth-link inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </button>
      )}
    >
      <div className="fams-alert fams-alert-info flex gap-3">
        <ShieldCheck className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-[var(--text)]">Contact your FAMS administrator</p>
          <p className="text-sm text-[var(--muted)] mt-1">
            Security-question recovery is disabled. An administrator can reset your password and the action will be recorded in the audit log.
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
