import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../db';

const router = Router();

const authorizeShiftManagement = async (req: Request, res: Response, next: NextFunction) => {
  const userRole = (req as any).user?.role;
  if (userRole === 'admin') {
    return next();
  }
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'perm_supervisor_manage_shifts' } });
    if (setting?.value === 'true') {
      return next();
    }
  } catch (err) {
    // Ignore error, fallback to 403
  }
  return res.status(403).json({ error: 'Shift management restricted to administrators.' });
};

// GET /api/shifts — list all shifts
router.get('/', async (_req: Request, res: Response) => {
  try {
    const shifts = await prisma.shift.findMany({ orderBy: { startTime: 'asc' } });
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
});

// POST /api/shifts — create a new shift
router.post('/', authorizeShiftManagement, async (req: Request, res: Response) => {
  try {
    const { name, startTime, endTime, capacity } = req.body;
    if (!name || !startTime || !endTime || !capacity) {
      return res.status(400).json({ error: 'name, startTime, endTime and capacity are required' });
    }
    const shift = await prisma.shift.create({
      data: { name, startTime, endTime, capacity: Number(capacity) },
    });
    res.status(201).json(shift);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

// PUT /api/shifts/:id — update a shift
router.put('/:id', authorizeShiftManagement, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { name, startTime, endTime, capacity } = req.body;

    // BUG-08: check existence before update
    const existing = await prisma.shift.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Shift not found' });

    const shift = await prisma.shift.update({
      where: { id },
      data: { name, startTime, endTime, capacity: capacity ? Number(capacity) : undefined },
    });
    res.json(shift);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

// DELETE /api/shifts/:id — delete a shift
router.delete('/:id', authorizeShiftManagement, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    // BUG-09: check existence before delete
    const existing = await prisma.shift.findUnique({
      where: { id },
      include: { _count: { select: { workers: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Shift not found' });

    await prisma.$transaction([
      prisma.worker.updateMany({ where: { shiftId: id }, data: { shiftId: null } }),
      prisma.shift.delete({ where: { id } })
    ]);
    res.json({
      message: 'Shift deleted',
      workersUnassigned: (existing as any)._count.workers,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete shift' });
  }
});

export default router;
