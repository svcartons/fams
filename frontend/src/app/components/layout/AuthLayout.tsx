import { ReactNode } from 'react';
import { Lock, Radio, ShieldCheck, FileSpreadsheet } from 'lucide-react';

const HIGHLIGHTS = [
  { icon: Radio, text: 'Real-time attendance tracking' },
  { icon: ShieldCheck, text: 'Audit-ready change history' },
  { icon: FileSpreadsheet, text: 'Payroll export in one click' },
] as const;

const STATS = [
  { value: '24/7', label: 'Live monitoring' },
  { value: '100%', label: 'Audit trail' },
  { value: '1-click', label: 'Payroll export' },
] as const;

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="fams-auth-split">
      <aside className="fams-auth-brand">
        <div className="fams-auth-brand-bg" aria-hidden="true">
          <div className="fams-auth-brand-orb fams-auth-brand-orb-1" />
          <div className="fams-auth-brand-orb fams-auth-brand-orb-2" />
          <div className="fams-auth-brand-ring fams-auth-brand-ring-1" />
          <div className="fams-auth-brand-ring fams-auth-brand-ring-2" />
          <div className="fams-auth-brand-ring fams-auth-brand-ring-3" />
          <div className="fams-auth-brand-mesh" />
        </div>

        <div className="fams-auth-brand-main">
          <div className="fams-auth-brand-top">
            <div className="fams-auth-brand-mark-wrap">
              <div className="fams-auth-brand-mark" aria-hidden="true">F</div>
            </div>
            <div>
              <p className="fams-auth-brand-logo">FAMS</p>
              <p className="fams-auth-brand-tagline">Factory Attendance Management</p>
            </div>
          </div>

          <h2 className="fams-auth-brand-headline">
            Run your floor with <span>confidence</span>
          </h2>

          <p className="fams-auth-brand-desc">
            Track shifts, manage workers, and export payroll-ready reports — all in one place for your plant team.
          </p>

          <div className="fams-auth-brand-stats">
            {STATS.map(stat => (
              <div key={stat.label} className="fams-auth-brand-stat">
                <p className="fams-auth-brand-stat-value">{stat.value}</p>
                <p className="fams-auth-brand-stat-label">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="fams-auth-brand-highlights">
            <p className="fams-auth-brand-highlights-label">What you get</p>
            <ul className="fams-auth-brand-list">
              {HIGHLIGHTS.map(item => {
                const Icon = item.icon;
                return (
                  <li key={item.text}>
                    <span className="fams-auth-brand-check" aria-hidden="true">
                      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                    </span>
                    <span>{item.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <p className="fams-auth-brand-footer">
          <span className="fams-auth-brand-footer-badge">
            <Lock className="w-3 h-3" strokeWidth={2} aria-hidden="true" />
            Internal use only
          </span>
        </p>
      </aside>

      <main className="fams-auth-panel">
        <div className="fams-auth-form-wrap">
          <div className="fams-auth-form-header lg:hidden">
            <div className="fams-auth-brand-mark fams-auth-brand-mark-sm" aria-hidden="true">F</div>
            <p className="fams-auth-brand-logo">FAMS</p>
            <p className="fams-auth-form-header-sub">Factory Attendance Management</p>
          </div>

          <div className="fams-auth-box">
            <div className="fams-auth-form-head">
              <h1 className="fams-auth-form-title">{title}</h1>
              <p className="fams-auth-form-subtitle">{subtitle}</p>
            </div>
            {children}
          </div>

          {footer && <div className="fams-auth-form-footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

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
      {Icon && (
        <Icon className="fams-auth-input-icon" />
      )}
      <input
        className={`fams-input fams-auth-input ${Icon ? 'has-icon' : ''} ${suffix ? 'has-suffix' : ''} ${className}`}
        {...props}
      />
      {suffix && <div className="fams-auth-input-suffix">{suffix}</div>}
    </div>
  );
}

export function AuthSubmit({
  loading,
  children,
  disabled,
}: {
  loading?: boolean;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="fams-btn fams-btn-primary fams-auth-submit w-full"
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}
