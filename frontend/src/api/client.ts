const API_BASE = '/api';

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  // Browser sessions use an HttpOnly cookie. Only attach the kiosk device token
  // on the standalone kiosk surface — otherwise it steals Authorization and
  // breaks admin routes (e.g. change-password → "User not found").
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  const onKiosk = typeof window !== 'undefined' && window.location.pathname.startsWith('/kiosk');
  if (onKiosk) {
    const token = localStorage.getItem('fams_kiosk_token');
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('fams_user');
      const publicPaths = ['/login', '/setup', '/forgot-password', '/kiosk'];
      if (!publicPaths.includes(window.location.pathname)) {
        window.location.href = '/login';
      }
    }
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.error || `Request failed with status ${response.status}`) as Error & {
      code?: string;
      status?: number;
    };
    error.code = errorData.code;
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// --- Auth ---
export type AuthUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  avatarUrl?: string;
  hasSeenOnboarding?: boolean;
  hasPassword?: boolean;
  authProvider?: string;
};

export const login = (username: string, password: string, otp?: string) =>
  fetchJson<{ token: string; user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, otp }),
  });

export const googleLogin = (credential: string) =>
  fetchJson<{ token: string; user: AuthUser }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });

/** Unlock a remote PWA/phone kiosk with an authorized Google admin account. */
export const kioskGooglePair = (credential: string) =>
  fetchJson<{ token: string }>('/auth/kiosk-google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });

export const getGoogleClientId = () =>
  fetchJson<{ clientId: string | null }>('/auth/google-client-id');

export const getSession = () =>
  fetchJson<{ user: AuthUser }>('/auth/session');

export const logout = () => fetchJson<{ message: string }>('/auth/logout', { method: 'POST' });

export const setupAdmin = (data: { username: string; password: string; name: string }) =>
  fetchJson<{ message: string }>('/auth/setup', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const completeOnboarding = () =>
  fetchJson<{ message: string }>('/auth/onboarding-complete', {
    method: 'POST',
  });

export const getUsers = () =>
  fetchJson<any[]>('/auth/users');

export const createUser = (data: any) =>
  fetchJson<any>('/auth/users', { method: 'POST', body: JSON.stringify(data) });

export const updateUser = (id: string, data: any) =>
  fetchJson<any>(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteUser = (id: string) =>
  fetchJson<any>(`/auth/users/${id}`, { method: 'DELETE' });

export const changePassword = (data: any) =>
  fetchJson<any>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) });

// --- Workers ---
export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  capacity: number;
}

export interface Worker {
  id: string;
  employeeCode: string;
  name: string;
  email?: string;
  phone?: string;
  department: string;
  role: string;
  dailyWage: number;
  overtimeRate: number;
  shiftId?: string | null;
  shift?: Shift;
  isActive: boolean;
  avatarPhoto?: string | null;
  user?: { username: string, role: string } | null;
}

export const getWorkers = () => fetchJson<Worker[]>('/workers');

export const createWorker = (data: Partial<Worker>) =>
  fetchJson<Worker>('/workers', { method: 'POST', body: JSON.stringify(data) });

export const updateWorker = (employeeCode: string, data: Partial<Worker>) =>
  fetchJson<Worker>(`/workers/${employeeCode}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteWorker = (employeeCode: string) =>
  fetchJson<{ message: string }>(`/workers/${employeeCode}`, { method: 'DELETE' });

export const registerFace = (employeeCode: string, faceDescriptor: number[], avatarPhoto?: string) =>
  fetchJson<{ message: string }>(`/workers/${employeeCode}/face`, {
    method: 'PATCH',
    body: JSON.stringify({ faceDescriptor, avatarPhoto }),
  });

export const getFaceDescriptors = () =>
  fetchJson<Array<{ employeeCode: string; name: string; descriptor: number[] }>>('/workers/faces');

// --- Attendance ---
export const logAttendance = (data: { employeeCode: string; eventType: string; method?: string; confidence?: number; clientEventId?: string; occurredAt?: string }) =>
  fetchJson<any>('/attendance', {
    method: 'POST',
    body: JSON.stringify(data),
  }).then(result => ({ ...result, online: true, result }));

export type BulkSyncEvent = {
  employeeCode: string;
  eventType: string;
  method?: string;
  confidence?: number | null;
  timestamp: string;
  clientEventId: string;
  deviceSequence?: number | null;
};

export const bulkSyncAttendance = (events: BulkSyncEvent[]) =>
  fetchJson<{
    merged: number;
    skipped: number;
    failed: number;
    total: number;
    results: Array<{
      index: number;
      clientEventId?: string;
      employeeCode: string;
      status: 'merged' | 'skipped' | 'failed';
      reason?: string;
    }>;
  }>('/attendance/bulk-sync', {
    method: 'POST',
    body: JSON.stringify({ events }),
  });

// BUG-15: lastEvent is now an ISO string returned from the server;
// format it on the client side to respect the user's timezone.
export interface LiveWorker {
  id: string;
  name: string;
  department: string;
  role: string;
  status: 'checked-in' | 'tea-break' | 'lunch-break' | 'checked-out' | 'absent';
  lastEvent: string | null; // ISO timestamp string
  method: string;
  duration: string;
  durationMins: number;
  avatarPhoto?: string | null;
}

export const getLiveStatus = () => fetchJson<LiveWorker[]>('/attendance/live');

// --- Dashboard ---
export interface DashboardData {
  kpi: {
    total: number;
    present: number;
    absent: number;
    onBreak: number;
    checkedOut: number;
    missedPunchCount?: number;
    workDate?: string;
  };
  alerts: Array<{ type: string; message: string }>;
  missedPunchWorkers?: Array<{ employeeCode: string; name: string }>;
  shifts: Array<{ name: string; startTime: string; endTime: string; present: number; capacity: number }>;
  recentActivity: Array<{ time: string; worker: string; action: string; type: string }>;
}

export const getDashboard = () => fetchJson<DashboardData>('/dashboard');

// --- Corrections ---
export interface Correction {
  id: string;
  employeeCode: string;
  worker: { name: string; employeeCode: string };
  requestedBy: string;
  reason: string;
  eventType: string;
  originalTime: string | null;
  correctedTime: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export const getCorrections = () => fetchJson<Correction[]>('/corrections');

export const submitCorrection = (data: {
  employeeCode: string;
  requestedBy: string;
  reason: string;
  eventType: string;
  originalTime?: string;
  correctedTime?: string;
}) =>
  fetchJson<Correction>('/corrections', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const approveCorrection = (id: string, approvedBy: string) =>
  fetchJson<Correction>(`/corrections/${id}/approve`, {
    method: 'PATCH',
    body: JSON.stringify({ approvedBy }),
  });

export const rejectCorrection = (id: string, rejectedBy: string) =>
  fetchJson<Correction>(`/corrections/${id}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ rejectedBy }),
  });

// --- Audit Logs ---
export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

export const getAuditLogs = (search?: string) =>
  fetchJson<AuditLog[]>(`/audit${search ? `?search=${encodeURIComponent(search)}` : ''}`);

// --- Daily Report ---
export interface DailyRecord {
  employeeCode: string;
  name: string;
  department: string;
  checkIn: string;
  teaBreak: string;
  lunchBreak: string;
  checkOut: string;
  totalPresence: string;
  netWork: string;
  status: 'complete' | 'incomplete' | 'absent';
  isActive: boolean;
}

export interface DailyReportData {
  date: string;
  summary: {
    total: number;
    complete: number;
    incomplete: number;
    absent: number;
    present?: number;
    attendancePct?: number;
  };
  records: DailyRecord[];
}

export const getDailyReport = (date?: string) =>
  fetchJson<DailyReportData>(`/report/daily${date ? `?date=${date}` : ''}`);

export interface MonthDaySummary {
  date: string;
  total: number;
  present: number;
  complete: number;
  incomplete: number;
  absent: number;
  attendancePct: number;
}

export interface MonthSummaryData {
  month: string;
  days: MonthDaySummary[];
}

export const getMonthSummary = (month?: string) =>
  fetchJson<MonthSummaryData>(`/report/month-summary${month ? `?month=${month}` : ''}`);

export interface WorkerSummary {
  employeeCode: string;
  name: string;
  month: string;
  daysPresent: number;
  daysIncomplete: number;
  daysAbsent: number;
  monthlySalary: number;
  totalRegularHours: number;
  totalOvertimeHours: number;
  liveStatus: string;
}

export const getWorkerSummary = (employeeCode: string, month?: string) =>
  fetchJson<WorkerSummary>(`/workers/${employeeCode}/summary${month ? `?month=${month}` : ''}`);

// --- Salary Report ---
export interface SalaryRecord {
  employeeCode: string;
  name: string;
  department: string;
  role: string;
  dailyWage: number;
  overtimeRate: number;
  daysPresent: number;
  totalRegularHours?: number;
  baseSalary: number;
  overtimeHours: number;
  overtimePay: number;
  salary: number; // Total Payout
  isActive: boolean;
  dailyBreakdown: Array<{
    date: string;
    hours: number;
    regularHours: number;
    overtimeHours: number;
    regularPay: number;
    overtimePay: number;
    dayPay: number;
    status: 'complete' | 'incomplete' | 'absent';
    isOverridden: boolean;
  }>;
}

export interface SalaryReportData {
  month: string;
  totalPayout: number;
  records: SalaryRecord[];
}

export const getSalaryReport = (month?: string) =>
  fetchJson<SalaryReportData>(`/report/salary${month ? `?month=${month}` : ''}`);

export const saveSalaryOverride = (data: {
  employeeCode: string;
  date: string;
  hours?: number;
  regularHours?: number;
  overtimeHours?: number;
  reason?: string;
}) =>
  fetchJson<any>('/report/salary/override', {
    method: 'POST',
    body: JSON.stringify(data),
  });

// --- System Settings ---
export interface SystemSettings {
  teaBreakDuration: string;
  lunchBreakDuration: string;
  breakOvertimeAlert: string;
  standardWorkHours: string;
  overtimeThreshold: string;
  deductBreaks: string;
  perm_supervisor_salary_view: string;
  perm_supervisor_worker_view: string;
  perm_supervisor_worker_delete: string;
  perm_supervisor_correction_approve: string;
  ai_threshold: string;

  // Operational Rules
  gracePeriod?: string;
  earlyCheckout?: string;
  maxConsecutiveDays?: string;
  midnightAlgo?: string;
  autoBreakLog?: string;
  weekendMultiplier?: string;
  holidayMultiplier?: string;
  nightDiffRate?: string;
  nightDiffStart?: string;
  weekendOT?: string;
  holidayPay?: string;
  nightDiff?: string;

  // Shift Configuration
  shiftBufferTime?: string;
  minRestBetweenShifts?: string;
  shiftSwapApproval?: string;
  autoAssignOverflow?: string;
  shiftCapacityAlertPct?: string;
  shiftCapacityAlerts?: string;

  // Supervisor Permissions
  perm_supervisor_enroll_workers?: string;
  perm_supervisor_manage_shifts?: string;
  perm_supervisor_export_payroll?: string;
  perm_supervisor_view_analytics?: string;
  perm_supervisor_send_notifications?: string;
  perm_supervisor_manage_holidays?: string;
  perm_supervisor_view_audit?: string;
  perm_supervisor_kiosk_config?: string;

  // AI & Kiosk
  ai_model?: string;
  ai_scan_interval?: string;
  ai_auto_retry?: string;
  ai_model_cache_mb?: string;
  ai_landmarks?: string;
  ai_liveness?: string;
  ai_rfid_fallback?: string;
  ai_multiface_alert?: string;
  kiosk_camera_res?: string;
  kiosk_idle_timeout?: string;
  kiosk_ir_mode?: string;
  kiosk_offline_mode?: string;

  // Biometric & Enrollment
  bio_enrollment_samples?: string;
  bio_reenrollment_days?: string;
  bio_retention_days?: string;
  bio_auto_delete?: string;
  bio_audit_access?: string;
  bio_supervisor_enroll?: string;

  // Security & Auth
  sec_jwt_expiry?: string;
  sec_refresh_expiry?: string;
  sec_lockout_attempts?: string;
  sec_lockout_duration?: string;
  sec_password_min_len?: string;
  sec_password_expiry?: string;
  sec_mfa_enabled?: string;
  sec_ip_whitelist?: string;
  sec_session_log?: string;
  sec_force_https?: string;
  sec_cors_origin?: string;
  sec_ip_list?: string;
  sec_kiosk_token?: string;

  // Notifications & Alerts
  notif_channel?: string;
  notif_email?: string;
  notif_sms?: string;
  notif_webhook_url?: string;
  notif_digest_freq?: string;
  notif_quiet_hours?: string;
  notif_quiet_start?: string;
  notif_quiet_end?: string;
  notif_overtime_alert?: string;
  notif_missed_punch?: string;
  notif_login_failed?: string;
  notif_enrollment?: string;
  notif_payroll_ready?: string;
  notif_low_capacity?: string;
  notif_capacity_pct?: string;

  // Payroll & Export
  payroll_format?: string;
  payroll_period?: string;
  payroll_rounding?: string;
  payroll_currency?: string;
  payroll_tax_rate?: string;
  payroll_deduct_breaks?: string;
  payroll_include_overtime?: string;
  payroll_encrypt?: string;
  payroll_auto_export?: string;
  payroll_export_time?: string;

  // System & Network
  sys_backup_freq?: string;
  sys_backup_retention?: string;
  sys_log_level?: string;
  sys_compression?: string;
  sys_rate_limit_window?: string;
  sys_rate_limit_max?: string;
  sys_db_url?: string;

  // Audit & Compliance
  audit_retention_days?: string;
  audit_immutable?: string;
  audit_gdpr_mode?: string;
  audit_export_enabled?: string;
  audit_data_residency?: string;

  [key: string]: string | undefined;
}

export interface SystemInfo {
  dbVersion: string;
  nodeVersion: string;
  uptime: number;
  dbStorageUsed: string;
  lastBackup: string;
  counts: {
    users: number;
    workers: number;
    attendanceEvents: number;
    corrections: number;
    auditLogs: number;
    shifts: number;
  };
}

export interface PayrollExportRecord {
  id: string;
  period: string;
  generatedAt: string;
  format: string;
  workerCount: number;
  status: string;
}

export const getSettings = () => fetchJson<SystemSettings>('/settings');

export const saveSettings = (data: SystemSettings) => fetchJson<any>('/settings', { method: 'PUT', body: JSON.stringify(data) });

export const factoryReset = () => fetchJson<any>('/settings/factory-reset', { method: 'POST' });

export const getSystemInfo = () => fetchJson<SystemInfo>('/settings/system-info');

export const purgeDescriptors = () => fetchJson<{ message: string }>('/settings/purge-descriptors', { method: 'POST' });

export const purgeAudit = () => fetchJson<{ message: string }>('/settings/purge-audit', { method: 'POST' });

export const getPayrollExports = () => fetchJson<PayrollExportRecord[]>('/settings/payroll-exports');

export const createPayrollExport = (period: string, format: string) =>
  fetchJson<PayrollExportRecord>('/settings/payroll-exports', {
    method: 'POST',
    body: JSON.stringify({ period, format }),
  });

export const downloadPayrollExport = async (exportId: string) => {
  const token = localStorage.getItem('fams_token');
  const response = await fetch(`${API_BASE}/settings/payroll-exports/${exportId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error('Download failed');
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || `payroll_export_${exportId}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const regenerateKioskToken = () =>
  fetchJson<{ token: string }>('/settings/regenerate-kiosk-token', { method: 'POST' });

export const exportAuditArchive = async () => {
  const token = localStorage.getItem('fams_token');
  const response = await fetch(`${API_BASE}/settings/audit-export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error('Audit export failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fams_audit_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// --- Shifts ---
export const getShifts = () => fetchJson<Shift[]>('/shifts');

export const createShift = (data: Omit<Shift, 'id'>) =>
  fetchJson<Shift>('/shifts', { method: 'POST', body: JSON.stringify(data) });

export const updateShift = (id: string, data: Partial<Omit<Shift, 'id'>>) =>
  fetchJson<Shift>(`/shifts/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteShift = (id: string) =>
  fetchJson<{ message: string; workersUnassigned: number }>(`/shifts/${id}`, { method: 'DELETE' });

// --- Mobile Terminals ---
export interface MobileTerminal {
  id: string;
  name: string;
  deviceModel: string | null;
  bluetoothUuid: string | null;
  status: 'pending' | 'active' | 'revoked';
  batteryLevel: number | null;
  networkQuality: string | null;
  pendingQueueSize: number | null;
  lastSeenAt: string | null;
  createdAt: string;
  isOnline: boolean;
  totalScans: number;
}

export const getTerminals = () =>
  fetchJson<MobileTerminal[]>('/terminals');

export const generateTerminalCode = (name: string) =>
  fetchJson<{ terminalId: string; pairingCode: string; name: string; status: string; message: string }>('/terminals/generate-code', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const revokeTerminal = (id: string) =>
  fetchJson<{ message: string }>(`/terminals/${id}`, { method: 'DELETE' });
