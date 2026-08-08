# Settings — deferred features

Controls removed from the Settings UI (or left visible but not fully enforced) remain stored as DB keys where applicable. This document tracks what is deferred so we do not reintroduce stub toggles without wiring them.

## Operational

- **Grace period** (`gracePeriod`) — late punch tolerance not enforced from Settings
- **Early checkout** (`earlyCheckout`) — early leave threshold not enforced
- **Max consecutive days** (`maxConsecutiveDays`) — fatigue / consecutive-day caps
- **Auto break log** (`autoBreakLog`) — automatic break insert on clock events

## Shifts

- **Shift buffer time** (`shiftBufferTime`)
- **Min rest between shifts** (`minRestBetweenShifts`)
- **Shift swap approval** (`shiftSwapApproval`)
- **Auto-assign overflow** (`autoAssignOverflow`)

Capacity alerts and shift CRUD remain live.

## Biometric

- **Re-enrollment reminders** (`bio_reenrollment_days`)
- **Supervisor enroll toggle in Biometric** (`bio_supervisor_enroll`) — enroll permission stays under **Role Permissions** only

Enrollment sample count, retention, purge, and access audit remain live.

## Security (non-MFA)

- **CORS origin from Settings** (`sec_cors_origin`) — use server/env config instead
- **Session log toggle** (`sec_session_log`) — login events still appear via audit trail when recorded
- **Refresh token expiry** (`sec_refresh_expiry`)
- **Password expiry days** (`sec_password_expiry`)

**Kept live:** MFA / 2FA policy (`sec_mfa_enabled`), lockout, JWT expiry, password min length, HTTPS force, IP whitelist, kiosk token. Per-user TOTP enroll under **My Profile**.

## Notifications

- **SMS** destination / SMS channel (`notif_sms`)
- **Digest frequency** (`notif_digest_freq`)

**Kept live:** email (SMTP via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`), webhook, event toggles, quiet hours.

## Payroll

- Night differential pay
- Holiday calendar editor
- Payroll encrypt / auto-export (CSV path and manual export remain)

## Audit

- Retention enforcement (`audit_retention_days`)
- Immutable / GDPR mode toggles (`audit_immutable`, `audit_gdpr_mode`)
- Data residency selector

Export of audit archives remains available.

## System

- Log level from Settings (`sys_log_level`)
- Gzip compression toggle (`sys_compression`)

Backups schedule fields and rate limits remain.

## Floor Kiosk (PWA)

The Capacitor/Android APK was removed. Floor tablets use the web kiosk at `/kiosk`
(Add to Home Screen). Device unlock uses the shared kiosk token (Settings → Security).

Deferred / not applicable anymore:
- APK pairing codes, BLE proximity, TTS, offline PIN override, APK heartbeat registry UI
- Legacy `mobile_*` Settings keys may still exist in the DB but are unused by the PWA path

## Integrations

Third-party HR / payroll / messaging connectors — “coming later” placeholder only.

## Face / kiosk (related)

- ArcFace / advanced liveness providers
- Legacy APK BLE pairing (removed with Capacitor app)
