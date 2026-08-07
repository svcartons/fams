import { Router, Request, Response } from 'express';
import prisma from '../db';

const router = Router();

// GET /api/audit - list audit logs
router.get('/', async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'admin') {
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'perm_supervisor_view_audit' } });
      if (setting?.value !== 'true') {
        return res.status(403).json({ error: 'Audit logs restricted to administrators.' });
      }
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const search = (req.query.search as string) ?? '';

    const logs = await prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      where: search
        ? {
            OR: [
              { actor: { contains: search } },
              { action: { contains: search } },
              { target: { contains: search } },
            ],
          }
        : undefined,
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
