import prisma from '../db';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

const BACKUPS_DIR = path.join(__dirname, '..', '..', 'backups');

/**
 * Runs a complete database export and saves it as a JSON backup file.
 * Automatically cleans up backups exceeding the retention threshold.
 */
export async function runBackup(actor: string = 'System'): Promise<string> {
  try {
    // 1. Ensure backups directory exists
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    // 2. Query all operational tables in parallel
    const [
      shifts,
      workers,
      users,
      attendanceEvents,
      dailyOverrides,
      manualCorrections,
      auditLogs,
      systemSettings,
    ] = await Promise.all([
      prisma.shift.findMany(),
      prisma.worker.findMany(),
      prisma.user.findMany(),
      prisma.attendanceEvent.findMany(),
      prisma.dailyOverride.findMany(),
      prisma.manualCorrection.findMany(),
      prisma.auditLog.findMany(),
      prisma.systemSetting.findMany(),
    ]);

    const backupData = {
      timestamp: new Date().toISOString(),
      shifts,
      workers,
      users: users.map(u => ({ ...u, passwordHash: u.passwordHash })), // secure copy
      attendanceEvents,
      dailyOverrides,
      manualCorrections,
      auditLogs,
      systemSettings,
    };

    // 3. Write backup to a unique JSON file
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestampStr}.json`;
    const filePath = path.join(BACKUPS_DIR, filename);

    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');

    // 4. Log the backup event in the Audit Log
    await prisma.auditLog.create({
      data: {
        actor,
        action: 'Database Backup',
        target: filename,
        details: `Backup successfully generated. Size: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB.`,
        ipAddress: '127.0.0.1',
      },
    });

    // 5. Enforce retention limit (sys_backup_retention)
    const retentionSetting = await prisma.systemSetting.findUnique({ where: { key: 'sys_backup_retention' } });
    const retentionCount = retentionSetting ? Number(retentionSetting.value) : 30;

    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime() }))
      .sort((a, b) => a.time - b.time); // oldest first

    if (files.length > retentionCount) {
      const toDelete = files.slice(0, files.length - retentionCount);
      for (const file of toDelete) {
        fs.unlinkSync(path.join(BACKUPS_DIR, file.name));
      }
      logger.info('backup retention applied', { purgedFiles: toDelete.length });
    }

    return filename;
  } catch (err: any) {
    logger.error('backup failed', { message: err?.message });
    throw new Error('Backup failed: ' + err.message);
  }
}

let backupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Initializes the background backup scheduler on server startup.
 */
export function initBackupScheduler() {
  if (backupInterval) return;
  logger.info('backup scheduler initialized', { intervalHours: 12 });

  // Run a backup check every 12 hours
  backupInterval = setInterval(async () => {
    try {
      const freqSetting = await prisma.systemSetting.findUnique({ where: { key: 'sys_backup_freq' } });
      const freq = freqSetting?.value || 'daily';

      if (freq === 'none') return;

      // Find the last backup date in audit logs
      const lastBackup = await prisma.auditLog.findFirst({
        where: { action: 'Database Backup' },
        orderBy: { createdAt: 'desc' },
      });

      const now = Date.now();
      const lastTime = lastBackup ? lastBackup.createdAt.getTime() : 0;
      const hoursDiff = (now - lastTime) / (3600 * 1000);

      let shouldBackup = false;
      if (freq === 'hourly' && hoursDiff >= 1) shouldBackup = true;
      else if (freq === 'daily' && hoursDiff >= 24) shouldBackup = true;
      else if (freq === 'weekly' && hoursDiff >= 168) shouldBackup = true;

      if (shouldBackup) {
        logger.info('scheduled backup started');
        const filename = await runBackup('System Scheduler');
        logger.info('scheduled backup completed', { filename });
      }
    } catch (err: any) {
      logger.error('backup scheduler failed', { message: err?.message });
    }
  }, 12 * 3600 * 1000); // 12 hours check interval
}

export function stopBackupScheduler(): void {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
  }
}
