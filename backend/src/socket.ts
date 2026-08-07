import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from './db';
import { isAllowedOrigin } from './utils/allowedOrigins';

let io: SocketIOServer;

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
      if (!token) return next(new Error('Authentication required'));

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
        socket.data.user = { id: terminal.id, username: terminal.name, role: 'terminal', terminalId: terminal.id };
        return next();
      }

      const secret = process.env.JWT_SECRET || 'fams-development-only-secret-change-me';
      const user = jwt.verify(token, secret) as any;
      if (!['admin', 'hr', 'supervisor'].includes(user.role)) return next(new Error('Insufficient permissions'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('Invalid or expired session'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id} (${socket.data.user?.username ?? 'unknown'})`);

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
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
