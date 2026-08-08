import { ReactNode } from 'react';
import { Link } from 'react-router';

interface PageShellProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  printTitle?: string;
}

export function PageShell({ title, description, actions, children, printTitle }: PageShellProps) {
  return (
    <div className="fams-page">
      <PrintHeader title={printTitle ?? title} subtitle={description} />
      <div className="fams-wrap">
        <header className="fams-page-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6 fams-no-print">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text)] tracking-tight">{title}</h1>
            {description && (
              <p className="text-[13px] text-[var(--muted)] mt-1 max-w-xl leading-relaxed">{description}</p>
            )}
          </div>
          {actions && <div className="fams-page-actions flex flex-wrap gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

export function DataPanel({
  title,
  action,
  children,
  className = '',
  'data-tour': dataTour,
  id,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  'data-tour'?: string;
  id?: string;
}) {
  return (
    <div id={id} data-tour={dataTour} className={`fams-card overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between fams-card-header">
          <span>{title}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load data',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="fams-page flex items-center justify-center p-8">
      <div className="fams-card p-8 max-w-sm text-center">
        <p className="font-semibold text-[var(--text)] mb-1">{title}</p>
        <p className="text-[13px] text-[var(--muted)] mb-5">{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="fams-btn fams-btn-primary">Retry</button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { label: string; onClick?: () => void; to?: string };
}) {
  return (
    <div className="py-10 text-center px-4">
      <p className="text-[13px] font-medium text-[var(--text)]">{title}</p>
      {description && <p className="text-[12px] text-[var(--muted)] mt-1">{description}</p>}
      {action && (
        action.to ? (
          <Link to={action.to} className="fams-btn fams-btn-outline mt-4 inline-flex">
            {action.label}
          </Link>
        ) : action.onClick ? (
          <button type="button" onClick={action.onClick} className="fams-btn fams-btn-outline mt-4">
            {action.label}
          </button>
        ) : null
      )}
    </div>
  );
}

function PrintHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="fams-print-header">
      <p className="text-lg font-semibold">{title}</p>
      {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
      <p className="text-[11px] fams-mono mt-2">
        Printed {new Date().toLocaleString('en-IN', { hour12: false })}
      </p>
    </div>
  );
}

/* @deprecated — use connection text in page actions instead */
export function LiveBadge({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <span className="text-[12px] font-medium fams-mono" style={{ color: connected ? 'var(--success)' : 'var(--muted)' }}>
      {label ?? (connected ? 'Live' : 'Offline')}
    </span>
  );
}
