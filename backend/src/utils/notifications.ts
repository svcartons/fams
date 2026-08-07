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

/**
 * Dispatches alert to webhook when event is enabled and not in quiet hours.
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
      if (email) {
        console.log(`[Notification] Email to ${email}: ${message.replace(/\n/g, ' ')}`);
      }
    }

    if (channel === 'sms' || channel === 'all') {
      const sms = (settings.notif_sms || '').trim();
      if (sms) {
        console.log(`[Notification] SMS to ${sms}: ${message.replace(/\n/g, ' ')}`);
      }
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
