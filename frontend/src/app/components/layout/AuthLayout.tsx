import { ReactNode } from 'react';
import { CircleHelp, ShieldCheck } from 'lucide-react';

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  siteName?: string | null;
};

export function AuthShell({ title, subtitle, children, footer, siteName }: AuthShellProps) {
  return (
    <main className="fams-auth-shell">
      <section className="fams-auth-frame" aria-label="FAMS account access">
        <header className="fams-auth-identity">
          <div className="fams-auth-mark" aria-hidden="true">F</div>
          <div>
            <p className="fams-auth-product">FAMS</p>
            <p className="fams-auth-site">{siteName || 'Factory Attendance Management'}</p>
          </div>
          <span className="fams-auth-connection"><span aria-hidden="true" />Secure access</span>
        </header>

        <div className="fams-auth-card">
          <div className="fams-auth-card-head">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="fams-auth-card-body">{children}</div>
        </div>

        {footer && <div className="fams-auth-footer">{footer}</div>}

        <div className="fams-auth-help" aria-label="Support information">
          <ShieldCheck aria-hidden="true" />
          <span>Sign-in activity is recorded for security.</span>
          <span className="fams-auth-help-separator" aria-hidden="true" />
          <CircleHelp aria-hidden="true" />
          <span>Contact your FAMS administrator for access.</span>
        </div>
      </section>
    </main>
  );
}

export const AuthLayout = AuthShell;

export function AuthField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fams-field fams-auth-field">
      <label className="fams-field-label">{label}</label>
      {children}
    </div>
  );
}

export function AuthInput({
  icon: Icon,
  suffix,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon?: React.ComponentType<{ className?: string }>;
  suffix?: ReactNode;
}) {
  return (
    <div className="fams-auth-input-wrap">
      {Icon && <Icon className="fams-auth-input-icon" aria-hidden="true" />}
      <input
        className={`fams-input fams-auth-input ${Icon ? 'has-icon' : ''} ${suffix ? 'has-suffix' : ''} ${className}`}
        {...props}
      />
      {suffix && <div className="fams-auth-input-suffix">{suffix}</div>}
    </div>
  );
}

export function AuthNotice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger';
  children: ReactNode;
}) {
  return <div className={`fams-auth-notice fams-auth-notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>;
}

export function AuthSubmit({ loading, children, disabled }: { loading?: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="submit" disabled={loading || disabled} className="fams-btn fams-btn-primary fams-auth-submit w-full">
      {loading ? 'Signing in...' : children}
    </button>
  );
}
