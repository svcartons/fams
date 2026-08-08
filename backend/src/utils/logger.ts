type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || '').trim().toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

let activeLevel = resolveLevel();

export function getLogLevel(): LogLevel {
  return activeLevel;
}

export function setLogLevel(level: LogLevel): void {
  activeLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[activeLevel];
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  const safeMeta = meta ? redactSensitive(meta) : undefined;
  const line = safeMeta ? `${prefix} ${message} ${JSON.stringify(safeMeta)}` : `${prefix} ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Redact secrets from arbitrary objects before logging. Never log tokens/passwords/bodies. */
export function redactSensitive(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (/bearer\s+/i.test(value) || /^eyJ[A-Za-z0-9_-]+\./.test(value) || value.includes('fams_session=')) {
      return '[REDACTED]';
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        lower === 'authorization' ||
        lower === 'cookie' ||
        lower === 'password' ||
        lower === 'currentpassword' ||
        lower === 'newpassword' ||
        lower === 'otp' ||
        lower === 'token' ||
        lower === 'credential' ||
        lower === 'facedescriptor' ||
        lower === 'avatarphoto' ||
        lower.includes('secret') ||
        lower.includes('password')
      ) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactSensitive(nested);
      }
    }
    return out;
  }
  return value;
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};
