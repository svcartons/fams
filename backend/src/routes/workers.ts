import { Router, Request, Response } from 'express';
import prisma from '../db';
import { getIp } from '../utils/helpers';
import { authenticateToken } from '../middleware/authMiddleware';
import { sendWebhookNotification } from '../utils/notifications';
import { getTodayWorkDate, statusFromTodayEvents } from '../utils/workDate';
import { encryptBiometric } from '../utils/biometricCrypto';
import { assertWorkDateEditable, buildSalaryPeriodReport } from '../utils/salaryPeriod';
import {
  normalizeIncomingFacePayload,
  parseFaceDescriptors,
  serializeFaceDescriptors,
} from '../utils/faceDescriptor';

const router = Router();


// GET /api/workers/faces - get all registered face descriptors
router.get('/faces', authenticateToken, async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  if (!['admin', 'terminal'].includes(authUser?.role)) {
    return res.status(403).json({ error: 'Face sync is only available to registered terminals' });
  }

  try {
    const workers = await prisma.worker.findMany({
      where: { 
        faceDescriptor: { not: null },
        isActive: true // Only active workers for kiosk
      },
      select: { employeeCode: true, name: true, faceDescriptor: true }
    });
    
    const faces = workers.map((w) => {
      const descriptors = parseFaceDescriptors(w.faceDescriptor);
      if (descriptors.length === 0) return null;
      return {
        workerId: w.employeeCode, 
        employeeCode: w.employeeCode,
        name: w.name,
        descriptor: descriptors[0],
        descriptors,
      };
    }).filter(Boolean);

    res.json(faces);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch face data' });
  }
});

// GET /api/workers - list all workers with filtering
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  const { search, department } = req.query;
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin' && userRole !== 'terminal') {
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'perm_supervisor_worker_view' } });
      if (setting?.value === 'false') {
        return res.status(403).json({ error: 'Worker directory access restricted by administrator' });
      }
    }

    const workers = await prisma.worker.findMany({
      where: {
        AND: [
          { isActive: true }, // Only show active workers in directory
          department ? { department: String(department) } : {},
          search ? {
            OR: [
              { name: { contains: String(search) } },
              { employeeCode: { contains: String(search) } },
              { email: { contains: String(search) } },
              { role: { contains: String(search) } },
            ]
          } : {}
        ]
      },
      include: { shift: true, user: { select: { username: true, role: true } } },
      orderBy: { employeeCode: 'asc' },
    });
    res.json(workers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

// GET /api/workers/:id/summary?month=YYYY-MM
router.get('/:id/summary', authenticateToken, async (req: Request, res: Response) => {
  try {
    const employeeCode = req.params.id as string;
    const monthStr = req.query.month as string;
    const [y, m] = monthStr
      ? monthStr.split('-').map(Number)
      : [new Date().getFullYear(), new Date().getMonth() + 1];

    const worker = await prisma.worker.findUnique({ where: { employeeCode } });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    const daysInMonth = new Date(y, m, 0).getDate();
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    const to = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const todayWorkDate = await getTodayWorkDate();

    const report = await buildSalaryPeriodReport({ from, to, periodLabel: `${y}-${String(m).padStart(2, '0')}` });
    const row = report.records.find((r) => r.employeeCode === employeeCode);

    const events = await prisma.attendanceEvent.findMany({
      where: { workerId: worker.id, workDate: todayWorkDate },
      orderBy: { timestamp: 'asc' },
    });
    const liveStatus = statusFromTodayEvents(events);

    res.json({
      employeeCode: worker.employeeCode,
      name: worker.name,
      month: `${y}-${String(m).padStart(2, '0')}`,
      daysPresent: row?.daysPresent ?? 0,
      daysIncomplete: row?.incompleteDays ?? 0,
      daysAbsent: Math.max(0, daysInMonth - (row?.daysPresent ?? 0) - (row?.incompleteDays ?? 0)),
      monthlySalary: row?.salary ?? 0,
      totalRegularHours: row?.totalRegularHours ?? 0,
      totalOvertimeHours: row?.overtimeHours ?? 0,
      liveStatus,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch worker summary' });
  }
});

// GET /api/workers/:id - get single worker with latest status
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const worker = await prisma.worker.findUnique({
      where: { employeeCode: req.params.id as string },
      include: {
        shift: true,
        attendanceEvents: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
    });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });
    res.json(worker);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch worker' });
  }
});

// POST /api/workers - create new worker
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const userRole = (req as any).user?.role;
  if (userRole !== 'admin') {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'perm_supervisor_enroll_workers' } });
    if (setting?.value !== 'true') {
      return res.status(403).json({ error: 'Worker enrollment restricted to administrators.' });
    }
  }

  // Accept either employeeCode or workerId for maximum compatibility
  let employeeCode = req.body.employeeCode || req.body.workerId;
  const { name, email, phone, department, role, shiftId, dailyWage, overtimeRate, faceDescriptor } = req.body;
  
  // Detailed validation
  if (!employeeCode || !name || !department) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const worker = await prisma.worker.create({
      data: {
        employeeCode,
        name,
        email,
        phone,
        department,
        role: role || 'worker',
        shiftId: (shiftId && shiftId.trim() !== '') ? shiftId : null,
        dailyWage: Number(dailyWage) || 0,
        overtimeRate: Number(overtimeRate) || 0,
        faceDescriptor: faceDescriptor ? encryptBiometric(JSON.stringify(faceDescriptor)) : null
      },
    });

    const actor = (req as any).user?.username || 'Supervisor';
    await prisma.auditLog.create({
      data: {
        actor,
        action: 'Worker Added',
        target: `${name} (${employeeCode})`,
        details: `New worker registered in ${department} as ${role}`,
        ipAddress: getIp(req),
      },
    });

    // Dispatch webhook alert for enrollment
    sendWebhookNotification(
      'notif_enrollment',
      `👤 **New Worker Enrolled**\n• Name: \`${name}\`\n• Code: \`${employeeCode}\`\n• Department: \`${department}\`\n• Role: \`${role}\`\n• Added By: \`${actor}\``
    ).catch(() => {});

    res.status(201).json(worker);
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Employee Code already exists' });
    }
    res.status(500).json({ error: 'Failed to create worker' });
  }
});

// PUT /api/workers/:id - update worker info
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  const { name, email, phone, department, role, hourlyRate, shiftId, dailyWage, overtimeRate } = req.body;
  try {
    const existing = await prisma.worker.findUnique({
      where: { employeeCode: req.params.id as string }
    });

    if (!existing) return res.status(404).json({ error: 'Worker not found' });

    // Wage changes affect current work date pay — block if that day is in a finalized period
    if (dailyWage !== undefined || overtimeRate !== undefined) {
      try {
        await assertWorkDateEditable(await getTodayWorkDate());
      } catch (err: any) {
        if (err?.status === 409 || err?.code === 'PAYROLL_FINALIZED') {
          return res.status(409).json({ error: err.message, code: 'PAYROLL_FINALIZED' });
        }
        throw err;
      }
    }

    const worker = await prisma.worker.update({
      where: { employeeCode: req.params.id as string },
      data: { 
        name: name !== undefined ? name : undefined,
        email: email !== undefined ? email : undefined,
        phone: phone !== undefined ? phone : undefined,
        department: department !== undefined ? department : undefined,
        role: role !== undefined ? role : undefined,
        dailyWage: dailyWage !== undefined ? Number(dailyWage) : undefined,
        overtimeRate: overtimeRate !== undefined ? Number(overtimeRate) : undefined,
        shiftId: shiftId !== undefined ? (shiftId.trim() !== '' ? shiftId : null) : undefined
      },
    });

    // Audit Log
    let details = [];
    if (name && name !== existing.name) details.push(`name to ${name}`);
    if (email !== undefined && email !== existing.email) details.push(`email to ${email}`);
    if (phone !== undefined && phone !== existing.phone) details.push(`phone to ${phone}`);
    if (department && department !== existing.department) details.push(`department to ${department}`);
    if (role && role !== existing.role) details.push(`role to ${role}`);
    if (dailyWage !== undefined && Number(dailyWage) !== existing.dailyWage) details.push(`daily wage to ₹${dailyWage}`);
    if (overtimeRate !== undefined && Number(overtimeRate) !== existing.overtimeRate) details.push(`overtime rate to ₹${overtimeRate}/hr`);
    if (shiftId !== undefined && shiftId !== existing.shiftId) details.push(`shift assignment changed`);

    if (details.length > 0) {
      await prisma.auditLog.create({
        data: {
          actor: (req as any).user?.username || 'Supervisor',
          action: 'Worker Updated',
          target: `${worker.name} (${worker.employeeCode})`,
          details: `Updated ${details.join(', ')}`,
          ipAddress: getIp(req),
        },
      });
    }

    res.json(worker);
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'Failed to update worker' });
  }
});

// DELETE /api/workers/:id
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'perm_supervisor_worker_delete' } });
      if (setting?.value !== 'true') {
        return res.status(403).json({ error: 'Not authorized to delete workers' });
      }
    }

    const worker = await prisma.worker.findUnique({ where: { employeeCode: String(id) } });
    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    // BUG FIX: Use Soft Delete to preserve historical records for reports
    // Biometric signatures are scrubbed immediately to ensure legal GDPR/BIPA compliance
    await prisma.worker.update({ 
      where: { employeeCode: String(id) },
      data: { 
        isActive: false,
        faceDescriptor: null,
        avatarPhoto: null
      }
    });
    
    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'Supervisor',
        action: 'Worker Deleted',
        target: `${worker.name} (${worker.employeeCode})`,
        details: 'Worker deactivated (soft deleted) to preserve history',
        ipAddress: getIp(req),
      },
    });

    res.json({ message: 'Worker deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete worker' });
  }
});

// PATCH /api/workers/:id/face - update worker face descriptor(s) and photo
router.patch('/:id/face', authenticateToken, async (req: Request, res: Response) => {
  const { faceDescriptor, avatarPhoto } = req.body;
  try {
    let descriptors: number[][];
    try {
      descriptors = normalizeIncomingFacePayload(faceDescriptor);
    } catch {
      return res.status(400).json({ error: 'Missing or invalid faceDescriptor' });
    }

    const existing = await prisma.worker.findUnique({
      where: { employeeCode: req.params.id as string }
    });
    if (!existing) return res.status(404).json({ error: 'Worker not found' });

    await prisma.worker.update({
      where: { employeeCode: String(req.params.id) },
      data: {
        faceDescriptor: serializeFaceDescriptors(descriptors),
        avatarPhoto: avatarPhoto || null
      },
    });

    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'Supervisor',
        action: 'Face Registered',
        target: `${existing.name} (${existing.employeeCode})`,
        details: `Facial recognition updated (${descriptors.length} sample${descriptors.length === 1 ? '' : 's'})`,
        ipAddress: getIp(req),
      },
    });

    res.json({ message: 'Face descriptor and photo updated successfully', samples: descriptors.length });
  } catch (err) {
    console.error('Face update error:', err);
    res.status(500).json({ error: 'Failed to update face descriptor' });
  }
});

export default router;
