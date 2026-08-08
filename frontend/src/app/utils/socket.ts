import { io, type Socket } from 'socket.io-client';
import { getStoredSessionToken } from '../../api/client';
import { getSocketUrl } from './socketUrl';

type SocketEvent = 'worker_scanned' | 'bulk_sync_complete';
type ConnectionListener = (connected: boolean) => void;

let client: Socket | null = null;
const connectionListeners = new Set<ConnectionListener>();
const SESSION_INVALIDATED_EVENT = 'fams:session-invalidated';

function notifyConnection(connected: boolean) {
  connectionListeners.forEach(listener => listener(connected));
}

function getClient(): Socket {
  const token = getStoredSessionToken();

  if (!client) {
    client = io(getSocketUrl(), {
      path: '/socket.io',
      auth: token ? { token } : {},
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      randomizationFactor: 0,
    });
    client.on('connect', () => notifyConnection(true));
    client.on('disconnect', () => notifyConnection(false));
    client.on('connect_error', error => {
      console.warn(`[Socket] Connection failed: ${error.message}`);
    });
    client.io.on('reconnect_failed', () => {
      console.warn('[Socket] Reconnect attempts exhausted');
      notifyConnection(false);
    });
  }

  // Refresh auth for subsequent connects; omit token to allow HttpOnly cookie fallback
  client.auth = token ? { token } : {};
  return client;
}

/** Connect the shared socket once per browser session (idempotent). */
export function connectSocket(): void {
  const socket = getClient();
  if (!socket.connected && !socket.active) socket.connect();
}

/** Subscribe to a server event. Cleanup removes only this listener — does not disconnect. */
export function subscribeSocket(event: SocketEvent, listener: () => void): () => void {
  const socket = getClient();
  socket.on(event, listener);
  return () => socket.off(event, listener);
}

/** Subscribe to connection state for UI indicators. */
export function subscribeSocketConnection(listener: ConnectionListener): () => void {
  connectionListeners.add(listener);
  listener(Boolean(client?.connected));
  return () => connectionListeners.delete(listener);
}

/** Tear down the singleton (logout / session invalidation). Stops reconnect attempts. */
export function disconnectSocket(): void {
  if (!client) {
    notifyConnection(false);
    return;
  }
  const socket = client;
  client = null;
  try {
    socket.io.reconnection(false);
  } catch {
    /* ignore */
  }
  socket.removeAllListeners();
  socket.disconnect();
  notifyConnection(false);
}

if (typeof window !== 'undefined') {
  window.addEventListener(SESSION_INVALIDATED_EVENT, () => {
    disconnectSocket();
  });
}
