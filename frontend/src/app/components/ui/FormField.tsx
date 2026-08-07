import { type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { X } from 'lucide-react';

export function FormField({
  label,
  required,
  error,
  hint,
  children,
  className = '',
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`fams-field ${className}`.trim()}>
      <label className="fams-field-label">
        {label}
        {required && <span className="text-[var(--danger)] ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="fams-field-error">{error}</p>}
      {!error && hint && <p className="fams-field-hint">{hint}</p>}
    </div>
  );
}

export function FormInput({
  className = '',
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      className={`fams-input ${error ? 'fams-input-error' : ''} ${className}`.trim()}
      {...props}
    />
  );
}

export function FormSelect({
  className = '',
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select
      className={`fams-input ${error ? 'fams-input-error' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </select>
  );
}

export function FormTextarea({
  className = '',
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <textarea
      className={`fams-textarea ${error ? 'fams-input-error' : ''} ${className}`.trim()}
      {...props}
    />
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  return (
    <div className="fams-modal-overlay" onClick={onClose} role="presentation">
      <div
        className={`fams-modal ${size === 'lg' ? 'fams-modal-lg' : ''}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fams-modal-title"
      >
        <div className="fams-modal-header">
          <h2 id="fams-modal-title" className="fams-modal-title">{title}</h2>
          <button type="button" onClick={onClose} className="fams-btn fams-btn-ghost px-2" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="fams-modal-body">{children}</div>
        {footer && <div className="fams-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
