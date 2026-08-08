import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from './db';
import { isAllowedOrigin } from './utils/allowedOrigins';
import { logger } from './utils/logger';

let io: SocketIOServer | null = null;

type RejectCategory =
  | 'missing_token'
  | 'invalid_token'
  | 'user_missing'
  | 'user_inactive'
  | 'insufficient_permissions'
  | 'auth_error';

function rejectAuth(next: (err?: Error) => void, category: RejectCategory, message: string) {
  logger.warn('socket auth rejected', { category, message });
  return next(new Error(message));
}

function activeSocketCount(): number {
  return io?.of('/').sockets.size ?? 0;
}

export const initSocket = (server: HttpServer) => {
  io = new SocketIOServer(server, {
    // Compress WebSocket frames — saves 40–70% bandwidth, reduces kernel socket buffers
    perMessageDeflate: {
      zlibDeflateOptions: { level: 6 }, // Balanced speed vs. compression ratio
      threshold: 512,                   // Only compress frames > 512 bytes
    },
    cors: {
      origin: (origin, callback) => {
        const ok = isAllowedOrigin(origin);
        callback(ok ? null : new Error('Socket CORS: origin not allowed'), ok);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const supplied = socket.handshake.auth?.token as string | undefined;
      const cookieHeader = socket.handshake.headers.cookie || '';
      const cookieToken = cookieHeader
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('fams_session='))
        ?.slice('fams_session='.length);
      const token = supplied || (cookieToken ? decodeURIComponent(cookieToken) : null);
      if (!token) return rejectAuth(next, 'missing_token', 'Authentication required');

      const terminal = await prisma.mobileTerminal.findFirst({
        where: {
          status: 'active',
          OR: [
            { tokenHash: crypto.createHash('sha256').update(token).digest('hex') },
            { token },
          ],
        },
      });
      if (terminal) {
        socket.data.user = {
          id: terminal.id,
          username: terminal.name,
          role: 'terminal',
          terminalId: terminal.id,
        };
        return next();
      }

      const secret = process.env.JWT_SECRET || 'fams-development-only-secret-change-me';
      let claims: { id?: string; role?: string };
      try {
        claims = jwt.verify(token, secret) as { id?: string; role?: string };
      } catch {
        return rejectAuth(next, 'invalid_token', 'Invalid or expired session');
      }

      if (!claims.id) return rejectAuth(next, 'invalid_token', 'Invalid session');

      const user = await prisma.user.findUnique({
        where: { id: claims.id },
        select: {
          id: true,
          username: true,
          role: true,
          worker: { select: { isActive: true } },
        },
      });

      if (!user) return rejectAuth(next, 'user_missing', 'Session user not found');
      if (user.worker && !user.worker.isActive) {
        return rejectAuth(next, 'user_inactive', 'Session user is no longer active');
      }
      if (!['admin', 'hr', 'supervisor'].includes(user.role)) {
        return rejectAuth(next, 'insufficient_permissions', 'Insufficient permissions');
      }

      socket.data.user = {
        id: user.id,
        username: user.username,
        role: user.role,
      };
      next();
    } catch {
      return rejectAuth(next, 'auth_error', 'Invalid or expired session');
    }
  });

  io.on('connection', (socket) => {
    logger.info('socket connected', {
      socketId: socket.id,
      username: socket.data.user?.username ?? 'unknown',
      role: socket.data.user?.role ?? 'unknown',
      activeSockets: activeSocketCount(),
    });

    socket.on('disconnect', (reason) => {
      logger.info('socket disconnected', {
        socketId: socket.id,
        username: socket.data.user?.username ?? 'unknown',
        reason,
        activeSockets: activeSocketCount(),
      });
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io is not initialized!');
  }
  return io;
};

/** Stop accepting new connections and close existing sockets. */
export function closeSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!io) {
      resolve();
      return;
    }
    const server = io;
    io = null;
    server.close(() => resolve());
  });
}
