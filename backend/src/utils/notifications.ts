import nodemailer from 'nodemailer';
import prisma from '../db';
import { getSettingsMap } from './settingsCache';
import { settingBool } from './settingsDefaults';

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isQuietHours(settings: Record<string, string>): boolean {
  if (!settingBool(settings, 'notif_quiet_hours', false)) return false;
  const start = parseTimeToMinutes(settings.notif_quiet_start || '22:00');
  const end = parseTimeToMinutes(settings.notif_quiet_end || '06:00');
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (start <= end) {
    return mins >= start && mins < end;
  }
  return mins >= start || mins < end;
}

function smtpConfigured(): boolean {
  return Boolean((process.env.SMTP_HOST || '').trim());
}

async function logEmailFailure(details: string) {
  console.warn(`[Notification] Email send failed: ${details}`);
  try {
    await prisma.auditLog.create({
      data: {
        actor: 'System',
        action: 'Notification Email Failed',
        target: 'SMTP',
        details,
        ipAddress: 'System',
      },
    });
  } catch {
    /* ignore audit failures */
  }
}

/**
 * Send email via SMTP_* env. Soft-fails (logs + audit) when SMTP is not configured.
 */
export async function sendSmtpEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const host = (process.env.SMTP_HOST || '').trim();
  if (!host) {
    await logEmailFailure(
      'SMTP not configured — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in backend .env'
    );
    return false;
  }

  const port = Number(process.env.SMTP_PORT || '587');
  const user = (process.env.SMTP_USER || '').trim();
  const pass = process.env.SMTP_PASS || '';
  const from = (process.env.SMTP_FROM || user || 'noreply@fams.local').trim();

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });

    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
    return true;
  } catch (err: any) {
    await logEmailFailure(err?.message || String(err));
    return false;
  }
}

/**
 * Dispatches alert to webhook and/or email when event is enabled and not in quiet hours.
 */
export async function sendWebhookNotification(eventKey: string, message: string) {
  try {
    const settings = await getSettingsMap();
    if (settings.notif_channel === 'none') return;
    if (isQuietHours(settings)) {
      console.log(`[Notification] Suppressed [${eventKey}] — quiet hours`);
      return;
    }
    if (settings[eventKey] === 'false') return;

    const channel = settings.notif_channel || 'webhook';
    const webhookUrl = (settings.notif_webhook_url || '').trim();

    if (channel === 'webhook' || channel === 'all') {
      if (!webhookUrl.startsWith('http')) {
        console.log(`[Notification] Skipping webhook — URL not configured`);
      } else {
        const payload = {
          text: `📢 *FAMS ALERT* 📢\n${message}`,
          content: `📢 **FAMS ALERT** 📢\n${message}`,
          username: 'FAMS Notifier',
          timestamp: new Date().toISOString(),
        };
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          console.warn(`[Notification] Webhook failed: ${response.status}`);
        }
      }
    }

    if (channel === 'email' || channel === 'all') {
      const email = (settings.notif_email || '').trim();
      if (!email) {
        console.log(`[Notification] Skipping email — no recipients configured`);
      } else if (!smtpConfigured()) {
        await logEmailFailure(
          'Email channel selected but SMTP_* env vars are missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in backend .env'
        );
      } else {
        const plain = message.replace(/\*/g, '').replace(/`/g, '');
        await sendSmtpEmail({
          to: email,
          subject: `FAMS Alert: ${eventKey.replace(/^notif_/, '').replace(/_/g, ' ')}`,
          text: plain,
        });
      }
    }

    // SMS is deferred — log only if explicitly selected (legacy channel values)
    if (channel === 'sms') {
      console.log(`[Notification] SMS deferred — configure email or webhook instead`);
    }
  } catch (err) {
    console.error('[Notification Exception]', err);
  }
}

/** Log biometric access when bio_audit_access is enabled. */
export async function logBiometricAccess(actor: string, target: string, details: string, ip = 'System') {
  const settings = await getSettingsMap();
  if (!settingBool(settings, 'bio_audit_access', true)) return;
  await prisma.auditLog.create({
    data: { actor, action: 'Biometric Access', target, details, ipAddress: ip },
  });
}
