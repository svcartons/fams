import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Lock, User, Eye, EyeOff, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { login as apiLogin, googleLogin, getGoogleClientId } from '../../api/client';
import { getHomeRoute } from '../utils/routing';
import { AuthLayout, AuthField, AuthInput, AuthSubmit } from './layout/AuthLayout';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: string;
              theme?: string;
              size?: string;
              text?: string;
              shape?: string;
              width?: number;
              logo_alignment?: string;
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.querySelector('script[data-google-gsi]') as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In')));
    });
  }
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
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [googleConfigError, setGoogleConfigError] = useState<string | null>(null);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const isLockout = formError?.toLowerCase().includes('too many') ?? false;

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setGoogleLoading(true);
      setFormError(null);
      try {
        const data = await googleLogin(credential);
        login(data.user, data.token);
        toast.success('Welcome back');
        navigate(getHomeRoute(data.user.role));
      } catch (err: any) {
        const message = err.message || 'Google Sign-In failed';
        setFormError(message);
        toast.error(message);
      } finally {
        setGoogleLoading(false);
      }
    },
    [login, navigate]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { clientId } = await getGoogleClientId();
        if (cancelled) return;
        if (!clientId) {
          setGoogleConfigError(
            'Google Sign-In not configured. Add GOOGLE_CLIENT_ID to backend/.env'
          );
          setShowPasswordForm(true);
          return;
        }
        setGoogleClientId(clientId);
        await loadGoogleScript();
        if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) void handleGoogleCredential(response.credential);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: Math.min(googleBtnRef.current.offsetWidth || 320, 400),
          logo_alignment: 'left',
        });
      } catch {
        if (!cancelled) {
          setGoogleConfigError('Unable to load Google Sign-In. You can still sign in with a password.');
          setShowPasswordForm(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleGoogleCredential]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      const data = await apiLogin(username, password, otp || undefined);
      login(data.user, data.token);
      toast.success('Welcome back');
      navigate(getHomeRoute(data.user.role));
    } catch (err: any) {
      const message = err.message || 'Sign in failed';
      if (err.code === 'MFA_REQUIRED' || message.startsWith('MFA_REQUIRED:')) {
        setMfaRequired(true);
        setFormError('Enter the 6-digit code from your authenticator app.');
      } else {
        setFormError(message);
      }
      if (!message.toLowerCase().includes('too many')) toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Admins can use Google. Other users sign in with a username and password."
      footer={
        <Link to="/setup" className="fams-auth-link">
          First time? Set up admin account
        </Link>
      }
    >
      <div className="fams-auth-login-body">
        {formError && (
          <div className="fams-alert fams-alert-danger mb-4" role="alert">
            {formError}
          </div>
        )}

        {googleConfigError && (
          <div className="fams-alert fams-alert-warning mb-4" role="status">
            {googleConfigError}
          </div>
        )}

        <div className="fams-google-signin mb-5">
          <p className="fams-auth-google-label">Admin — Sign in with Google</p>
          <div
            ref={googleBtnRef}
            className="fams-google-btn-host"
            aria-busy={googleLoading}
            aria-label="Sign in with Google"
          />
          {googleLoading && (
            <p className="fams-auth-google-status">Signing you in…</p>
          )}
          {googleClientId && !googleLoading && (
            <p className="fams-auth-google-hint">
              Use <strong>cvjayanth005@gmail.com</strong> for admin access.
            </p>
          )}
        </div>

        <div className="fams-auth-divider" role="separator">
          <span>or</span>
        </div>

        <button
          type="button"
          className="fams-auth-password-toggle"
          onClick={() => setShowPasswordForm((v) => !v)}
          aria-expanded={showPasswordForm}
        >
          <span>Sign in with username &amp; password</span>
          {showPasswordForm ? (
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
          )}
        </button>

        {showPasswordForm && (
          <form onSubmit={handleSubmit} className="mt-4">
            <AuthField label="Username">
              <AuthInput
                icon={User}
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                disabled={isLockout}
              />
            </AuthField>

            <AuthField label="Password">
              <AuthInput
                icon={Lock}
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isLockout}
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="fams-auth-input-action"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="fams-auth-link fams-auth-link-sm"
                >
                  Forgot password?
                </button>
              </div>
            </AuthField>

            {mfaRequired && (
              <AuthField label="Authenticator code">
                <AuthInput
                  icon={ShieldCheck}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                />
              </AuthField>
            )}

            <AuthSubmit loading={loading} disabled={isLockout}>
              Sign in
            </AuthSubmit>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
