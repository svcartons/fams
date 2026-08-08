import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { AuthLayout, AuthNotice } from './layout/AuthLayout';

export function ForgotPassword() {
  const navigate = useNavigate();

  return (
    <AuthLayout
      title="Account recovery"
      subtitle="Recovery is handled through an approved administrator process."
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
      <AuthNotice>
        Contact your FAMS administrator to request a password reset. Security-question recovery is disabled, and every reset is recorded in the audit log.
      </AuthNotice>
    </AuthLayout>
  );
}
