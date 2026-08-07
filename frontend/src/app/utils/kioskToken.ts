const KIOSK_TOKEN_KEY = 'fams_kiosk_token';

export function getStoredKioskToken(): string | null {
  return localStorage.getItem(KIOSK_TOKEN_KEY);
}

export function setStoredKioskToken(token: string): void {
  localStorage.setItem(KIOSK_TOKEN_KEY, token);
}

export function clearStoredKioskToken(): void {
  localStorage.removeItem(KIOSK_TOKEN_KEY);
}

/** Ensure kiosk attendance requests include a valid device token. */
export function ensureKioskToken(storedToken?: string | null): boolean {
  if (localStorage.getItem(KIOSK_TOKEN_KEY)) return true;
  if (storedToken) {
    localStorage.setItem(KIOSK_TOKEN_KEY, storedToken);
    return true;
  }
  return false;
}

export type BootstrapResult =
  | { ok: true }
  | { ok: false; reason: 'forbidden' | 'unavailable' | 'network' };

/**
 * Auto-pair browser kiosk from the LAN/local bootstrap endpoint when
 * localStorage has no token yet (typical fresh local/dev session).
 * Public-internet phones cannot use this (403 in production); they unlock
 * via Google on /kiosk instead (see KioskMode + POST /auth/kiosk-google).
 */
export async function bootstrapKioskToken(): Promise<BootstrapResult> {
  if (ensureKioskToken()) return { ok: true };

  try {
    const response = await fetch('/api/settings/kiosk-bootstrap', {
      credentials: 'include',
    });
    if (response.status === 403) return { ok: false, reason: 'forbidden' };
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    const data = (await response.json()) as { token?: string };
    if (!data.token) return { ok: false, reason: 'unavailable' };
    return ensureKioskToken(data.token) ? { ok: true } : { ok: false, reason: 'unavailable' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
