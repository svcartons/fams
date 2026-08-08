import { Download, CheckCircle2, Share } from 'lucide-react';
import { toast } from 'sonner';
import { usePwaInstall } from '../hooks/usePwaInstall';

type Variant = 'kiosk' | 'settings' | 'chrome';

/**
 * Triggers the native PWA install / Add to Home Screen flow when the browser allows it.
 */
export function PwaInstallButton({
  variant = 'settings',
  className = '',
}: {
  variant?: Variant;
  className?: string;
}) {
  const { canPrompt, installed, isIos, promptInstall } = usePwaInstall();

  const onClick = async () => {
    if (canPrompt) {
      const result = await promptInstall();
      if (result === 'accepted') {
        toast.success('FAMS added to your home screen');
      } else if (result === 'dismissed') {
        toast.message('Install cancelled');
      }
      return;
    }
    if (isIos) {
      toast.message('On iPhone/iPad: tap Share, then Add to Home Screen');
      return;
    }
    toast.message(
      'Use Chrome menu (⋮) → Install app / Add to Home screen. Needs HTTPS in production.'
    );
  };

  if (installed) {
    if (variant === 'chrome') return null;
    return (
      <p
        className={
          variant === 'kiosk'
            ? 'fams-kiosk-pair-hint flex items-center justify-center gap-1.5'
            : 'text-sm text-[var(--success)] flex items-center gap-1.5 font-semibold'
        }
      >
        <CheckCircle2 size={16} aria-hidden />
        Already installed on this device
      </p>
    );
  }

  if (variant === 'chrome') {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`fams-kiosk-badge fams-kiosk-install-btn ${className}`}
        title="Add FAMS to the home screen"
      >
        <Download className="w-3.5 h-3.5" />
        Install
      </button>
    );
  }

  if (isIos) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={onClick}
          className={
            variant === 'kiosk'
              ? 'fams-btn fams-btn-outline w-full h-11 text-sm mb-2'
              : 'inline-flex items-center gap-2 px-5 py-3 text-sm font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_25%,var(--border))] hover:bg-[#EFF6FF] bg-white rounded-[var(--radius)] cursor-pointer'
          }
        >
          <Share size={variant === 'kiosk' ? 16 : 16} />
          How to add to Home Screen
        </button>
        <p className={variant === 'kiosk' ? 'fams-kiosk-pair-hint' : 'fams-settings-hint mt-2'}>
          Safari → Share → <strong>Add to Home Screen</strong>
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title="Install FAMS on this device"
      className={
        variant === 'kiosk'
          ? `fams-btn fams-btn-primary w-full h-11 text-sm mb-3 ${className}`
          : `inline-flex items-center gap-2 px-5 py-3 text-sm font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-[var(--radius)] cursor-pointer ${className}`
      }
    >
      <Download size={16} />
      Add to Home Screen
    </button>
  );
}
