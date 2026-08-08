import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { getAuthConfig, googleLogin, login as apiLogin } from '../../api/client';
import { getHomeRoute } from '../utils/routing';
import { AuthField, AuthInput, AuthLayout, AuthNotice, AuthSubmit } from './layout/AuthLayout';

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize: (config: { client_id: string; callback: (response: { credential: string }) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean }) => void;
      renderButton: (parent: HTMLElement, options: { type?: string; theme?: string; size?: string; text?: string; shape?: string; width?: number; logo_alignment?: string }) => void;
    } } };
  }
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector('script[data-google-gsi]') as HTMLScriptElement | null;
  if (existing) return new Promise((resolve, reject) => {
    existing.addEventListener('load', () => resolve());
    existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In')));
  });
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleGsi = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });
}

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [siteName, setSiteName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const isLockout = formError?.toLowerCase().includes('too many') ?? false;

  const finishLogin = useCallback((data: { user: { role: string; mfaEnrollmentSuggested?: boolean }; token: string }) => {
    login(data.user as any, data.token);
    if (data.user.mfaEnrollmentSuggested) toast.message('Enable 2FA from Settings > My Profile.');
    else toast.success('Welcome back');
    navigate(getHomeRoute(data.user.role));
  }, [login, navigate]);

  const handleGoogleCredential = useCallback(async (credential: string, otpCode?: string) => {
    setGoogleLoading(true);
    setFormError(null);
    try {
      const data = await googleLogin(credential, otpCode);
      setPendingGoogleCredential(null);
      setMfaRequired(false);
      finishLogin(data);
    } catch (err: any) {
      const message = err.message || 'Google Sign-In failed';
      if (err.code === 'MFA_REQUIRED' || message.startsWith('MFA_REQUIRED:')) {
        setPendingGoogleCredential(credential);
        setMfaRequired(true);
        setFormError('Enter the 6-digit code from your authenticator app.');
      } else setFormError(message);
    } finally { setGoogleLoading(false); }
  }, [finishLogin]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await getAuthConfig();
        if (cancelled) return;
        setSiteName(config.siteName);
        setGoogleEnabled(config.googleEnabled);
        if (!config.googleEnabled || !config.googleClientId) return;
        await loadGoogleScript();
        if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return;
        window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: (response) => {
          if (response.credential) void handleGoogleCredential(response.credential);
        }, auto_select: false, cancel_on_tap_outside: true });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular',
          width: Math.min(googleBtnRef.current.offsetWidth || 320, 400), logo_alignment: 'left',
        });
      } catch {
        if (!cancelled) setFormError('Single sign-on is temporarily unavailable. Use your local account.');
      }
    })();
    return () => { cancelled = true; };
  }, [handleGoogleCredential]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      if (pendingGoogleCredential) await handleGoogleCredential(pendingGoogleCredential, otp || undefined);
      else finishLogin(await apiLogin(username, password, otp || undefined));
    } catch (err: any) {
      const message = err.message || 'Sign in failed';
      if (err.code === 'MFA_REQUIRED' || message.startsWith('MFA_REQUIRED:')) {
        setMfaRequired(true);
        setFormError('Enter the 6-digit code from your authenticator app.');
      } else setFormError(message);
      if (!message.toLowerCase().includes('too many')) toast.error(message);
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout title={mfaRequired ? 'Verify your identity' : 'Sign in'} siteName={siteName}
      subtitle={mfaRequired ? 'Use the code from your authenticator app to continue.' : 'Use your approved work account to access attendance operations.'}
      footer={<Link to="/setup" className="fams-auth-link">Set up the first administrator</Link>}>
      {formError && <AuthNotice tone={isLockout ? 'warning' : 'danger'}>{formError}</AuthNotice>}
      {googleEnabled && !mfaRequired && <div className="fams-auth-sso">
        <p>Organization sign-in</p>
        <div ref={googleBtnRef} className="fams-google-btn-host" aria-busy={googleLoading} aria-label="Sign in with Google" />
        {googleLoading && <span className="fams-auth-sso-status">Verifying your organization account...</span>}
      </div>}
      {googleEnabled && !mfaRequired && <div className="fams-auth-divider"><span>or use a local account</span></div>}
      <form onSubmit={handleSubmit} noValidate>
        {!pendingGoogleCredential && <>
          <AuthField label="Username"><AuthInput icon={User} type="text" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" autoComplete="username" disabled={isLockout} /></AuthField>
          <AuthField label="Password"><AuthInput icon={Lock} type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" disabled={isLockout} suffix={<button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="fams-auth-input-action">{showPassword ? <EyeOff /> : <Eye />}</button>} />
            <div className="fams-auth-field-action"><button type="button" onClick={() => navigate('/forgot-password')} className="fams-auth-link">Need help signing in?</button></div>
          </AuthField>
        </>}
        {pendingGoogleCredential && <AuthNotice>Complete organization sign-in with your authenticator code.</AuthNotice>}
        {mfaRequired && <AuthField label="Authenticator code"><AuthInput icon={ShieldCheck} type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></AuthField>}
        <AuthSubmit loading={loading || googleLoading} disabled={isLockout}>{mfaRequired ? 'Verify and continue' : 'Sign in'}</AuthSubmit>
      </form>
    </AuthLayout>
  );
}
