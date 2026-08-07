import { Router, Request, Response } from 'express';
import prisma from '../db';
import { getIp } from '../utils/helpers';
import {
  getTodayWorkDate,
  getWorkDateForTimestamp,
  resolveAutoEventType,
  statusFromTodayEvents,
} from '../utils/workDate';
import { getSettingsMap } from '../utils/settingsCache';
import { sendWebhookNotification } from '../utils/notifications';
import { authenticateToken } from '../middleware/authMiddleware';
import { writeAuditLog } from '../utils/audit';

const router = Router();

function emitWorkerScanned(worker: any, event: any, status: string) {
  try {
    const { getIO } = require('../socket');
    getIO().emit('worker_scanned', {
      id: worker.employeeCode,
      name: worker.name,
      department: worker.department,
      role: worker.role,
      status,
      lastEvent: new Date(event.timestamp).toISOString(),
      method: event.method,
    });
  } catch (wsErr) {
    console.error('[WebSocket Emit Error]', wsErr);
  }
}

// GET /api/attendance - get all recent events (with worker info)
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  try {
    const events = await prisma.attendanceEvent.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
      include: { worker: true },
    });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance events' });
  }
});

// GET /api/attendance/live - today's status per worker (resets each work day)
router.get('/live', authenticateToken, async (_req: Request, res: Response) => {
  try {
    const todayWorkDate = await getTodayWorkDate();

    const workers = await prisma.worker.findMany({
      where: { isActive: true },
      include: {
        attendanceEvents: {
          where: { workDate: todayWorkDate },
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    const now = new Date();

    const live = workers.map((w: any) => {
      const todayEvents = w.attendanceEvents;
      const status = statusFromTodayEvents(todayEvents);
      const latest = todayEvents[todayEvents.length - 1];

      let duration = '-';
      let durationMins = 0;

      if (latest && ['checked-in', 'tea-break', 'lunch-break'].includes(status)) {
        const diffMs = now.getTime() - new Date(latest.timestamp).getTime();
        const mins = Math.floor(diffMs / 60000);
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;
        duration = hrs > 0 ? `${hrs}h ${remMins}m` : `${mins}m`;
        durationMins = mins;
      } else if (status === 'checked-out') {
        duration = 'Out';
      }

      return {
        id: w.employeeCode,
        name: w.name,
        department: w.department,
        role: w.role,
        status,
        lastEvent: latest ? new Date(latest.timestamp).toISOString() : null,
        method: latest?.method ?? '-',
        duration,
        durationMins,
        avatarPhoto: w.avatarPhoto,
        workDate: todayWorkDate,
      };
    });

    res.json(live);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch live status' });
  }
});

// POST /api/attendance - log a new attendance event
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const { employeeCode, eventType, method, confidence } = req.body;
  if (!employeeCode || !eventType) {
    return res.status(400).json({ error: 'Missing employeeCode or eventType' });
  }

  const validEvents = ['checked-in', 'tea-break', 'lunch-break', 'checked-out', 'auto'];
  if (!validEvents.includes(eventType)) {
    return res.status(400).json({ error: `Invalid eventType. Must be one of: ${validEvents.join(', ')}` });
  }

  const authUser = (req as any).user;
  const isTerminal = authUser?.role === 'terminal';
  if (isTerminal && method === 'manual') {
    return res.status(403).json({ error: 'Terminals cannot create manual attendance events' });
  }
  if (!isTerminal && !['admin', 'hr', 'supervisor'].includes(authUser?.role)) {
    return res.status(403).json({ error: 'Attendance event creation is not permitted for this account' });
  }
  const actorName = authUser?.username || 'System';
  const terminalId = authUser?.terminalId || null;
  const clientEventId = typeof req.body.clientEventId === 'string' ? req.body.clientEventId : null;
  const occurredAt = req.body.occurredAt ? new Date(req.body.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return res.status(400).json({ error: 'Invalid occurredAt timestamp' });
  }
  if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return res.status(400).json({ error: 'Attendance events cannot be more than 5 minutes in the future' });
  }
  const normalizedConfidence = confidence == null ? null : Number(confidence);
  if (normalizedConfidence != null && (!Number.isFinite(normalizedConfidence) || normalizedConfidence < 0 || normalizedConfidence > 100)) {
    return res.status(400).json({ error: 'confidence must be a number between 0 and 100' });
  }

  if (clientEventId) {
    const existingEvent = await prisma.attendanceEvent.findUnique({ where: { clientEventId } });
    if (existingEvent) return res.status(200).json({ ...existingEvent, syncStatus: 'duplicate' });
  }

  try {
    const todayWorkDate = await getTodayWorkDate();
    const worker = await prisma.worker.findUnique({
      where: { employeeCode },
      include: {
        attendanceEvents: {
          where: { workDate: todayWorkDate },
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const latestToday = worker.attendanceEvents[0] ?? null;

    let finalEventType = eventType;
    if (eventType === 'auto') {
      finalEventType = resolveAutoEventType(latestToday, todayWorkDate);
    }

    if (latestToday && latestToday.eventType === finalEventType) {
      return res.status(400).json({ error: `Worker is already ${finalEventType} today` });
    }

    const workDate = await getWorkDateForTimestamp(occurredAt);

    const event = await prisma.attendanceEvent.create({
      data: {
        workerId: worker.id,
        eventType: finalEventType,
        method: method ?? 'face',
        confidence: normalizedConfidence,
        timestamp: occurredAt,
        occurredAt,
        receivedAt: new Date(),
        workDate,
        terminalId,
        actorId: isTerminal ? null : authUser?.id,
        clientEventId,
        syncStatus: 'accepted',
      },
      include: { worker: true },
    });

    await writeAuditLog({
      actor: actorName,
      action: method === 'manual' ? 'Manual Event' : 'Face Recognition',
      target: `${worker.name} (${worker.employeeCode})`,
      details: `${finalEventType} via ${method ?? 'face'}${confidence ? ` (confidence: ${confidence}%)` : ''} [${workDate}]`,
      ipAddress: getIp(req),
    });

    emitWorkerScanned(worker, event, finalEventType);

    const settings = await getSettingsMap();
    if (finalEventType === 'checked-out' && settings.notif_overtime_alert === 'true') {
      const todayEvents = await prisma.attendanceEvent.findMany({
        where: { workerId: worker.id, workDate },
        orderBy: { timestamp: 'asc' },
      });
      let workedMs = 0;
      let checkIn: Date | null = null;
      for (const ev of todayEvents) {
        if (ev.eventType === 'checked-in') checkIn = ev.timestamp;
        if (ev.eventType === 'checked-out' && checkIn) {
          workedMs += ev.timestamp.getTime() - checkIn.getTime();
          checkIn = null;
        }
      }
      const otHours = Number(settings.overtimeThreshold || 9);
      if (workedMs / 3600000 > otHours) {
        sendWebhookNotification(
          'notif_overtime_alert',
          `⏱️ **Overtime**\nWorker \`${worker.name}\` (${employeeCode}) worked ${(workedMs / 3600000).toFixed(1)}h (threshold ${otHours}h).`,
        ).catch(() => {});
      }
    }

    res.status(201).json({ ...event, syncStatus: 'accepted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log event' });
  }
});

// GET /api/attendance/worker/:employeeCode/today - today's log for a specific worker
router.get('/worker/:employeeCode/today', authenticateToken, async (req: Request, res: Response) => {
  try {
    const worker = await prisma.worker.findUnique({ where: { employeeCode: String(req.params.employeeCode) } });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const todayWorkDate = await getTodayWorkDate();

    const events = await prisma.attendanceEvent.findMany({
      where: {
        workerId: worker.id,
        workDate: todayWorkDate,
      },
      orderBy: { timestamp: 'asc' },
    });

    res.json(events);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch worker attendance' });
  }
});

router.post('/bulk-sync', authenticateToken, async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  if (authUser?.role !== 'terminal') {
    return res.status(403).json({ error: 'Only registered attendance terminals may bulk sync events' });
  }
  const actorName = authUser.username || 'Mobile Terminal';
  const resolvedTerminalId: string | null = authUser.terminalId || null;

  if (resolvedTerminalId) {
    await prisma.mobileTerminal.update({
      where: { id: resolvedTerminalId },
      data: { pendingQueueSize: 0, lastSeenAt: new Date() },
    });
  }

  const { events } = req.body;
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'events must be a non-empty array' });
  }
  if (events.length > 500) {
    return res.status(400).json({ error: 'Bulk sync limit is 500 events per request' });
  }

  const sorted = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => new Date(a.event.timestamp).getTime() - new Date(b.event.timestamp).getTime());

  const results: Array<{ index: number; clientEventId?: string; employeeCode: string; status: 'merged' | 'skipped' | 'failed'; reason?: string }> = [];
  let merged = 0, skipped = 0, failed = 0;

  for (let i = 0; i < sorted.length; i++) {
    const originalIndex = sorted[i].index;
    const e = sorted[i].event;
    const { employeeCode, eventType, method, confidence, timestamp, clientEventId, deviceSequence } = e;

    if (!employeeCode || !eventType || !clientEventId) {
      results.push({ index: originalIndex, clientEventId, employeeCode: employeeCode ?? '?', status: 'failed', reason: 'Missing employeeCode, eventType, or clientEventId' });
      failed++;
      continue;
    }

    const validEvents = ['checked-in', 'tea-break', 'lunch-break', 'checked-out', 'auto'];
    if (!validEvents.includes(eventType)) {
      results.push({ index: originalIndex, clientEventId, employeeCode, status: 'failed', reason: `Invalid eventType: ${eventType}` });
      failed++;
      continue;
    }

    const eventTimestamp = timestamp ? new Date(timestamp) : new Date();
    if (isNaN(eventTimestamp.getTime())) {
      results.push({ index: originalIndex, clientEventId, employeeCode, status: 'failed', reason: 'Invalid timestamp format' });
      failed++;
      continue;
    }
    if (eventTimestamp.getTime() > Date.now() + 5 * 60 * 1000) {
      results.push({ index: originalIndex, clientEventId, employeeCode, status: 'failed', reason: 'Event timestamp is too far in the future' });
      failed++;
      continue;
    }
    const normalizedConfidence = confidence == null ? null : Number(confidence);
    if (normalizedConfidence != null && (!Number.isFinite(normalizedConfidence) || normalizedConfidence < 0 || normalizedConfidence > 100)) {
      results.push({ index: originalIndex, clientEventId, employeeCode, status: 'failed', reason: 'confidence must be between 0 and 100' });
      failed++;
      continue;
    }

    const duplicate = await prisma.attendanceEvent.findUnique({ where: { clientEventId } });
    if (duplicate) {
      results.push({ index: originalIndex, clientEventId, employeeCode, status: 'skipped', reason: 'Duplicate clientEventId' });
      skipped++;
      continue;
    }

    try {
      const eventWorkDate = await getWorkDateForTimestamp(eventTimestamp);

      const worker = await prisma.worker.findUnique({
        where: { employeeCode },
        include: {
          attendanceEvents: {
            where: {
              workDate: eventWorkDate,
              timestamp: { lte: eventTimestamp },
            },
            orderBy: { timestamp: 'desc' },
            take: 1,
          },
        },
      });

      if (!worker) {
        results.push({ index: originalIndex, clientEventId, employeeCode, status: 'failed', reason: 'Worker not found' });
        failed++;
        continue;
      }

      const latestSameDay = worker.attendanceEvents[0] ?? null;

      let finalEventType = eventType;
      if (eventType === 'auto') {
        finalEventType = resolveAutoEventType(latestSameDay, eventWorkDate);
      }

      if (latestSameDay && latestSameDay.eventType === finalEventType) {
        const diffMs = Math.abs(eventTimestamp.getTime() - new Date(latestSameDay.timestamp).getTime());
        if (diffMs < 2 * 60 * 1000) {
          results.push({ index: originalIndex, clientEventId, employeeCode, status: 'skipped', reason: `Already ${finalEventType} (duplicate within 2 min)` });
          skipped++;
          continue;
        }
      }

      const created = await prisma.attendanceEvent.create({
        data: {
          workerId: worker.id,
          eventType: finalEventType,
          method: method ?? 'face',
          confidence: normalizedConfidence,
          timestamp: eventTimestamp,
          occurredAt: eventTimestamp,
          receivedAt: new Date(),
          workDate: eventWorkDate,
          terminalId: resolvedTerminalId,
          clientEventId,
          deviceSequence: deviceSequence == null ? null : Number(deviceSequence),
          syncStatus: 'accepted',
        },
      });

      emitWorkerScanned(worker, created, finalEventType);

      results.push({ index: originalIndex, clientEventId, employeeCode, status: 'merged' });
      merged++;
    } catch (err: any) {
      console.error(`[Bulk Sync] Error processing event ${i}:`, err.message);
      if (err?.code === 'P2002') {
        results.push({ index: originalIndex, clientEventId, employeeCode, status: 'skipped', reason: 'Duplicate clientEventId' });
        skipped++;
        continue;
      }
      results.push({ index: originalIndex, clientEventId, employeeCode, status: 'failed', reason: err.message });
      failed++;
    }
  }

  await prisma.auditLog.create({
    data: {
      actor: actorName,
      action: 'Bulk Attendance Sync',
      target: resolvedTerminalId ? `Terminal ${resolvedTerminalId}` : 'Mobile Device',
      details: `Synced ${events.length} offline events: ${merged} merged, ${skipped} skipped, ${failed} failed.`,
      ipAddress: getIp(req),
    },
  });

  try {
    const { getIO } = require('../socket');
    getIO().emit('bulk_sync_complete', { terminalId: resolvedTerminalId, merged, skipped, failed });
  } catch (_) {}

  res.status(200).json({ merged, skipped, failed, total: events.length, results });
});

export default router;
