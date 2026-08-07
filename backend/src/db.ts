import { PrismaClient } from '@prisma/client';

// Cap connection pool at 5 to avoid exhausting max_connections=20 on the low-memory PG config.
// pool_timeout=20 means idle connections are released after 20 seconds.
// These can also be set via DATABASE_URL query params (connection_limit=5&pool_timeout=20)
// which docker-compose.yml already does for production; this object config covers dev/.env runs.
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: (() => {
        const base = process.env.DATABASE_URL || '';
        // Avoid double-adding params if docker-compose already injects them
        if (base.includes('connection_limit')) return base;
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}connection_limit=5&pool_timeout=20`;
      })(),
    },
  },
});

// Compliance audit records are retained. Archival belongs in the backup/export
// pipeline so the primary ledger is never silently deleted by a web process.

export default prisma;
