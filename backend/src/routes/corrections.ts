import { Router, Request, Response } from 'express';
import prisma from '../db';
import { getIp } from '../utils/helpers';
import { getWorkDateForTimestamp } from '../utils/workDate';
import { requireUser } from '../middleware/authMiddleware';
import { writeAuditLog } from '../utils/audit';

const router = Router();

// GET /api/corrections - get all corrections
router.get('/', async (_req: Request, res: Response) => {
  try {
    const corrections = await prisma.manualCorrection.findMany({
      orderBy: { createdAt: 'desc' },
      include: { worker: true },
    });
    res.json(corrections);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch corrections' });
  }
});

// POST /api/corrections - submit a correction request
router.post('/', requireUser, async (req: Request, res: Response) => {
  const { employeeCode, reason, eventType, originalTime, correctedTime } = req.body;
  const actor = (req as any).user;
  if (!employeeCode || !reason || !eventType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (actor?.role === 'terminal') return res.status(403).json({ error: 'Terminals cannot submit corrections' });
  try {
    const worker = await prisma.worker.findUnique({ where: { employeeCode } });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const correction = await prisma.manualCorrection.create({
      data: {
        workerId: worker.id,
        requestedBy: actor.username,
        requesterId: actor.id,
        reason,
        eventType,
        originalTime: originalTime ? new Date(originalTime) : null,
        correctedTime: correctedTime ? new Date(correctedTime) : null,
        status: 'pending',
        requestedAt: new Date(),
        originalSnapshot: JSON.stringify({ originalTime: originalTime || null, eventType }),
      },
      include: { worker: true },
    });

    await writeAuditLog({
      actor: actor.username,
      action: 'Correction Requested',
      target: `${worker.name} (${worker.employeeCode})`,
      details: `Requested ${eventType} correction: ${reason}`,
      ipAddress: getIp(req),
    });

    res.status(201).json(correction);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit correction' });
  }
});

// PATCH /api/corrections/:id/approve — ADMIN ONLY
router.patch('/:id/approve', async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    const username = (req as any).user?.username || 'Unknown';

    // Enforce: Only admins or authorized supervisors can approve corrections
    if (userRole !== 'admin') {
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'perm_supervisor_correction_approve' } });
      if (setting?.value !== 'true') {
        return res.status(403).json({ error: 'Only administrators are authorized to approve corrections.' });
      }
    }

    const existing = await prisma.manualCorrection.findUnique({ 
      where: { id: String(req.params.id) },
      include: { worker: true }
    });
    if (!existing) return res.status(404).json({ error: 'Correction not found' });
    if (existing.status !== 'pending') {
      return res.status(400).json({ error: `Correction is already ${existing.status}` });
    }

    const eventTimestamp = existing.correctedTime || new Date();
    const workDate = await getWorkDateForTimestamp(eventTimestamp);

    // Start a transaction: Update status AND insert attendance event
    const [correction, appliedEvent] = await prisma.$transaction([
      prisma.manualCorrection.update({
        where: { id: String(req.params.id) },
        data: { 
          status: 'approved',
          approverId: (req as any).user?.id,
          decidedAt: new Date(),
          afterSnapshot: JSON.stringify({ correctedTime: eventTimestamp.toISOString(), eventType: existing.eventType }),
        },
        include: { worker: true },
      }),
      prisma.attendanceEvent.create({
        data: {
          workerId: existing.workerId,
          eventType: existing.eventType,
          method: 'manual',
          timestamp: eventTimestamp,
          occurredAt: eventTimestamp,
          receivedAt: new Date(),
          actorId: (req as any).user?.id,
          syncStatus: 'accepted',
          // hourlyRate is deprecated
          workDate,
        }
      })
    ]);

    const persistedCorrection = await prisma.manualCorrection.update({
      where: { id: String(req.params.id) },
      data: { appliedEventId: appliedEvent.id },
      include: { worker: true },
    });

    await prisma.auditLog.create({
      data: {
        actor: username,
        action: 'Correction Approved',
        target: `${existing.worker.name} (${existing.worker.employeeCode})`,
        details: `Approved ${existing.eventType} manual correction (requested by ${existing.requestedBy}). Attendance record injected.`,
        ipAddress: getIp(req),
      },
    });

    try {
      const { getIO } = require('../socket');
      getIO().emit('worker_scanned', {
        id: existing.worker.employeeCode,
        name: existing.worker.name,
        department: existing.worker.department,
        role: existing.worker.role,
        status: existing.eventType,
        lastEvent: eventTimestamp.toISOString(),
        method: 'manual',
      });
    } catch (_) {}

    res.json(persistedCorrection);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve correction' });
  }
});

// PATCH /api/corrections/:id/reject — ADMIN ONLY
router.patch('/:id/reject', async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    const username = (req as any).user?.username || 'Unknown';

    // Enforce: Only admins or authorized supervisors can reject corrections
    if (userRole !== 'admin') {
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'perm_supervisor_correction_approve' } });
      if (setting?.value !== 'true') {
        return res.status(403).json({ error: 'Only administrators are authorized to reject corrections.' });
      }
    }

    // BUG-19: check existence; BUG-20: guard non-pending
    const existing = await prisma.manualCorrection.findUnique({ 
      where: { id: String(req.params.id) },
      include: { worker: true }
    });
    if (!existing) return res.status(404).json({ error: 'Correction not found' });
    if (existing.status !== 'pending') {
      return res.status(400).json({ error: `Correction is already ${existing.status}` });
    }

    const correction = await prisma.manualCorrection.update({
      where: { id: String(req.params.id) },
      data: { 
        status: 'rejected',
        approverId: (req as any).user?.id,
        decidedAt: new Date(),
      },
      include: { worker: true },
    }) as any;

    await prisma.auditLog.create({
      data: {
        actor: username,
        action: 'Correction Rejected',
        target: `${correction.worker.name} (${correction.worker.employeeCode})`,
        details: `Rejected manual correction: ${existing.reason} (requested by ${existing.requestedBy})`,
        ipAddress: getIp(req),
      },
    });

    res.json(correction);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject correction' });
  }
});

export default router;
