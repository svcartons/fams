import { useState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Shield,
  Camera,
  Clock,
  Bell,
  Download,
  Users,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Save,
  RotateCcw,
  Server,
  Link2,
  FileText,
  Fingerprint,
  Info,
  Plus,
  Layers,
  Copy,
  ExternalLink,
  LogOut,
  UserCircle,
  X,
  Eye,
  EyeOff,
  Key,
  Lock,
  Smartphone,
} from "lucide-react";
import {
  getSettings,
  saveSettings,
  factoryReset,
  getShifts,
  createShift,
  updateShift,
  deleteShift,
  getUsers,
  changePassword,
  setupMfa,
  enableMfa,
  disableMfa,
  getSystemInfo,
  purgeDescriptors,
  purgeAudit,
  getPayrollExports,
  createPayrollExport,
  downloadPayrollExport,
  regenerateKioskToken,
  exportAuditArchive,
  getAuditLogs,
  type SystemSettings,
  type Shift,
  type PayrollExportRecord,
} from "../../api/client";
import { useAuth } from "../hooks/useAuth";

// ── Types ─────────────────────────────────────────────────────────────────────

type Section =
  | "profile"
  | "operational"
  | "shifts"
  | "permissions"
  | "ai_kiosk"
  | "biometric"
  | "security"
  | "notifications"
  | "payroll"
  | "integrations"
  | "audit"
  | "system"
  | "danger"
  | "terminals";

interface NavGroup {
  label: string;
  items: {
    id: Section;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    danger?: boolean;
  }[];
}

const navGroups: NavGroup[] = [
  {
    label: "Account",
    items: [
      { id: "profile", label: "My Profile", icon: <UserCircle size={16} /> },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        id: "operational",
        label: "Operational Rules",
        icon: <Clock size={16} />,
      },
      {
        id: "shifts",
        label: "Shift Configuration",
        icon: <Layers size={16} />,
      },
    ],
  },
  {
    label: "Access Control",
    items: [
      {
        id: "permissions",
        label: "Role Permissions",
        icon: <Users size={16} />,
      },
      { id: "security", label: "Security & Auth", icon: <Shield size={16} /> },
    ],
  },
  {
    label: "AI & Biometrics",
    items: [
      { id: "ai_kiosk", label: "AI & Kiosk", icon: <Camera size={16} /> },
      {
        id: "biometric",
        label: "Biometric & Enrollment",
        icon: <Fingerprint size={16} />,
        badge: "GDPR",
      },
    ],
  },
  {
    label: "Reporting",
    items: [
      {
        id: "notifications",
        label: "Notifications & Alerts",
        icon: <Bell size={16} />,
      },
      {
        id: "payroll",
        label: "Payroll & Export",
        icon: <Download size={16} />,
      },
      {
        id: "audit",
        label: "Audit & Compliance",
        icon: <FileText size={16} />,
      },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      {
        id: "terminals",
        label: "Floor Kiosk",
        icon: <Smartphone size={16} />,
        badge: "PWA",
      },
      { id: "integrations", label: "Integrations", icon: <Link2 size={16} /> },
      { id: "system", label: "System & Network", icon: <Server size={16} /> },
    ],
  },
  {
    label: "Danger Zone",
    items: [
      {
        id: "danger",
        label: "Danger Zone",
        icon: <AlertTriangle size={16} />,
        danger: true,
      },
    ],
  },
];

const sectionMeta: Record<Section, string> = {
  profile: "Manage your account identity and update your password.",
  operational: "Configure break durations, work hours, and overtime rules.",
  shifts: "Define shift schedules, capacity limits, and roster constraints.",
  permissions: "Control what supervisors can view, edit, and approve.",
  ai_kiosk: "Tune AI recognition thresholds and kiosk display settings.",
  biometric: "Manage face enrollment policies and GDPR compliance.",
  security: "Authentication, session policies, and kiosk access tokens.",
  notifications: "Alert thresholds and supervisor notification preferences.",
  payroll: "Export formats, pay periods, and salary calculation rules.",
  integrations: "Connect external systems and webhook endpoints.",
  audit: "Retention policies and compliance export settings.",
  system: "Network, storage, and system maintenance options.",
  danger: "Irreversible actions — proceed with extreme caution.",
  terminals: "Install the floor attendance kiosk as a PWA on tablets.",
};

// ── Primitive UI Components ────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`fams-settings-toggle ${checked ? "is-on" : ""} ${disabled ? "is-disabled" : ""}`}
    >
      <span className="fams-settings-toggle-knob" />
    </button>
  );
}

function NumberInput({
  value,
  onChange,
  suffix,
  min,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="fams-settings-number-wrap">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix && <span className="fams-settings-number-suffix">{suffix}</span>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`fams-settings-input ${className}`}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="fams-settings-select"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Card({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`fams-settings-card ${className}`} style={style}>
      {children}
    </div>
  );
}

function CardHeader({
  title,
  description,
  titleStyle = {},
  action,
}: {
  title: string;
  description: string;
  titleStyle?: React.CSSProperties;
  action?: React.ReactNode;
}) {
  return (
    <div className="fams-settings-card-header">
      <div>
        <h2 className="fams-settings-card-title" style={titleStyle}>
          {title}
        </h2>
        <p className="fams-settings-card-desc">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  last = false,
  tag,
  disabled = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
  tag?: { label: string; color: "green" | "amber" | "red" | "blue" };
  disabled?: boolean;
}) {
  return (
    <div
      className={`fams-settings-row ${last ? "" : ""} ${disabled ? "is-disabled" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="fams-settings-row-title">{title}</p>
          {tag && (
            <span className="fams-settings-tag" data-color={tag.color}>
              {tag.label}
            </span>
          )}
        </div>
        <p className="fams-settings-row-desc">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle checked={checked} onChange={onChange} disabled={disabled} />
      </div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="fams-settings-divider">
      <p className="fams-settings-divider-label">{label}</p>
    </div>
  );
}

function InfoBox({
  children,
  type = "info",
}: {
  children: React.ReactNode;
  type?: "info" | "warning" | "success";
}) {
  const icon = {
    info: (
      <Info size={16} className="fams-settings-info-icon" data-type="info" />
    ),
    warning: (
      <AlertTriangle
        size={16}
        className="fams-settings-info-icon"
        data-type="warning"
      />
    ),
    success: (
      <CheckCircle2
        size={16}
        className="fams-settings-info-icon"
        data-type="success"
      />
    ),
  }[type];

  return (
    <div className="fams-settings-info" data-type={type}>
      {icon}
      <p>{children}</p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "active" | "inactive" | "error" | "pending";
}) {
  return (
    <span className="fams-settings-status" data-status={status}>
      <span className="fams-settings-status-dot" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Section: Profile ──────────────────────────────────────────────────────────

function ProfileSection({
  currentUser,
  logout,
  updateAuthUser: _updateAuthUser,
}: {
  currentUser: any;
  logout: () => void;
  updateAuthUser: (data: any) => void;
}) {
  const [pwForm, setPwForm] = useState({ current: "", new: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaOtpauth, setMfaOtpauth] = useState<string | null>(null);
  const [mfaOtp, setMfaOtp] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const needsCurrentPassword = currentUser?.hasPassword !== false;
  const canManageMfa = ["admin", "hr", "supervisor"].includes(
    currentUser?.role || "",
  );
  const mfaEnabled = !!currentUser?.mfaEnabled;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.new !== pwForm.confirm)
      return toast.error("New passwords do not match");
    setPwLoading(true);
    try {
      await changePassword({
        ...(needsCurrentPassword ? { currentPassword: pwForm.current } : {}),
        newPassword: pwForm.new,
      });
      toast.success(
        needsCurrentPassword
          ? "Password updated successfully"
          : "Password set successfully — you can also sign in with username and password",
      );
      setPwForm({ current: "", new: "", confirm: "" });
      _updateAuthUser({ hasPassword: true, authProvider: "local" });
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setPwLoading(false);
    }
  };

  const handleMfaSetup = async () => {
    setMfaLoading(true);
    try {
      const res = await setupMfa();
      setMfaSecret(res.secret);
      setMfaOtpauth(res.otpauthUrl);
      setMfaOtp("");
      toast.success("Scan the secret in your authenticator app, then confirm with a code");
    } catch (err: any) {
      toast.error(err.message || "Failed to start MFA setup");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaLoading(true);
    try {
      await enableMfa(mfaOtp);
      _updateAuthUser({ mfaEnabled: true, mfaEnrollmentSuggested: false });
      setMfaSecret(null);
      setMfaOtpauth(null);
      setMfaOtp("");
      toast.success("Two-factor authentication enabled");
    } catch (err: any) {
      toast.error(err.message || "Invalid authenticator code");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaDisable = async () => {
    if (!confirm("Disable two-factor authentication for your account?")) return;
    setMfaLoading(true);
    try {
      await disableMfa();
      _updateAuthUser({ mfaEnabled: false });
      setMfaSecret(null);
      setMfaOtpauth(null);
      toast.success("Two-factor authentication disabled");
    } catch (err: any) {
      toast.error(err.message || "Failed to disable MFA");
    } finally {
      setMfaLoading(false);
    }
  };

  return (
    <div className="fams-settings-stack">
      <div className="fams-settings-grid fams-settings-grid-2">
      <Card>
        <CardHeader
          title="Account Profile"
          description="Your core operational identity details."
        />
        <div className="fams-settings-card-body flex flex-col items-center gap-6">
          <div className="fams-settings-profile-avatar">
            {currentUser?.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <UserCircle size={56} className="text-[var(--gray-300)]" />
            )}
          </div>

          <div className="text-center">
            <h2 className="text-lg font-extrabold text-[var(--text)]">
              {currentUser?.name}
            </h2>
            <span className="inline-flex items-center px-2.5 py-0.5 mt-1 text-[10px] font-bold fams-settings-role-badge rounded-full tracking-wide uppercase">
              {currentUser?.role}
            </span>
          </div>

          <div className="w-full space-y-4">
            <div className="fams-settings-stat-box w-full">
              <p className="fams-settings-stat-label">Username</p>
              <p className="fams-settings-stat-value">
                @{currentUser?.username}
              </p>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-[var(--danger)] border border-[var(--border)] rounded-[var(--radius)] hover:bg-[color-mix(in_srgb,var(--danger)_6%,var(--surface))] transition-colors duration-150 cursor-pointer"
          >
            <LogOut size={16} /> Logout Current Session
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Security Credentials"
          description={
            needsCurrentPassword
              ? "Safely update your administrator credentials."
              : "This Google account has no local password yet. Set one to also sign in with username and password."
          }
        />
        <form
          onSubmit={handlePasswordChange}
          className="fams-settings-card-body space-y-5"
        >
          {(
            [
              needsCurrentPassword
                ? {
                    label: "Current System Password",
                    key: "current" as const,
                    icon: <Key size={16} className="text-[var(--muted)]" />,
                    required: true,
                  }
                : null,
              {
                label: needsCurrentPassword
                  ? "New Secret Password"
                  : "New Password",
                key: "new" as const,
                icon: <Lock size={16} className="text-[var(--muted)]" />,
                required: true,
              },
              {
                label: needsCurrentPassword
                  ? "Confirm New Secret Password"
                  : "Confirm New Password",
                key: "confirm" as const,
                icon: <Lock size={16} className="text-[var(--muted)]" />,
                required: true,
              },
            ] as Array<{
              label: string;
              key: "current" | "new" | "confirm";
              icon: ReactNode;
              required: boolean;
            } | null>
          )
            .filter(Boolean)
            .map((field) => {
              const { label, key, icon, required } = field!;
              const isVisible = !!showFields[key];
              return (
                <div key={key} className="space-y-1.5">
                  <label className="fams-settings-label">{label}</label>
                  <div className="relative flex items-center">
                    <div className="absolute left-3.5 shrink-0 pointer-events-none">
                      {icon}
                    </div>
                    <input
                      type={isVisible ? "text" : "password"}
                      required={required}
                      value={pwForm[key]}
                      onChange={(e) =>
                        setPwForm({ ...pwForm, [key]: e.target.value })
                      }
                      className="w-full pl-10 pr-11 py-2.5 text-sm text-[var(--text)] border border-[var(--border)] rounded-[var(--radius)] bg-white focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10 outline-none transition-all duration-200"
                      placeholder="••••••••••••"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowFields((prev) => ({
                          ...prev,
                          [key]: !prev[key],
                        }))
                      }
                      aria-label={isVisible ? "Hide password" : "Show password"}
                      className="absolute right-3.5 p-1 text-[var(--muted)] hover:text-[var(--neutral)] focus:outline-none transition-colors"
                    >
                      {isVisible ? (
                        <EyeOff size={16} aria-hidden="true" />
                      ) : (
                        <Eye size={16} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          <button
            type="submit"
            disabled={pwLoading}
            className="w-full py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[var(--radius)] font-bold text-sm transition-all duration-200 cursor-pointer disabled:opacity-50"
          >
            {pwLoading
              ? "Processing Credentials..."
              : needsCurrentPassword
                ? "Save New Credentials"
                : "Set Local Password"}
          </button>
        </form>
      </Card>
      </div>

      {canManageMfa && (
        <Card>
          <CardHeader
            title="Two-Factor Authentication (2FA)"
            description="Protect your account with an authenticator app (TOTP)."
          />
          <div className="fams-settings-card-body space-y-4">
            {currentUser?.mfaEnrollmentSuggested && !mfaEnabled && (
              <InfoBox type="warning">
                Organization MFA policy is enabled. Enroll an authenticator app
                below so login requires a second factor.
              </InfoBox>
            )}
            <p className="text-sm text-[var(--muted)]">
              Status:{" "}
              <span className="font-bold text-[var(--text)]">
                {mfaEnabled ? "Enabled" : "Not enabled"}
              </span>
            </p>
            {!mfaEnabled && !mfaSecret && (
              <button
                type="button"
                disabled={mfaLoading}
                onClick={handleMfaSetup}
                className="px-4 py-2.5 text-xs font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-[var(--radius)] cursor-pointer disabled:opacity-50"
              >
                {mfaLoading ? "Starting…" : "Set up authenticator"}
              </button>
            )}
            {mfaSecret && (
              <form onSubmit={handleMfaEnable} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="fams-settings-label">Secret key</label>
                  <p className="font-mono text-sm break-all bg-[var(--gray-50)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2">
                    {mfaSecret}
                  </p>
                  {mfaOtpauth && (
                    <p className="fams-settings-hint break-all">
                      Or add via URI: {mfaOtpauth}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="fams-settings-label">
                    Confirm with 6-digit code
                  </label>
                  <TextInput
                    value={mfaOtp}
                    onChange={(v) =>
                      setMfaOtp(v.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="000000"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={mfaLoading || mfaOtp.length !== 6}
                    className="px-4 py-2.5 text-xs font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-[var(--radius)] cursor-pointer disabled:opacity-50"
                  >
                    Enable 2FA
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMfaSecret(null);
                      setMfaOtpauth(null);
                      setMfaOtp("");
                    }}
                    className="px-4 py-2.5 text-xs font-bold text-[var(--muted)] border border-[var(--border)] rounded-[var(--radius)] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {mfaEnabled && (
              <button
                type="button"
                disabled={mfaLoading}
                onClick={handleMfaDisable}
                className="px-4 py-2.5 text-xs font-bold text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_25%,var(--border))] rounded-[var(--radius)] cursor-pointer disabled:opacity-50"
              >
                Disable 2FA
              </button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Section: Operational Rules ─────────────────────────────────────────────────

function OperationalSection({
  settings,
  onSettingChange,
}: {
  settings: SystemSettings;
  onSettingChange: (key: keyof SystemSettings, val: string) => void;
}) {
  const deductBreaks = settings.deductBreaks === "true";

  return (
    <div className="fams-settings-stack">
      <Card>
        <CardHeader
          title="Work Hour Rules"
          description="Standard parameters governing wage logic and shifts."
        />
        <div className="fams-settings-card-body fams-settings-grid fams-settings-grid-2">
          {[
            {
              label: "Standard Daily Work Hours",
              value: settings.standardWorkHours,
              set: (v: string) => onSettingChange("standardWorkHours", v),
              suffix: "hrs / day",
            },
            {
              label: "Daily Overtime Threshold",
              value: settings.overtimeThreshold,
              set: (v: string) => onSettingChange("overtimeThreshold", v),
              suffix: "hrs / day",
            },
            {
              label: "Break Overtime Alert Threshold",
              value: settings.breakOvertimeAlert,
              set: (v: string) => onSettingChange("breakOvertimeAlert", v),
              suffix: "mins",
            },
          ].map(({ label, value, set, suffix }) => (
            <div key={label} className="space-y-1.5">
              <label className="fams-settings-label">{label}</label>
              <NumberInput value={value} onChange={set} suffix={suffix} />
            </div>
          ))}
        </div>

        <SectionDivider label="Break Calculation Guidelines" />
        <div className="fams-settings-card-body fams-settings-grid fams-settings-grid-2">
          {[
            {
              label: "Standard Tea Break Duration",
              value: settings.teaBreakDuration,
              set: (v: string) => onSettingChange("teaBreakDuration", v),
              suffix: "mins",
            },
            {
              label: "Standard Lunch Break Duration",
              value: settings.lunchBreakDuration,
              set: (v: string) => onSettingChange("lunchBreakDuration", v),
              suffix: "mins",
            },
          ].map(({ label, value, set, suffix }) => (
            <div key={label} className="space-y-1.5">
              <label className="fams-settings-label">{label}</label>
              <NumberInput value={value} onChange={set} suffix={suffix} />
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--border)]">
          <ToggleRow
            title="Deduct Break Durations Automatically"
            description="Automatically deduct configured break lengths from daily payroll totals."
            checked={deductBreaks}
            onChange={(v) => {
              const val = v ? "true" : "false";
              onSettingChange("deductBreaks", val);
              onSettingChange("payroll_deduct_breaks", val);
            }}
          />
          <ToggleRow
            title="Midnight Rollover Logic"
            description="When enabled, each calendar day (IST) starts fresh at midnight. When off, work days roll at 6:00 AM IST for night shifts."
            checked={settings.midnightAlgo !== 'false'}
            onChange={(v) =>
              onSettingChange("midnightAlgo", v ? "true" : "false")
            }
            last
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Premium Wage Rates"
          description="Configure weekend/holiday multipliers for daily wage. Overtime pay always uses each worker’s overtime rate (₹/hr) from their profile."
        />
        <div className="fams-settings-card-body fams-settings-grid fams-settings-grid-2">
          {[
            {
              label: "Weekend Overtime Multiplier",
              value: settings.weekendMultiplier || "1.5",
              set: (v: string) => onSettingChange("weekendMultiplier", v),
              suffix: "×",
              type: "number",
            },
            {
              label: "Public Holiday Multiplier",
              value: settings.holidayMultiplier || "2.0",
              set: (v: string) => onSettingChange("holidayMultiplier", v),
              suffix: "×",
              type: "number",
            },
          ].map(({ label, value, set, suffix, type }) => (
            <div key={label} className="space-y-1.5">
              <label className="fams-settings-label">{label}</label>
              <div className="flex items-center border border-[var(--border)] rounded-[var(--radius)] overflow-hidden bg-white focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/10 transition-all duration-200">
                <input
                  type={type}
                  step={type === "number" ? "0.05" : undefined}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm text-[var(--text)] bg-transparent border-none outline-none font-medium"
                />
                {suffix && (
                  <span className="px-3.5 py-2 text-xs font-semibold text-[var(--muted)] bg-[var(--gray-50)] border-l border-[var(--border)] select-none">
                    {suffix}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--border)]">
          <ToggleRow
            title="Apply Special Weekend Multipliers"
            description="Apply configured overtime multipliers to shifts worked on Saturdays & Sundays."
            checked={settings.weekendOT !== "false"}
            onChange={(v) => onSettingChange("weekendOT", v ? "true" : "false")}
          />
          <ToggleRow
            title="Activate Public Holiday Rates"
            description="Apply holiday pay multipliers on dates listed in the holiday calendar setting (JSON array of YYYY-MM-DD)."
            checked={settings.holidayPay !== "false"}
            onChange={(v) => onSettingChange("holidayPay", v ? "true" : "false")}
            last
          />
        </div>
      </Card>
    </div>
  );
}

// ── Section: Shift Configuration ──────────────────────────────────────────────

type ShiftForm = {
  name: string;
  startTime: string;
  endTime: string;
  capacity: string;
};
const emptyShiftForm = (): ShiftForm => ({
  name: "",
  startTime: "06:00",
  endTime: "14:00",
  capacity: "80",
});

function ShiftsSection({
  settings,
  onSettingChange,
}: {
  settings: SystemSettings;
  onSettingChange: (key: keyof SystemSettings, val: string) => void;
}) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftModal, setShiftModal] = useState<{
    open: boolean;
    editing: Shift | null;
  }>({ open: false, editing: null });
  const [shiftForm, setShiftForm] = useState<ShiftForm>(emptyShiftForm());

  useEffect(() => {
    getShifts()
      .then(setShifts)
      .catch(() => {});
  }, []);

  const openAdd = () => {
    setShiftForm(emptyShiftForm());
    setShiftModal({ open: true, editing: null });
  };
  const openEdit = (s: Shift) => {
    setShiftForm({
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      capacity: String(s.capacity),
    });
    setShiftModal({ open: true, editing: s });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = { ...shiftForm, capacity: Number(shiftForm.capacity) };
      if (shiftModal.editing) {
        await updateShift(shiftModal.editing.id, data);
        toast.success("Shift updated successfully");
      } else {
        await createShift(data);
        toast.success("Shift registered successfully");
      }
      setShiftModal({ open: false, editing: null });
      getShifts()
        .then(setShifts)
        .catch(() => {});
    } catch {
      toast.error("Failed to register shift credentials");
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Are you absolutely sure? This will unassign workers from this active shift.",
      )
    )
      return;
    try {
      await deleteShift(id);
      toast.success("Shift archived successfully");
      getShifts()
        .then(setShifts)
        .catch(() => {});
    } catch {
      toast.error("Failed to unregister shift metadata");
    }
  };

  return (
    <div className="fams-settings-stack">
      <Card>
        <CardHeader
          title="Shift Catalog"
          description="Operational shift intervals and staff capacity quotas."
          action={
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[var(--accent)] bg-[#EFF6FF] border border-[color-mix(in_srgb,var(--accent)_15%,var(--border))] hover:bg-[#DBEAFE] rounded-[var(--radius)] transition-all duration-150 cursor-pointer"
            >
              <Plus size={14} /> Register New Shift
            </button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--gray-50)]">
                {[
                  "Shift Handle",
                  "Start Time",
                  "End Time",
                  "Staff Quota",
                  "Kiosk Status",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-6 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {shifts.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-[var(--gray-50)] transition-colors"
                >
                  <td className="px-6 py-4 font-bold text-[var(--text)]">
                    {s.name}
                  </td>
                  <td className="px-6 py-4 text-[var(--muted)] font-mono text-xs">
                    {s.startTime}
                  </td>
                  <td className="px-6 py-4 text-[var(--muted)] font-mono text-xs">
                    {s.endTime}
                  </td>
                  <td className="px-6 py-4 text-[var(--muted)] font-semibold">
                    {s.capacity} workers
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status="active" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-4">
                      <button
                        onClick={() => openEdit(s)}
                        className="text-xs font-bold text-[var(--neutral)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer transition-colors"
                      >
                        Configure
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-xs font-bold text-[var(--danger)] hover:opacity-80 bg-transparent border-none cursor-pointer transition-colors"
                      >
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {shifts.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-[var(--muted)] font-medium"
                  >
                    No active shifts registered in the database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Capacity alerts"
          description="Warn when shift fill approaches the configured limit."
        />
        <div className="fams-settings-card-body">
          <div className="space-y-1.5 max-w-xs">
            <label className="fams-settings-label">
              Fill Warning Threshold
            </label>
            <NumberInput
              value={settings.shiftCapacityAlertPct || "80"}
              onChange={(v) => onSettingChange("shiftCapacityAlertPct", v)}
              suffix="%"
            />
            <p className="fams-settings-hint">
              Quota limit alert for supervisor notifications.
            </p>
          </div>
        </div>
        <div className="border-t border-[var(--border)]">
          <ToggleRow
            title="Exceeded Quota Push Notifications"
            description="Trigger alerts when shift capacities exceed configured limits."
            checked={settings.shiftCapacityAlerts === "true"}
            onChange={(v) =>
              onSettingChange("shiftCapacityAlerts", v ? "true" : "false")
            }
            last
          />
        </div>
      </Card>

      {/* Roster Modal Container */}
      {shiftModal.open && (
        <div className="fams-settings-modal-overlay">
          <div className="fams-settings-modal">
            <div className="fams-settings-modal-header">
              <h2 className="text-base font-extrabold text-[var(--text)]">
                {shiftModal.editing
                  ? "Configure Shift Parameters"
                  : "Register Brand New Shift"}
              </h2>
              <button
                onClick={() => setShiftModal({ open: false, editing: null })}
                className="p-1 rounded-full text-[var(--muted)] hover:bg-[var(--gray-100)] hover:text-[var(--text)] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="fams-settings-card-body space-y-4"
            >
              <div className="space-y-1.5">
                <label className="fams-settings-label">
                  Shift Identifier Name
                </label>
                <input
                  type="text"
                  required
                  value={shiftForm.name}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 text-sm text-[var(--text)] border border-[var(--border)] rounded-[var(--radius)] bg-white focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10 outline-none transition-all duration-200"
                  placeholder="e.g. Day Shift Alpha"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Start Time", key: "startTime" as const },
                  { label: "End Time", key: "endTime" as const },
                ].map(({ label, key }) => (
                  <div key={key} className="space-y-1.5">
                    <label className="fams-settings-label">{label}</label>
                    <input
                      type="time"
                      required
                      value={shiftForm[key]}
                      onChange={(e) =>
                        setShiftForm({ ...shiftForm, [key]: e.target.value })
                      }
                      className="w-full px-3.5 py-2 text-sm text-[var(--text)] border border-[var(--border)] rounded-[var(--radius)] bg-white focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10 outline-none transition-all duration-200"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <label className="fams-settings-label">
                  Max Staff Quota Limit
                </label>
                <input
                  type="number"
                  required
                  value={shiftForm.capacity}
                  onChange={(e) =>
                    setShiftForm({ ...shiftForm, capacity: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 text-sm text-[var(--text)] border border-[var(--border)] rounded-[var(--radius)] bg-white focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10 outline-none transition-all duration-200"
                  placeholder="e.g. 100"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShiftModal({ open: false, editing: null })}
                  className="flex-1 py-2.5 text-[var(--neutral)] border border-[var(--border)] hover:bg-[var(--gray-50)] font-bold text-sm rounded-[var(--radius)] cursor-pointer transition-colors animate-fade-in"
                >
                  Discard Changes
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold text-sm rounded-[var(--radius)] cursor-pointer transition-all duration-150"
                >
                  Save Shift Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section: Role Permissions ──────────────────────────────────────────────────

function PermissionsSection({
  settings,
  onSettingChange,
}: {
  settings: SystemSettings;
  onSettingChange: (key: keyof SystemSettings, val: string) => void;
}) {
  const rows: {
    key: string;
    title: string;
    description: string;
    tag?: { label: string; color: "green" | "amber" | "red" | "blue" };
    settingKey: keyof SystemSettings;
  }[] = [
    {
      key: "viewSalary",
      settingKey: "perm_supervisor_salary_view",
      title: "View Financial Wage Details",
      description:
        "Allow supervisors to access salary calculations and hourly rates.",
      tag: { label: "Sensitive", color: "amber" },
    },
    {
      key: "viewDirectory",
      settingKey: "perm_supervisor_worker_view",
      title: "Browse Employee Directories",
      description:
        "Allow supervisors to browse and search active employee cards.",
    },
    {
      key: "enrollWorkers",
      settingKey: "perm_supervisor_enroll_workers",
      title: "Initiate Biometric Enrollment",
      description: "Allow supervisors to register employee skeleton records.",
    },
    {
      key: "deleteWorkers",
      settingKey: "perm_supervisor_worker_delete",
      title: "Soft-Delete Staff Profiles",
      description:
        "Deactivate worker accounts and erase biometric storage signatures.",
      tag: { label: "Destructive", color: "red" },
    },
    {
      key: "approveCorrections",
      settingKey: "perm_supervisor_correction_approve",
      title: "Authorize Clock Corrections",
      description:
        "Approve or deny manual adjustment requests for missed punches.",
    },
    {
      key: "manageShifts",
      settingKey: "perm_supervisor_manage_shifts",
      title: "Modify Shift Schedules",
      description: "Grant access to modify shifts and roster capacities.",
    },
    {
      key: "exportPayroll",
      settingKey: "perm_supervisor_export_payroll",
      title: "Generate Payroll Exports",
      description: "Allow supervisors to generate and download period CSV wage sheets.",
      tag: { label: "Sensitive", color: "amber" },
    },
    {
      key: "viewAnalytics",
      settingKey: "perm_supervisor_view_analytics",
      title: "Inspect Analytics Portals",
      description: "Access overview dashboard statistics, trends, and charts.",
    },
    {
      key: "sendNotifications",
      settingKey: "perm_supervisor_send_notifications",
      title: "Broadcast Alerts",
      description:
        "Deliver broad updates and announcements to supervisor nodes.",
    },
    {
      key: "manageHolidays",
      settingKey: "perm_supervisor_manage_holidays",
      title: "Modify Public Holidays",
      description:
        "Enable modification of custom holidays and wage multipliers.",
    },
    {
      key: "viewAuditLog",
      settingKey: "perm_supervisor_view_audit",
      title: "Inspect System Audit Logs",
      description: "Inspect immutable records tracking administrator actions.",
    },
    {
      key: "accessKioskConfig",
      settingKey: "perm_supervisor_kiosk_config",
      title: "Calibrate Edge Sensors",
      description:
        "Access restricted neural confidence limits and camera options.",
      tag: { label: "Admin Only", color: "red" },
    },
  ];

  const getChecked = (row: (typeof rows)[0]) =>
    settings[row.settingKey] === "true";
  const handleChange = (row: (typeof rows)[0], val: boolean) =>
    onSettingChange(row.settingKey, val ? "true" : "false");
  const enabledCount = rows.filter((r) => getChecked(r)).length;

  return (
    <Card>
      <CardHeader
        title="Supervisor Access Rules"
        description="Configure access rights and rules delegated to floor supervisors."
        action={
          <span className="text-xs font-semibold text-[var(--muted)] bg-[var(--gray-100)] border border-[var(--border)] px-3 py-1 rounded-full">
            {enabledCount} / {rows.length} Rules Active
          </span>
        }
      />
      <div className="divide-y divide-[var(--border)]">
        {rows.map((row, i) => (
          <ToggleRow
            key={row.key}
            title={row.title}
            description={row.description}
            checked={getChecked(row)}
            onChange={(v) => handleChange(row, v)}
            tag={row.tag}
            last={i === rows.length - 1}
          />
        ))}
      </div>
    </Card>
  );
}

// ── Section: AI & Kiosk ────────────────────────────────────────────────────────

function AIKioskSection({
  settings,
  onSettingChange,
}: {
  settings: SystemSettings;
  onSettingChange: (key: keyof SystemSettings, val: string) => void;
}) {
  const confidence = parseFloat(settings.ai_threshold || "0.55");

  return (
    <div className="fams-settings-stack">
      <Card>
        <CardHeader
          title="AI Face Matching Model"
          description="Configure neural network parameters for edge cameras."
        />
        <div className="p-6 space-y-6">
          <div className="p-4 bg-[var(--gray-50)] border border-[var(--border)] rounded-[8px] space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[var(--neutral)] uppercase tracking-wide">
                Confidence Threshold Limit
              </label>
              <input
                type="number"
                min={0.3}
                max={0.99}
                step={0.01}
                value={confidence.toFixed(2)}
                onChange={(e) =>
                  onSettingChange("ai_threshold", e.target.value)
                }
                className="w-16 px-2 py-1 text-sm text-center border border-[var(--border)] bg-white font-mono font-bold rounded-lg outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10 transition-all"
              />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono font-bold text-[var(--muted)] select-none">
                0.30
              </span>
              <input
                type="range"
                min={0.3}
                max={0.99}
                step={0.01}
                value={confidence}
                onChange={(e) =>
                  onSettingChange("ai_threshold", e.target.value)
                }
                className="flex-1 h-1.5 rounded-lg bg-[var(--gray-200)] cursor-pointer accent-[var(--accent)] focus:outline-none"
              />
              <span className="text-xs font-mono font-bold text-[var(--muted)] select-none">
                1.00
              </span>
            </div>
            <div className="flex justify-between fams-settings-hint font-medium">
              <span>Lenient (Low light, fast match)</span>
              <span>Strict (Secure authentication)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="fams-settings-label">
                Detection Pipeline Model
              </label>
              <SelectInput
                value={settings.ai_model || "ssd_mobilenet"}
                onChange={(v) => onSettingChange("ai_model", v)}
                options={[
                  {
                    value: "ssd_mobilenet",
                    label: "SSD MobileNet V1 (highly accurate)",
                  },
                  {
                    value: "tiny_face",
                    label: "Tiny Face Neural Net (low hardware load)",
                  },
                ]}
              />
              <p className="fams-settings-hint">
                Used by the web kiosk face detector on /kiosk.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="fams-settings-label">
                Scanning Cycle Interval
              </label>
              <NumberInput
                value={settings.ai_scan_interval || "800"}
                onChange={(v) => onSettingChange("ai_scan_interval", v)}
                suffix="ms"
              />
            </div>
            <div className="space-y-1.5">
              <label className="fams-settings-label">
                Attendance Post Retries
              </label>
              <NumberInput
                value={settings.ai_auto_retry || "3"}
                onChange={(v) => onSettingChange("ai_auto_retry", v)}
                suffix="retries"
              />
              <p className="fams-settings-hint">
                Retries a failed punch before queuing (if offline mode) or showing an error.
              </p>
            </div>
          </div>

          <InfoBox type="success">
            Face matching uses encrypted 128-float biometric templates (multiple samples per worker).
            Optional avatar thumbnails may be stored for the worker directory only — not used for matching.
          </InfoBox>
        </div>
        <div className="border-t border-[var(--border)]">
          <ToggleRow
            title="Multi-Face Presence Alarms"
            description="Ignore punches when more than one face is in frame and show a one-person warning."
            checked={settings.ai_multiface_alert !== "false"}
            onChange={(v) =>
              onSettingChange("ai_multiface_alert", v ? "true" : "false")
            }
            last
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Kiosk Terminal Details"
          description="Configure screen and camera parameters for kiosk terminals."
        />
        <div className="fams-settings-card-body fams-settings-grid fams-settings-grid-2">
          <div className="space-y-1.5">
            <label className="fams-settings-label">
              Camera Resolution Preset
            </label>
            <SelectInput
              value={settings.kiosk_camera_res || "720p"}
              onChange={(v) => onSettingChange("kiosk_camera_res", v)}
              options={[
                { value: "480p", label: "480p SD (Low CPU overhead)" },
                { value: "720p", label: "720p HD (Balanced performance)" },
                { value: "1080p", label: "1080p FHD (High CPU load)" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <label className="fams-settings-label">
              Kiosk Monitor Idle Timeout
            </label>
            <NumberInput
              value={settings.kiosk_idle_timeout || "30"}
              onChange={(v) => onSettingChange("kiosk_idle_timeout", v)}
              suffix="secs"
            />
            <p className="fams-settings-hint">
              Stops the camera after this many seconds without a face; tap to resume.
            </p>
          </div>
        </div>
        <div className="border-t border-[var(--border)]">
          <ToggleRow
            title="Cached Offline Scan Capability"
            description="Queue punches on this tablet when the network drops, then sync with bulk-sync when back online."
            checked={settings.kiosk_offline_mode === "true"}
            onChange={(v) =>
              onSettingChange("kiosk_offline_mode", v ? "true" : "false")
            }
            last
          />
        </div>

        {/* Kiosk URL launcher */}
        <div className="px-6 py-5 border-t border-[var(--border)] bg-[var(--gray-50)] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[var(--text)] leading-snug">
              Public Kiosk Portal URL
            </p>
            <p className="text-xs text-[var(--muted)] mt-1">
              Deploy this secure clocking node on standard tablet devices.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  window.location.origin + "/kiosk",
                );
                toast.success("Kiosk endpoint url successfully copied");
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-[var(--neutral)] border border-[var(--border)] hover:bg-[var(--gray-100)] bg-white rounded-[var(--radius)] transition-all duration-150 cursor-pointer"
            >
              <Copy size={13} /> Copy URL Link
            </button>
            <a
              href="/kiosk"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-[var(--radius)] transition-all duration-150 text-decoration-none"
            >
              <ExternalLink size={13} /> Launch Kiosk Roster
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Section: Biometric & Enrollment ─────────────────────────────────────────

function BiometricSection({
  settings,
  onSettingChange,
}: {
  settings: SystemSettings;
  onSettingChange: (key: keyof SystemSettings, val: string) => void;
}) {
  const [showPurge, setShowPurge] = useState(false);

  const handlePurge = async () => {
    try {
      const res = await purgeDescriptors();
      toast.success(res.message || "Face descriptors successfully purged");
      setShowPurge(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to purge face descriptors");
    }
  };

  return (
    <div className="fams-settings-stack">
      <Card>
        <CardHeader
          title="Enrollment Requirements"
          description="Establish capture quality bounds and enrollment policies."
        />
        <div className="fams-settings-card-body fams-settings-grid fams-settings-grid-2">
          <div className="space-y-1.5">
            <label className="fams-settings-label">Biometric Reference Samples</label>
            <NumberInput
              value={settings.bio_enrollment_samples || "5"}
              onChange={(v) => onSettingChange("bio_enrollment_samples", v)}
              suffix="scans"
            />
            <p className="fams-settings-hint">
              Number of quality-checked captures required when registering a face (3–8). Supervisor enroll is controlled under Role Permissions.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Data Lifecycle Constraints"
          description="Set retention guidelines and data scrubbing rules."
        />
        <div className="fams-settings-card-body space-y-4">
          <InfoBox type="success">
            Face matching uses encrypted 128-float biometric templates. Optional
            avatar thumbnails may be stored for the worker directory only.
          </InfoBox>
          <div className="space-y-1.5 pt-2">
            <label className="fams-settings-label">
              Inactive Profile Retention
            </label>
            <NumberInput
              value={settings.bio_retention_days || "365"}
              onChange={(v) => onSettingChange("bio_retention_days", v)}
              suffix="days"
            />
            <p className="fams-settings-hint">
              Scrub biometrics of offboarded employees past this window limit.
            </p>
          </div>
        </div>
        <div className="border-t border-[var(--border)]">
          <ToggleRow
            title="Automated Lifecycle Erasure"
            description="Automatically purge face maps when workers remain inactive beyond retention limits."
            checked={settings.bio_auto_delete === "true"}
            onChange={(v) =>
              onSettingChange("bio_auto_delete", v ? "true" : "false")
            }
          />
          <ToggleRow
            title="Log Biometric Access Events"
            description="Create immutable compliance records on read/write biometric events."
            checked={settings.bio_audit_access === "true"}
            onChange={(v) =>
              onSettingChange("bio_audit_access", v ? "true" : "false")
            }
            last
          />
        </div>
      </Card>

      <Card className="border-[color-mix(in_srgb,var(--danger)_25%,var(--border))]">
        <CardHeader
          title="Scrub Registered Biometrics"
          description="Irreversibly delete biometric models from database tables."
          titleStyle={{ color: "#e11d48" }}
        />
        <div className="p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-sm font-bold text-[var(--danger)]">
              Delete All Registered Face Descriptors
            </p>
            <p className="text-xs text-[var(--muted)] mt-1">
              Permanently erase every mathematical signature. Staff must
              re-register physically.
            </p>
          </div>
          {!showPurge ? (
            <button
              onClick={() => setShowPurge(true)}
              className="px-4 py-2.5 text-xs font-bold text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_25%,var(--border))] hover:bg-[color-mix(in_srgb,var(--danger)_6%,var(--surface))] bg-white rounded-[var(--radius)] transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              Purge Biometric Data
            </button>
          ) : (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setShowPurge(false)}
                className="px-4 py-2.5 text-xs font-bold text-[var(--neutral)] border border-[var(--border)] hover:bg-[var(--gray-50)] bg-white rounded-[var(--radius)] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handlePurge}
                className="px-4 py-2.5 text-xs font-bold text-white bg-[var(--danger)] hover:opacity-90 rounded-[var(--radius)] transition-all cursor-pointer"
              >
                Confirm Deletion
              </button>
            </div>
          )}
        </div>
        {showPurge && (
          <div className="px-6 pb-6">
            <InfoBox type="warning">
              This action cannot be undone. All face sensors will reject
              clocking attempts until workers undergo physical re-enrollment
              procedures.
            </InfoBox>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Section: Security & Auth ───────────────────────────────────────────────────

function SecuritySection({
  settings,
  onSettingChange,
}: {
  settings: SystemSettings;
  onSettingChange: (key: keyof SystemSettings, val: string) => void;
}) {
  const [users, setUsers] = useState<any[]>([]);
  const [loginSessions, setLoginSessions] = useState<any[]>([]);

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch(() => {});
    getAuditLogs()
      .then((logs) =>
        setLoginSessions(
          logs
            .filter((l) => l.action.toLowerCase().includes("login"))
            .slice(0, 8),
        ),
      )
      .catch(() => {});
  }, []);

  const handleRegenerateKioskToken = async () => {
    if (!confirm("Regenerate kiosk token? All kiosk devices must reload settings."))
      return;
    try {
      const res = await regenerateKioskToken();
      onSettingChange("sec_kiosk_token", res.token);
      localStorage.setItem("fams_kiosk_token", res.token);
      toast.success("Kiosk token regenerated — other tablets must unlock again");
    } catch (err: any) {
      toast.error(err.message || "Failed to regenerate token");
    }
  };

  return (
    <div className="fams-settings-stack">
      <Card>
        <CardHeader
          title="Roster Key Lifecycle"
          description="Configure JSON Web Token guidelines and lockout periods."
        />
        <div className="fams-settings-card-body fams-settings-grid fams-settings-grid-2">
          {[
            {
              label: "Token Active Validity",
              value: settings.sec_jwt_expiry || "480",
              set: (v: string) => onSettingChange("sec_jwt_expiry", v),
              suffix: "mins",
              hint: "Expiries validated for web access signatures.",
            },
            {
              label: "Max Login Violations Allowed",
              value: settings.sec_lockout_attempts || "5",
              set: (v: string) => onSettingChange("sec_lockout_attempts", v),
              suffix: "attempts",
              hint: "Consecutive failures before temporary lockouts.",
            },
            {
              label: "Lockout Interval Period",
              value: settings.sec_lockout_duration || "15",
              set: (v: string) => onSettingChange("sec_lockout_duration", v),
              suffix: "mins",
              hint: "Locked accounts remain closed for this duration.",
            },
            {
              label: "Minimum Key Character Length",
              value: settings.sec_password_min_len || "12",
              set: (v: string) => onSettingChange("sec_password_min_len", v),
              suffix: "chars",
              hint: "Enforced dynamically during setups or changes.",
            },
          ].map(({ label, value, set, suffix, hint }) => (
            <div key={label} className="space-y-1.5">
              <label className="fams-settings-label">{label}</label>
              <NumberInput value={value} onChange={set} suffix={suffix} />
              <p className="fams-settings-hint">{hint}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--border)]">
          <ToggleRow
            title="Two-Factor (2FA / MFA) Policy"
            description="When on, staff with authenticator 2FA enrolled must enter a TOTP code at login. Enable 2FA per user under My Profile. Admins/supervisors without 2FA will be prompted to enroll."
            checked={settings.sec_mfa_enabled === "true"}
            onChange={(v) =>
              onSettingChange("sec_mfa_enabled", v ? "true" : "false")
            }
            tag={{ label: "Recommended", color: "amber" }}
          />
          <ToggleRow
            title="Enforce Transit Encryption"
            description="Forcibly redirect standard HTTP requests to SSL/TLS paths."
            checked={settings.sec_force_https === "true"}
            onChange={(v) =>
              onSettingChange("sec_force_https", v ? "true" : "false")
            }
            last
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Network Security Rules"
          description="Manage network CIDR blocks allowed to query sensor endpoints."
        />
        <div className="border-t-0">
          <ToggleRow
            title="Restricted Network IP Whitelisting"
            description="Reject clocking endpoints if client nodes reside outside whitelists."
            checked={settings.sec_ip_whitelist === "true"}
            onChange={(v) =>
              onSettingChange("sec_ip_whitelist", v ? "true" : "false")
            }
            last={settings.sec_ip_whitelist !== "true"}
          />
          {settings.sec_ip_whitelist === "true" && (
            <div className="px-6 pb-6 space-y-1.5 animate-fade-in">
              <label className="fams-settings-label">
                Allowed CIDR Network blocks
              </label>
              <textarea
                value={settings.sec_ip_list || "192.168.1.0/24"}
                onChange={(e) => onSettingChange("sec_ip_list", e.target.value)}
                rows={3}
                className="w-full px-3.5 py-2.5 text-sm font-mono text-[var(--text)] border border-[var(--border)] rounded-[var(--radius)] bg-white outline-none resize-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10 transition-all duration-200"
                placeholder="e.g. 192.168.1.0/24"
              />
              <p className="fams-settings-hint">
                Configure whitelisted blocks (one entry per line).
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Kiosk Device Token"
          description="Shared secret for web kiosks. Regenerating invalidates every paired tablet until they unlock again."
        />
        <div className="fams-settings-card-body space-y-4">
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            To unlock a phone kiosk on the public internet, open{" "}
            <span className="font-medium text-[var(--text)]">/kiosk</span> on
            the device and sign in once with an authorized admin Google account. Factory
            LAN devices can still auto-pair. Regenerating the token forces all
            devices to unlock again.
          </p>
          <div className="space-y-1.5">
            <label className="fams-settings-label">Current Kiosk Token</label>
            <input
              readOnly
              value={settings.sec_kiosk_token || "••••••••"}
              className="w-full px-3.5 py-2.5 text-sm font-mono text-[var(--muted)] border border-[var(--border)] rounded-[var(--radius)] bg-[var(--gray-50)]"
            />
          </div>
          <button
            type="button"
            onClick={handleRegenerateKioskToken}
            className="px-4 py-2.5 text-xs font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_25%,var(--border))] hover:bg-[#EFF6FF] bg-white rounded-[var(--radius)] cursor-pointer"
          >
            Regenerate Kiosk Token
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Active Sessions"
          description="Recent login events from audit trail."
        />
        <div className="divide-y divide-[var(--border)]">
          {(loginSessions.length > 0 ? loginSessions : users.slice(0, 5).map((u) => ({
            actor: u.username,
            action: "Registered User",
            ipAddress: "—",
            createdAt: u.createdAt,
          }))).map((s: any, i: number) => (
            <div
              key={`${s.actor}-${i}`}
              className="flex items-center justify-between px-6 py-4 gap-4 hover:bg-[var(--gray-50)]/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[var(--gray-100)] flex items-center justify-center text-sm font-extrabold text-[var(--muted)] uppercase tracking-wide select-none">
                  {(s.actor || "?")[0]}
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text)] leading-none mb-1">
                    @{s.actor}
                  </p>
                  <p className="text-xs text-[var(--muted)] leading-none">
                    {s.action} · IP: {s.ipAddress || "—"} ·{" "}
                    {new Date(s.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {loginSessions.length === 0 && users.length === 0 && (
            <div className="px-6 py-8 text-center text-[var(--muted)] font-medium">
              No active administrative sessions detected.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Section: Notifications ─────────────────────────────────────────────────────

function NotificationsSection({
  settings,
  onSettingChange,
}: {
  settings: SystemSettings;
  onSettingChange: (key: keyof SystemSettings, val: string) => void;
}) {
  const channel = settings.notif_channel || "webhook";

  return (
    <div className="fams-settings-stack">
      <Card>
        <CardHeader
          title="Routing Channels"
          description="Configure delivery parameters for supervisor alerts."
        />
        <div className="fams-settings-card-body space-y-5">
          <div className="space-y-1.5">
            <label className="fams-settings-label">Primary Delivery Mode</label>
            <SelectInput
              value={channel === "push" || channel === "sms" ? "webhook" : channel}
              onChange={(v) => onSettingChange("notif_channel", v)}
              options={[
                { value: "email", label: "Email" },
                { value: "webhook", label: "Webhook (Slack / MS Teams)" },
                { value: "all", label: "Email + Webhook" },
                { value: "none", label: "Disabled" },
              ]}
            />
            <p className="fams-settings-hint">
              Email requires SMTP_* environment variables on the server. SMS is deferred.
            </p>
          </div>

          {(channel === "email" || channel === "all") && (
            <div className="space-y-1.5 animate-fade-in">
              <label className="fams-settings-label">
                System Email Recipients
              </label>
              <TextInput
                value={settings.notif_email || ""}
                onChange={(v) => onSettingChange("notif_email", v)}
                placeholder="ops@company.com"
              />
              <p className="fams-settings-hint">
                Comma-separated addresses. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in backend .env.
              </p>
            </div>
          )}

          {(channel === "webhook" || channel === "all") && (
            <div className="space-y-1.5 animate-fade-in">
              <label className="fams-settings-label">
                Webhook API Endpoint
              </label>
              <TextInput
                value={settings.notif_webhook_url || ""}
                onChange={(v) => onSettingChange("notif_webhook_url", v)}
                placeholder="https://hooks.slack.com/services/..."
              />
            </div>
          )}
        </div>
        <div className="border-t border-[var(--border)]">
          <ToggleRow
            title="Suppress Non-Essential Alerts (Quiet Hours)"
            description="Quiet alerts during off-shift hours."
            checked={settings.notif_quiet_hours === "true"}
            onChange={(v) =>
              onSettingChange("notif_quiet_hours", v ? "true" : "false")
            }
            last={settings.notif_quiet_hours !== "true"}
          />
          {settings.notif_quiet_hours === "true" && (
            <div className="px-6 pb-6 grid grid-cols-2 gap-4 animate-fade-in">
              {[
                {
                  label: "Quiet Period Starts",
                  value: settings.notif_quiet_start || "22:00",
                  key: "notif_quiet_start" as const,
                },
                {
                  label: "Quiet Period Ends",
                  value: settings.notif_quiet_end || "06:00",
                  key: "notif_quiet_end" as const,
                },
              ].map(({ label, value, key }) => (
                <div key={label} className="space-y-1.5">
                  <label className="fams-settings-label">{label}</label>
                  <input
                    type="time"
                    value={value}
                    onChange={(e) => onSettingChange(key, e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm text-[var(--text)] border border-[var(--border)] rounded-[var(--radius)] bg-white outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10 transition-all duration-200"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Alert Event Triggers"
          description="Toggle which administrative events trigger notifications."
        />
        <div className="divide-y divide-[var(--border)]">
          <ToggleRow
            title="Unapproved Overtime Events"
            description="Notify supervisors when worker rosters shift into unapproved overtime."
            checked={settings.notif_overtime_alert === "true"}
            onChange={(v) =>
              onSettingChange("notif_overtime_alert", v ? "true" : "false")
            }
          />
          <ToggleRow
            title="Missed Punch Warnings"
            description="Notify supervisors when shifts conclude without logged punch-out events."
            checked={settings.notif_missed_punch === "true"}
            onChange={(v) =>
              onSettingChange("notif_missed_punch", v ? "true" : "false")
            }
          />
          <ToggleRow
            title="Authentication Failure Alerts"
            description="Notify admins of repetitive failed login attempts."
            checked={settings.notif_login_failed === "true"}
            onChange={(v) =>
              onSettingChange("notif_login_failed", v ? "true" : "false")
            }
            tag={{ label: "Security", color: "red" }}
          />
          <ToggleRow
            title="Biometric Setup Completions"
            description="Notify supervisors when new worker face maps are registered at kiosks."
            checked={settings.notif_enrollment === "true"}
            onChange={(v) =>
              onSettingChange("notif_enrollment", v ? "true" : "false")
            }
          />
          <ToggleRow
            title="Export Schedule Readiness"
            description="Notify when periodic payroll logs have been compiled and exported."
            checked={settings.notif_payroll_ready === "true"}
            onChange={(v) =>
              onSettingChange("notif_payroll_ready", v ? "true" : "false")
            }
          />
          <ToggleRow
            title="Low Capacity Alarm"
            description="Notify supervisors if worker ratios fall below configured targets."
            checked={settings.notif_low_capacity === "true"}
            onChange={(v) =>
              onSettingChange("notif_low_capacity", v ? "true" : "false")
            }
            last={settings.notif_low_capacity !== "true"}
          />
          {settings.notif_low_capacity === "true" && (
            <div className="px-6 pb-6 space-y-1.5 animate-fade-in">
              <label className="fams-settings-label">
                Capacity Warning Limit
              </label>
              <NumberInput
                value={settings.notif_capacity_pct || "80"}
                onChange={(v) => onSettingChange("notif_capacity_pct", v)}
                suffix="%"
              />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Section: Payroll & Export ──────────────────────────────────────────────────

function PayrollSection({
  settings,
  onSettingChange,
}: {
  settings: SystemSettings;
  onSettingChange: (key: keyof SystemSettings, val: string) => void;
}) {
  const [exportHistory, setExportHistory] = useState<PayrollExportRecord[]>([]);
  const [exportMonth, setExportMonth] = useState(new Date().toISOString().slice(0, 7));

  const loadExports = () => {
    getPayrollExports()
      .then(setExportHistory)
      .catch(() => {});
  };

  useEffect(() => {
    loadExports();
  }, []);

  const handleExportNow = async () => {
    try {
      const created = await createPayrollExport({
        month: exportMonth,
        period: exportMonth,
        format: "csv",
        finalize: true,
      });
      toast.success(`Payroll CSV generated for ${created.period}`);
      loadExports();
      await downloadPayrollExport(created.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to export payroll");
    }
  };

  return (
    <div className="fams-settings-stack">
      <Card>
        <CardHeader
          title="Payroll Guidelines"
          description="Rounding, pay cycle, and currency. Flat tax is informational (not PF/ESI)."
        />
        <div className="fams-settings-card-body fams-settings-grid fams-settings-grid-2">
          <div className="space-y-1.5">
            <label className="fams-settings-label">Export Format</label>
            <SelectInput
              value="csv"
              onChange={() => onSettingChange("payroll_format", "csv")}
              options={[{ value: "csv", label: "CSV (period salary register)" }]}
            />
            <p className="fams-settings-hint">PDF and third-party formats are not available yet.</p>
          </div>
          <div className="space-y-1.5">
            <label className="fams-settings-label">Default Pay Cycle</label>
            <SelectInput
              value={settings.payroll_period || "monthly"}
              onChange={(v) => onSettingChange("payroll_period", v)}
              options={[
                { value: "weekly", label: "Weekly cycle" },
                { value: "biweekly", label: "Bi-weekly (14-day)" },
                { value: "semimonthly", label: "Semi-monthly (15/16-day)" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <label className="fams-settings-label">
              Time Clock Rounding Rule
            </label>
            <SelectInput
              value={settings.payroll_rounding || "nearest_15"}
              onChange={(v) => onSettingChange("payroll_rounding", v)}
              options={[
                { value: "exact", label: "Exact (no rounding)" },
                { value: "nearest_5", label: "Nearest 5 minutes" },
                { value: "nearest_15", label: "Nearest 15 minutes" },
                { value: "nearest_30", label: "Nearest 30 minutes" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <label className="fams-settings-label">
              Reporting Base Currency
            </label>
            <SelectInput
              value={settings.payroll_currency || "INR"}
              onChange={(v) => onSettingChange("payroll_currency", v)}
              options={[
                { value: "INR", label: "INR — Indian Rupee (₹)" },
                { value: "USD", label: "USD — United States Dollar ($)" },
                { value: "EUR", label: "EUR — Euro (€)" },
                { value: "GBP", label: "GBP — Pound (£)" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <label className="fams-settings-label">Flat Tax Rate (informational)</label>
            <NumberInput
              value={settings.payroll_tax_rate || "0"}
              onChange={(v) => onSettingChange("payroll_tax_rate", v)}
              suffix="%"
            />
          </div>
        </div>
        <div className="border-t border-[var(--border)]">
          <ToggleRow
            title="Include Overtime Pay"
            description="When off, overtime hours are not paid (still shown in breakdown). OT pay uses each worker’s overtime rate (₹/hr) from their profile."
            checked={settings.payroll_include_overtime !== "false"}
            onChange={(v) =>
              onSettingChange("payroll_include_overtime", v ? "true" : "false")
            }
            last
          />
        </div>
        <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--gray-50)]">
          <p className="text-xs text-[var(--muted)]">
            Break deductions use Operational Rules. Overtime pay = OT hours × worker overtime rate. Holiday multipliers apply to daily wage only and need dates in holiday_calendar.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Saved Exports"
          description="Period CSV exports. Finalized periods lock overrides until unfinalized from Salary."
        />
        <div className="px-6 py-4 border-b border-[var(--border)] flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <label className="fams-settings-label">Month to export</label>
            <input
              type="month"
              value={exportMonth}
              onChange={(e) => setExportMonth(e.target.value)}
              className="fams-input w-auto"
            />
          </div>
          <button
            onClick={handleExportNow}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-[var(--text)] hover:bg-[var(--gray-800)] rounded-[var(--radius)] transition-colors cursor-pointer"
          >
            <Download size={14} /> Export &amp; finalize CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--gray-50)]">
                {[
                  "Roster Period",
                  "Export Timestamp",
                  "Format",
                  "Total Workers",
                  "Status",
                  "File Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-6 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {exportHistory.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-[var(--gray-50)] transition-colors"
                >
                  <td className="px-6 py-4 font-bold text-[var(--text)]">
                    {r.period}
                  </td>
                  <td className="px-6 py-4 text-[var(--muted)] font-mono text-xs">
                    {new Date(r.generatedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-[var(--muted)] font-semibold">
                    {r.format}
                  </td>
                  <td className="px-6 py-4 text-[var(--muted)]">
                    {r.workerCount} workers
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => downloadPayrollExport(r.id).catch((e) => toast.error(e.message))}
                      className="text-xs font-bold text-[var(--accent)] hover:text-[var(--accent-hover)] bg-transparent border-none cursor-pointer transition-colors"
                    >
                      Download File
                    </button>
                  </td>
                </tr>
              ))}
              {exportHistory.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-[var(--muted)] font-medium"
                  >
                    No payroll exports generated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Section: Audit & Compliance ────────────────────────────────────────────────

function AuditSection({
  settings,
  onSettingChange,
}: {
  settings: SystemSettings;
  onSettingChange: (key: keyof SystemSettings, val: string) => void;
}) {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  useEffect(() => {
    getAuditLogs()
      .then((logs) => setAuditLogs(logs.slice(0, 5)))
      .catch(() => {});
  }, []);

  return (
    <div className="fams-settings-stack">
      <Card>
        <CardHeader
          title="Compliance"
          description="Audit export and recent events."
        />
        <div className="border-t-0">
          <ToggleRow
            title="Export Compliance Archives"
            description="Enable administrators to download audit logs."
            checked={settings.audit_export_enabled !== "false"}
            onChange={(v) =>
              onSettingChange("audit_export_enabled", v ? "true" : "false")
            }
            last
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Recent Compliance Events"
          description="Last 5 security and administrative logs."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--gray-50)]">
                {[
                  "Administrative Event",
                  "Trigger User",
                  "Details / Metadata",
                  "Timestamp",
                  "Criticality",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-6 py-3.5 text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {auditLogs.map((e, i) => {
                const isHigh =
                  e.action.includes("Purge") ||
                  e.action.includes("Reset") ||
                  e.action.includes("Failed") ||
                  e.action.includes("Delete") ||
                  e.action.includes("System");
                const isMedium =
                  e.action.includes("Update") ||
                  e.action.includes("Correction") ||
                  e.action.includes("Change");
                const severity = isHigh ? "high" : isMedium ? "medium" : "low";

                const severityStyle = {
                  high: "bg-rose-50 text-[var(--danger)] border-rose-100",
                  medium: "bg-amber-50 text-amber-700 border-amber-100",
                  low: "bg-[var(--gray-50)] text-[var(--neutral)] border-[var(--border)]",
                }[severity];

                return (
                  <tr
                    key={e.id || i}
                    className="hover:bg-[var(--gray-50)] transition-colors"
                  >
                    <td className="px-6 py-4 font-bold text-[var(--text)] whitespace-nowrap">
                      {e.action}
                    </td>
                    <td className="px-6 py-4 text-[var(--muted)] whitespace-nowrap">
                      @{e.actor}
                    </td>
                    <td className="px-6 py-4 text-[var(--muted)] max-w-[220px] truncate">
                      {e.target}
                    </td>
                    <td className="px-6 py-4 text-[var(--muted)] font-mono text-xs whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full tracking-wide uppercase border ${severityStyle}`}
                      >
                        {severity}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {auditLogs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-[var(--muted)] font-medium"
                  >
                    No compliance events logged in this session cycle.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 bg-[var(--gray-50)] border-t border-[var(--border)] flex items-center justify-between gap-4">
          <p className="text-xs font-semibold text-[var(--muted)]">
            Export compliance archive as signed JSON bundle.
          </p>
          <button
            type="button"
            onClick={() =>
              exportAuditArchive().catch((e) => toast.error(e.message))
            }
            className="px-4 py-2 text-xs font-bold text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_25%,var(--border))] hover:bg-[#EFF6FF] bg-white rounded-[var(--radius)] cursor-pointer"
          >
            Export Audit Archive
          </button>
        </div>
      </Card>
    </div>
  );
}

// ── Section: Integrations ─────────────────────────────────────────────────────

function IntegrationsSection() {
  return (
    <div className="fams-settings-stack">
      <Card>
        <CardHeader
          title="Integrations"
          description="Connect FAMS to HR, payroll, and messaging systems."
        />
        <div className="fams-settings-card-body">
          <InfoBox type="info">
            Third-party integrations (Workday, ADP, Slack, Teams, webhooks) are
            not configured in this deployment. Export payroll from Reports or
            contact your administrator to set up API connections.
          </InfoBox>
        </div>
      </Card>
    </div>
  );
}

// ── Section: System & Network ──────────────────────────────────────────────────

function SystemSection({
  settings,
  onSettingChange,
}: {
  settings: SystemSettings;
  onSettingChange: (key: keyof SystemSettings, val: string) => void;
}) {
  const [stats, setStats] = useState<any>(null);
  const [showDbUrl, setShowDbUrl] = useState(false);

  useEffect(() => {
    getSystemInfo()
      .then(setStats)
      .catch(() => {});
  }, []);

  const systemStats = [
    {
      label: "Relational Database Engine",
      value: stats?.dbVersion || "PostgreSQL v15.4 Client",
      status: "active" as const,
    },
    {
      label: "System Node.js Runtime",
      value: stats?.nodeVersion || "v20.12.0 LTS (Linux x64)",
      status: "active" as const,
    },
    {
      label: "Server Up-Time Metric",
      value: stats
        ? `${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m`
        : "182h 14m",
      status: "active" as const,
    },
    {
      label: "Latest Automated Backup",
      value: stats
        ? new Date(stats.lastBackup).toLocaleString()
        : "Today 03:00 UTC",
      status: "active" as const,
    },
    {
      label: "Roster Database Capacity",
      value: stats?.dbStorageUsed || "1.8 MB / 20.0 GB allocated",
      status: "active" as const,
    },
    {
      label: "Active Shift Configurations",
      value: stats ? `${stats.counts.shifts} active` : "3 configured",
      status: "active" as const,
    },
  ];

  return (
    <div className="fams-settings-stack">
      <Card>
        <CardHeader
          title="Server Runtime Metrics"
          description="Check backend hardware and data storage status."
        />
        <div className="divide-y divide-[var(--border)]">
          {systemStats.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between px-6 py-4.5 gap-4"
            >
              <span className="text-sm font-semibold text-[var(--muted)]">
                {s.label}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono font-bold text-[var(--text)]">
                  {s.value}
                </span>
                <StatusBadge status={s.status} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Operational Storage & DR"
          description="Calibrate scheduled database backups."
        />
        <div className="fams-settings-card-body space-y-5">
          <div className="space-y-1.5">
            <label className="fams-settings-label">
              System Database URI Connection
            </label>
            <div className="relative flex items-center">
              <input
                type={showDbUrl ? "text" : "password"}
                readOnly
                value={
                  settings.sys_db_url || "postgresql://••••@localhost:5432/fams"
                }
                className="w-full pl-3.5 pr-11 py-2.5 text-sm font-mono text-[var(--muted)] border border-[var(--border)] rounded-[var(--radius)] bg-[var(--gray-50)] outline-none"
              />
              <button
                type="button"
                onClick={() => setShowDbUrl(!showDbUrl)}
                aria-label={
                  showDbUrl ? "Hide database URL" : "Show database URL"
                }
                className="absolute right-3.5 p-1 text-[var(--muted)] hover:text-[var(--neutral)] focus:outline-none transition-colors"
              >
                {showDbUrl ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="fams-settings-label">
                Backup Frequency Interval
              </label>
              <SelectInput
                value={settings.sys_backup_freq || "daily"}
                onChange={(v) => onSettingChange("sys_backup_freq", v)}
                options={[
                  { value: "hourly", label: "Hourly backups" },
                  { value: "daily", label: "Daily backups (03:00 UTC)" },
                  { value: "weekly", label: "Weekly backups" },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <label className="fams-settings-label">
                Backup Retention Lifespan
              </label>
              <NumberInput
                value={settings.sys_backup_retention || "30"}
                onChange={(v) => onSettingChange("sys_backup_retention", v)}
                suffix="days"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Throttling & Debug Logs"
          description="Configure request rate limiting parameters."
        />
        <div className="fams-settings-card-body fams-settings-grid fams-settings-grid-2">
          <div className="space-y-1.5">
            <label className="fams-settings-label">Rate Limiting Window</label>
            <NumberInput
              value={settings.sys_rate_limit_window || "15"}
              onChange={(v) => onSettingChange("sys_rate_limit_window", v)}
              suffix="mins"
            />
          </div>
          <div className="space-y-1.5">
            <label className="fams-settings-label">Max Requests Allowed</label>
            <NumberInput
              value={settings.sys_rate_limit_max || "100"}
              onChange={(v) => onSettingChange("sys_rate_limit_max", v)}
              suffix="reqs"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Section: Danger Zone ───────────────────────────────────────────────────────

function DangerSection({
  onFactoryReset,
}: {
  onFactoryReset: () => Promise<void>;
}) {
  const [factoryResetShow, setFactoryResetShow] = useState(false);
  const [purgeDescriptorsShow, setPurgeDescriptorsShow] = useState(false);
  const [purgeAuditShow, setPurgeAuditShow] = useState(false);

  const handlePurgeDescriptors = async () => {
    try {
      const res = await purgeDescriptors();
      toast.success(res.message || "Face descriptors successfully purged");
      setPurgeDescriptorsShow(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to purge face descriptors");
    }
  };

  const handlePurgeAudit = async () => {
    try {
      const res = await purgeAudit();
      toast.success(res.message || "Audit logs successfully purged");
      setPurgeAuditShow(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to purge audit logs");
    }
  };

  const actions = [
    {
      title: "Initiate Factory Reset",
      description:
        "Erase all operational logs, attendance logs, and manual overrides. Staff user credentials are saved.",
      buttonLabel: "Reset Database",
      show: factoryResetShow,
      setShow: setFactoryResetShow,
      warning:
        "All historical attendance files and manual corrections will be permanently deleted from database structures.",
      onConfirm: async () => {
        await onFactoryReset();
        setFactoryResetShow(false);
      },
    },
    {
      title: "Scrub Biometric Descriptor Maps",
      description:
        "Delete mathematical face vectors from database records. Staff must physically re-enroll at camera nodes.",
      buttonLabel: "Scrub Biometrics",
      show: purgeDescriptorsShow,
      setShow: setPurgeDescriptorsShow,
      warning:
        "Every staff member must present physically for roster scanning. System cameras will reject access attempts.",
      onConfirm: handlePurgeDescriptors,
    },
    {
      title: "Scrub Immutable Audit Trail",
      description:
        "Scrub administrative logs. This may violate record retention laws in your local jurisdiction.",
      buttonLabel: "Scrub Audits",
      show: purgeAuditShow,
      setShow: setPurgeAuditShow,
      warning:
        "Consult a legal compliance officer. Most labor regulations require keeping operational audit trails for 2–7 years.",
      onConfirm: handlePurgeAudit,
    },
  ];

  return (
    <Card className="border-[color-mix(in_srgb,var(--danger)_25%,var(--border))]">
      <CardHeader
        title="Danger Zone"
        description="Irreversible database destructive operations."
        titleStyle={{ color: "#e11d48" }}
      />
      <div className="divide-y divide-[var(--border)]">
        {actions.map((a) => (
          <div
            key={a.title}
            className="p-6 hover:bg-rose-50/5 transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
              <div>
                <p className="text-sm font-bold text-[var(--text)] leading-snug">
                  {a.title}
                </p>
                <p className="text-xs text-[var(--muted)] mt-1 leading-normal">
                  {a.description}
                </p>
              </div>
              {!a.show ? (
                <button
                  onClick={() => a.setShow(true)}
                  className="px-4 py-2 text-xs font-bold text-[var(--danger)] border border-[color-mix(in_srgb,var(--danger)_25%,var(--border))] hover:bg-[color-mix(in_srgb,var(--danger)_6%,var(--surface))] bg-white rounded-[var(--radius)] transition-all cursor-pointer whitespace-nowrap shrink-0 sm:self-center"
                >
                  {a.buttonLabel}
                </button>
              ) : (
                <div className="flex gap-2 shrink-0 sm:self-center">
                  <button
                    onClick={() => a.setShow(false)}
                    className="px-4 py-2 text-xs font-bold text-[var(--neutral)] border border-[var(--border)] hover:bg-[var(--gray-50)] bg-white rounded-[var(--radius)] transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={a.onConfirm}
                    className="px-4 py-2 text-xs font-bold text-white bg-[var(--danger)] hover:opacity-90 rounded-[var(--radius)] transition-all cursor-pointer"
                  >
                    Confirm Execution
                  </button>
                </div>
              )}
            </div>
            {a.show && (
              <div className="mt-4 animate-fade-in">
                <InfoBox type="warning">{a.warning}</InfoBox>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Section: Floor Kiosk (PWA) ─────────────────────────────────────────────────

function TerminalsSection() {
  const kioskUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/kiosk`
      : "/kiosk";

  const copyKioskUrl = () => {
    navigator.clipboard.writeText(kioskUrl);
    toast.success("Kiosk URL copied");
  };

  return (
    <div className="fams-settings-stack">
      <Card>
        <CardHeader
          title="Floor attendance kiosk"
          description="Tablets use the same FAMS web app as a Progressive Web App — no Android APK."
        />
        <div className="fams-settings-card-body space-y-5">
          <InfoBox type="info">
            Open <span className="font-mono font-semibold">/kiosk</span> on each
            factory tablet, then Add to Home Screen (Chrome / Safari). The
            installed icon launches straight into the scanner — same look and
            settings as the admin app.
          </InfoBox>

          <ol className="space-y-3 text-sm text-[var(--text)] list-decimal pl-5">
            <li>
              Prefer <span className="font-semibold">HTTPS</span> in production
              so the camera is allowed (browsers block insecure camera access).
            </li>
            <li>
              On factory Wi‑Fi the device usually unlocks automatically. Off-site,
              an admin unlocks once with Google under the kiosk screen.
            </li>
            <li>
              Tune recognition and display under{" "}
              <span className="font-semibold">AI &amp; Kiosk</span>. Manage the
              shared device token under{" "}
              <span className="font-semibold">Security</span>.
            </li>
            <li>
              Regenerating the kiosk token forces every tablet to unlock again.
            </li>
          </ol>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={copyKioskUrl}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-[var(--neutral)] border border-[var(--border)] hover:bg-[var(--gray-100)] bg-white rounded-[var(--radius)] transition-all cursor-pointer"
            >
              <Copy size={13} /> Copy kiosk URL
            </button>
            <a
              href="/kiosk"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded-[var(--radius)] transition-all no-underline"
            >
              <ExternalLink size={13} /> Open kiosk
            </a>
          </div>

          <p className="fams-settings-hint font-mono break-all">{kioskUrl}</p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Install on a tablet"
          description="Chrome on Android or Safari on iPad."
        />
        <div className="fams-settings-card-body space-y-4 text-sm text-[var(--muted)] leading-relaxed">
          <div>
            <p className="font-bold text-[var(--text)] mb-1">Android (Chrome)</p>
            <p>
              Open the kiosk URL → menu → <em>Install app</em> or{" "}
              <em>Add to Home screen</em>. Launch from the home-screen icon for a
              full-screen, app-like scanner.
            </p>
          </div>
          <div>
            <p className="font-bold text-[var(--text)] mb-1">iPad (Safari)</p>
            <p>
              Open the kiosk URL → Share → <em>Add to Home Screen</em>. Use the
              home-screen icon so the kiosk runs without Safari chrome.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Root Component ─────────────────────────────────────────────────────────────

export function Settings() {
  const { user: currentUser, logout, updateUser: updateAuthUser } = useAuth();

  const [active, setActive] = useState<Section>("profile");
  const [settings, setSettings] = useState<SystemSettings>({
    teaBreakDuration: "15",
    lunchBreakDuration: "30",
    breakOvertimeAlert: "5",
    standardWorkHours: "8",
    overtimeThreshold: "9",
    deductBreaks: "true",
    perm_supervisor_salary_view: "true",
    perm_supervisor_worker_view: "true",
    perm_supervisor_worker_delete: "false",
    perm_supervisor_correction_approve: "true",
    ai_threshold: "0.55",
  });
  const [saved, setSaved] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        if (s.sec_kiosk_token) {
          localStorage.setItem("fams_kiosk_token", s.sec_kiosk_token);
        }
      })
      .catch(() => {});
  }, []);

  const handleSettingChange = (key: keyof SystemSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaveStatus("idle");
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      await saveSettings(settings);
      setSaveStatus("saved");
      setSaved(true);
      if (settings.sec_kiosk_token) {
        localStorage.setItem("fams_kiosk_token", settings.sec_kiosk_token);
      }
      toast.success("Roster rules saved successfully");
      setTimeout(() => {
        setSaveStatus("idle");
        setSaved(false);
      }, 2500);
    } catch (err: any) {
      setSaveStatus("error");
      toast.error(err.message || "Failed to save roster rules");
    }
  };

  const handleFactoryReset = async () => {
    if (
      !confirm(
        "WARNING: This will permanently delete ALL workers, attendance logs, corrections, and salary records. Staff accounts and rules will be preserved. Are you absolutely sure?",
      )
    )
      return;
    const verify = prompt('Type "RESET" to confirm:');
    if (verify !== "RESET") {
      toast.info("Factory reset cancelled.");
      return;
    }
    try {
      await factoryReset();
      toast.success(
        "System has been factory reset and is ready for production!",
      );
    } catch (err: any) {
      toast.error(err.message || "Factory reset failed");
    }
  };

  const panels: Record<Section, React.ReactNode> = {
    profile: (
      <ProfileSection
        currentUser={currentUser}
        logout={logout}
        updateAuthUser={updateAuthUser}
      />
    ),
    operational: (
      <OperationalSection
        settings={settings}
        onSettingChange={handleSettingChange}
      />
    ),
    shifts: (
      <ShiftsSection
        settings={settings}
        onSettingChange={handleSettingChange}
      />
    ),
    permissions: (
      <span data-tour="settings-permissions">
        <PermissionsSection
          settings={settings}
          onSettingChange={handleSettingChange}
        />
      </span>
    ),
    ai_kiosk: (
      <AIKioskSection
        settings={settings}
        onSettingChange={handleSettingChange}
      />
    ),
    biometric: (
      <BiometricSection
        settings={settings}
        onSettingChange={handleSettingChange}
      />
    ),
    security: (
      <span data-tour="settings-security">
        <SecuritySection
          settings={settings}
          onSettingChange={handleSettingChange}
        />
      </span>
    ),
    notifications: (
      <NotificationsSection
        settings={settings}
        onSettingChange={handleSettingChange}
      />
    ),
    payroll: (
      <PayrollSection
        settings={settings}
        onSettingChange={handleSettingChange}
      />
    ),
    integrations: <IntegrationsSection />,
    audit: (
      <AuditSection settings={settings} onSettingChange={handleSettingChange} />
    ),
    system: (
      <SystemSection
        settings={settings}
        onSettingChange={handleSettingChange}
      />
    ),
    danger: (
      <span data-tour="settings-danger">
        <DangerSection onFactoryReset={handleFactoryReset} />
      </span>
    ),
    terminals: <TerminalsSection />,
  };

  const activeItem = navGroups
    .flatMap((g) => g.items)
    .find((i) => i.id === active)!;
  const showSaveButton =
    active !== "danger" &&
    active !== "profile" &&
    active !== "integrations" &&
    active !== "terminals";

  return (
    <div className="fams-settings-layout">
      <div className="fams-settings-body">
        <aside
          id="settings-nav"
          data-tour="settings-nav"
          className="fams-settings-nav"
        >
          <div className="fams-settings-nav-head">
            <p className="fams-settings-nav-head-title">Settings</p>
            <p className="fams-settings-nav-head-sub">System configuration</p>
          </div>

          <nav className="fams-settings-nav-scroll">
            {navGroups.map((group) => (
              <div key={group.label} className="fams-settings-nav-group">
                <p className="fams-settings-nav-group-label">{group.label}</p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActive(item.id)}
                    className="fams-settings-nav-item"
                    data-active={active === item.id}
                    data-danger={item.danger || undefined}
                  >
                    <span className="fams-settings-nav-icon">{item.icon}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="fams-settings-nav-badge">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {currentUser && (
            <div className="fams-settings-nav-user">
              <p className="fams-settings-nav-user-name">{currentUser.name}</p>
              <p className="fams-settings-nav-user-role">{currentUser.role}</p>
            </div>
          )}
        </aside>

        <main className="fams-settings-main">
          <div id="settings-card" className="fams-settings-content">
            <div className="fams-settings-hero">
              <div
                className="fams-settings-hero-icon"
                data-danger={active === "danger" || undefined}
              >
                {activeItem.icon}
              </div>
              <div className="min-w-0">
                <h1 className="fams-settings-hero-title">{activeItem.label}</h1>
                <p className="fams-settings-hero-desc">{sectionMeta[active]}</p>
              </div>
              {saved && (
                <span className="fams-settings-saved ml-auto shrink-0">
                  <CheckCircle2 size={16} /> Saved
                </span>
              )}
            </div>

            <div className="fams-settings-breadcrumb">
              <span>Settings</span>
              <ChevronRight size={14} />
              <span
                className="fams-settings-breadcrumb-active"
                data-danger={active === "danger" || undefined}
              >
                {activeItem.label}
              </span>
            </div>

            <div className="fams-settings-stack">{panels[active]}</div>

            {showSaveButton && (
              <div className="fams-settings-save-bar">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Reset all unsaved changes to saved values?")) {
                      getSettings()
                        .then(setSettings)
                        .catch(() => {});
                      toast.info("Reverted to saved settings");
                    }
                  }}
                  className="fams-btn fams-btn-outline"
                >
                  <RotateCcw size={13} /> Reset
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveStatus === "saving"}
                  className="fams-btn fams-btn-primary"
                >
                  <Save size={14} />
                  {saveStatus === "saving" ? "Saving…" : "Save changes"}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
