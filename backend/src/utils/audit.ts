import crypto from 'crypto';
import prisma from '../db';

export type AuditInput = {
  actor: string;
  action: string;
  target: string;
  details: string;
  ipAddress?: string;
  retentionClass?: string;
};

/** Append a tamper-evident audit record. The previous hash links the ledger. */
export async function writeAuditLog(input: AuditInput) {
  const previous = await prisma.auditLog.findFirst({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const createdAt = new Date();
  const previousHash = previous?.hash || null;
  const id = crypto.randomUUID();
  const hash = crypto.createHash('sha256').update(JSON.stringify({
    id,
    previousHash,
    createdAt: createdAt.toISOString(),
    actor: input.actor,
    action: input.action,
    target: input.target,
    details: input.details,
    ipAddress: input.ipAddress || 'System',
  })).digest('hex');

  return prisma.auditLog.create({
    data: {
      id,
      actor: input.actor,
      action: input.action,
      target: input.target,
      details: input.details,
      ipAddress: input.ipAddress || 'System',
      createdAt,
      previousHash,
      hash,
      retentionClass: input.retentionClass || 'compliance',
    },
  });
}
