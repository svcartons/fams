import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import workerRoutes from './routes/workers';
import attendanceRoutes from './routes/attendance';
import correctionsRoutes from './routes/corrections';
import auditRoutes from './routes/audit';
import dashboardRoutes from './routes/dashboard';
import reportRoutes from './routes/report';
import settingsRoutes from './routes/settings';
import shiftsRoutes from './routes/shifts';
import authRoutes, { stopLoginAttemptPruner } from './routes/auth';
import terminalsRoutes from './routes/terminals';
import { authenticateToken, ipWhitelistMiddleware, httpsEnforcementMiddleware } from './middleware/authMiddleware';
import { createServer } from 'http';
import { closeSocketServer, initSocket } from './socket';
import { initBackupScheduler, stopBackupScheduler } from './utils/backup';
import { initMaintenanceSchedulers, stopMaintenanceSchedulers } from './utils/maintenance';
import { rateLimitMiddleware } from './middleware/rateLimitMiddleware';
import { ensureKioskTokenSetting } from './utils/ensureKioskToken';
import { isAllowedOrigin } from './utils/allowedOrigins';
import { applyAdminPasswordResetFromEnv } from './utils/adminPasswordReset';
import { getLogLevel, logger } from './utils/logger';

const app = express();
const httpServer = createServer(app);
initSocket(httpServer);
const PORT = process.env.PORT || 3007;

// Global Middleware
app.use(rateLimitMiddleware);
app.use(httpsEnforcementMiddleware);
app.use(ipWhitelistMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Controlled request logging (never logs bodies, cookies, or Authorization)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
    const isHealth = pathOnly === '/api/health' || pathOnly === '/';
    const meta = {
      method: req.method,
      path: pathOnly,
      status: res.statusCode,
      durationMs: duration,
    };

    if (res.statusCode >= 500) {
      logger.error('request', meta);
      return;
    }
    if (res.statusCode >= 400) {
      logger.warn('request', meta);
      return;
    }
    // Keep health checks quiet at info in production; still visible at debug locally
    if (isHealth) {
      logger.debug('request', meta);
      return;
    }
    if (getLogLevel() === 'debug') logger.debug('request', meta);
    else logger.info('request', meta);
  });
  next();
});

// Production Security Middleware (OPT-2: helmet re-enabled, OPT-10: CORS restricted)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
// Gzip compression — reduces JSON responses by 60–80%, cuts memory for large payloads
// Threshold: only compress responses > 1 KB (skip tiny health-check pings)
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.path.startsWith('/models')) return false;
    return compression.filter(req, res);
  },
}));
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      logger.warn('cors blocked', { origin: origin || 'none' });
      callback(new Error('CORS: Origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Face-api model weights for mobile kiosk (one-time download from phone)
app.use('/models', express.static(path.join(__dirname, '../public/models'), {
  maxAge: '7d',
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.setHeader('Access-Control-Allow-Origin', '*');
  },
}));

// Routes
app.use('/api/auth', authRoutes);

// Workers route has individual auth checks inside, so Kiosk can access /faces
app.use('/api/workers', workerRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/corrections', authenticateToken, correctionsRoutes);
app.use('/api/audit', authenticateToken, auditRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/report', authenticateToken, reportRoutes);
app.use('/api/settings', settingsRoutes); // Permission checks are now inside the router
app.use('/api/shifts', authenticateToken, shiftsRoutes);
app.use('/api/terminals', terminalsRoutes);

// Root — browsers often probe http://LAPTOP_IP:3007/ before /api/health
app.get('/', (_req, res) => {
  res.json({
    service: 'FAMS Backend',
    status: 'ok',
    health: '/api/health',
    api: '/api',
    timestamp: new Date().toISOString(),
  });
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global Error Handler — MUST be last middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('unhandled error', { message: err?.message || 'Unknown error', code: err?.code });

  // Don't expose internal error messages to client in production
  const message = process.env.NODE_ENV === 'production'
    ? 'An internal server error occurred'
    : err.message || 'Unknown error';

  res.status(err.status || 500).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR'
  });
});

let shuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutdown started', { signal });

  stopBackupScheduler();
  stopMaintenanceSchedulers();
  stopLoginAttemptPruner();

  try {
    await closeSocketServer();
  } catch (err: any) {
    logger.warn('socket close failed', { message: err?.message });
  }

  await new Promise<void>((resolve) => {
    if (!httpServer.listening) {
      resolve();
      return;
    }
    httpServer.close((err) => {
      if (err) logger.warn('http close failed', { message: err.message });
      resolve();
    });
  });

  logger.info('shutdown complete', { signal });
  process.exit(0);
}

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

httpServer.listen(Number(PORT), '0.0.0.0', async () => {
  logger.info('backend listening', {
    port: Number(PORT),
    apiBase: `http://localhost:${PORT}/api`,
    logLevel: getLogLevel(),
  });
  try {
    await ensureKioskTokenSetting();
  } catch (err) {
    logger.error('kiosk token ensure failed', { message: (err as Error)?.message });
  }
  try {
    await applyAdminPasswordResetFromEnv();
  } catch (err) {
    logger.error('admin password reset failed', { message: (err as Error)?.message });
  }
  initBackupScheduler();
  initMaintenanceSchedulers();
});

export default app;
