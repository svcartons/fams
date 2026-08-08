/** Origins allowed for browser CORS / Socket.IO (LAN + CORS_ORIGIN env). */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin / server-to-server / mobile

  const defaults = [
    'http://localhost',
    'http://localhost:8080',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'capacitor://localhost',
    'http://localhost',
    'https://localhost',
  ];

  const fromEnv = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (defaults.includes(origin) || fromEnv.includes(origin)) return true;
  if (origin.startsWith('capacitor://')) return true;
  // Vercel preview + production frontends
  if (/^https:\/\/([a-z0-9-]+\.)+vercel\.app$/i.test(origin)) return true;
  if (/^(https?|capacitor):\/\/(192\.168\.|172\.|10\.|localhost|127\.0\.0\.1)/.test(origin)) {
    return true;
  }
  return false;
}
