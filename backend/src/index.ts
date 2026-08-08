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
import authRoutes from './routes/auth';
import terminalsRoutes from './routes/terminals';
import { authenticateToken, requireAdmin, ipWhitelistMiddleware, httpsEnforcementMiddleware } from './middleware/authMiddleware';
import { createServer } from 'http';
import { initSocket } from './socket';
import { initBackupScheduler } from './utils/backup';
import { initMaintenanceSchedulers } from './utils/maintenance';
import { rateLimitMiddleware } from './middleware/rateLimitMiddleware';
import { ensureKioskTokenSetting } from './utils/ensureKioskToken';
import { isAllowedOrigin } from './utils/allowedOrigins';
import { applyAdminPasswordResetFromEnv } from './utils/adminPasswordReset';

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

// Request Logger for Production Monitoring
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (res.statusCode >= 400) {
      console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
    } else {
      // Quiet logging for success to avoid clutter
      // console.log(`${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
    }
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
      console.warn(`[CORS Blocked] Origin: ${origin}`);
      callback(new Error('CORS: Origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// app.use(express.json({ limit: '1mb' })); // Limit payload size for security

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
  console.error('[Global Error]', err);
  
  // Don't expose internal error messages to client in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'An internal server error occurred' 
    : err.message || 'Unknown error';
    
  res.status(err.status || 500).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR'
  });
});

httpServer.listen(Number(PORT), '0.0.0.0', async () => {
  console.log(`✅ Backend server running on http://localhost:${PORT}`);
  console.log(`📖 API base: http://localhost:${PORT}/api`);
  try {
    await ensureKioskTokenSetting();
  } catch (err) {
    console.error('[Kiosk] Failed to ensure sec_kiosk_token:', err);
  }
  try {
    await applyAdminPasswordResetFromEnv();
  } catch (err) {
    console.error('[AdminReset] Failed:', err);
  }
  initBackupScheduler();
  initMaintenanceSchedulers();
});

export default app;
