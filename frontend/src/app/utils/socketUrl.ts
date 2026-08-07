/** Socket.IO server URL — same origin by default (Vite proxies /socket.io in dev). */
export function getSocketUrl(): string | undefined {
  return import.meta.env.VITE_API_URL || undefined;
}
