import { Router, Request, Response } from 'express';
import prisma from '../db';
import { getIp } from '../utils/helpers';
import { authenticateToken } from '../middleware/authMiddleware';
import { sendWebhookNotification } from '../utils/notifications';
import { getTodayWorkDate, statusFromTodayEvents } from '../utils/workDate';
import { getSettingsMap } from '../utils/settingsCache';
import { buildPayrollSettings, computeDailyPayFromSplit } from '../utils/payrollRules';
import { computeDayWork, splitRegularAndOvertime } from '../utils/attendanceCalc';
import { decryptBiometric, encryptBiometric } from '../utils/biometricCrypto';

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
    
    const faces = workers.map((w: any) => {
      let descriptorArray = null;
      if (w.faceDescriptor) {
        if (w.faceDescriptor.startsWith('[')) {
          // Legacy format (JSON string array)
          descriptorArray = JSON.parse(decryptBiometric(w.faceDescriptor));
        } else {
          // Optimized format (Base64 encoded Float32Array)
          const buffer = Buffer.from(decryptBiometric(w.faceDescriptor), 'base64');
          const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
          descriptorArray = Array.from(new Float32Array(arrayBuffer));
        }
      }
      return {
        workerId: w.employeeCode, 
        employeeCode: w.employeeCode,
        name: w.name,
        descriptor: descriptorArray
      };
    }).filter((f: any) => f.descriptor !== null);

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

    const startOfMonth = new Date(y, m - 1, 1);
    const endOfMonth = new Date(y, m, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const todayWorkDate = await getTodayWorkDate();
    const settings = await getSettingsMap();
    const ps = buildPayrollSettings(settings);
    const bs = {
      deductBreaks: ps.deductBreaks,
      teaBreakDurationMs: ps.teaBreakDurationMs,
      lunchBreakDurationMs: ps.lunchBreakDurationMs,
    };

    const events = await prisma.attendanceEvent.findMany({
      where: { workerId: worker.id, timestamp: { gte: startOfMonth, lt: endOfMonth } },
      orderBy: { timestamp: 'asc' },
    });
    const overrides = await prisma.dailyOverride.findMany({
      where: {
        workerId: worker.id,
        date: {
          gte: `${y}-${String(m).padStart(2, '0')}-01`,
          lte: `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`,
        },
      },
    });
    const overrideMap = new Map(overrides.map((o) => [o.date, o]));

    const IST_OFFSET_MS = 330 * 60000;
    const dateFromEvent = (timestamp: Date) =>
      new Date(timestamp.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

    const eventsByDay = new Map<string, typeof events>();
    events.forEach((e) => {
      const d = dateFromEvent(e.timestamp);
      if (!eventsByDay.has(d)) eventsByDay.set(d, []);
      eventsByDay.get(d)!.push(e);
    });

    let daysPresent = 0;
    let daysIncomplete = 0;
    let daysAbsent = 0;
    let totalRegularHours = 0;
    let totalOvertimeHours = 0;
    let monthlySalary = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = eventsByDay.get(date) ?? [];
      const dayWork = computeDayWork(dayEvents, bs, date === todayWorkDate);

      if (dayWork.status === 'absent') {
        daysAbsent += 1;
        continue;
      }
      if (dayWork.status === 'incomplete') daysIncomplete += 1;
      if (dayWork.hasCheckIn) daysPresent += 1;

      const override = overrideMap.get(date);
      let regularHours: number;
      let overtimeHours: number;

      if (override) {
        if (override.regularHours != null && override.overtimeHours != null) {
          regularHours = override.regularHours;
          overtimeHours = override.overtimeHours;
        } else {
          const split = splitRegularAndOvertime(override.hours, ps.standardWorkHours, ps.overtimeThreshold);
          regularHours = split.regularHours;
          overtimeHours = split.overtimeHours;
        }
      } else if (dayWork.workedHours > 0) {
        const split = splitRegularAndOvertime(dayWork.workedHours, ps.standardWorkHours, ps.overtimeThreshold);
        regularHours = split.regularHours;
        overtimeHours = split.overtimeHours;
      } else {
        continue;
      }

      const pay = computeDailyPayFromSplit(regularHours, overtimeHours, date, worker, ps);
      totalRegularHours += pay.regularHours;
      totalOvertimeHours += pay.overtimeHours;
      monthlySalary += pay.gross;
    }

    const todayEvents = eventsByDay.get(todayWorkDate) ?? [];
    const liveStatus = statusFromTodayEvents(todayEvents);

    res.json({
      employeeCode: worker.employeeCode,
      name: worker.name,
      month: `${y}-${String(m).padStart(2, '0')}`,
      daysPresent,
      daysIncomplete,
      daysAbsent,
      monthlySalary: parseFloat(monthlySalary.toFixed(2)),
      totalRegularHours: parseFloat(totalRegularHours.toFixed(2)),
      totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
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

// PATCH /api/workers/:id/face - update worker face descriptor and photo
router.patch('/:id/face', authenticateToken, async (req: Request, res: Response) => {
  const { faceDescriptor, avatarPhoto } = req.body;
  if (!faceDescriptor || !Array.isArray(faceDescriptor)) {
    return res.status(400).json({ error: 'Missing or invalid faceDescriptor' });
  }
  try {
    const existing = await prisma.worker.findUnique({
      where: { employeeCode: req.params.id as string }
    });
    if (!existing) return res.status(404).json({ error: 'Worker not found' });

    // Storage Optimization: Convert 128 floats to a Float32Array, then base64 string
    // This reduces storage from ~2.5KB (JSON string) to exactly ~684 bytes (Base64)
    const float32Array = new Float32Array(faceDescriptor);
    const buffer = Buffer.from(float32Array.buffer);
    const base64Descriptor = buffer.toString('base64');

    await prisma.worker.update({
      where: { employeeCode: String(req.params.id) },
      data: { 
        faceDescriptor: encryptBiometric(base64Descriptor),
        avatarPhoto: avatarPhoto || null
      },
    });

    await prisma.auditLog.create({
      data: {
        actor: (req as any).user?.username || 'Supervisor',
        action: 'Face Registered',
        target: `${existing.name} (${existing.employeeCode})`,
        details: 'Facial recognition data and photo updated (optimized storage)',
        ipAddress: getIp(req),
      },
    });

    res.json({ message: 'Face descriptor and photo updated successfully' });
  } catch (err) {
    console.error('Face update error:', err);
    res.status(500).json({ error: 'Failed to update face descriptor' });
  }
});

export default router;
