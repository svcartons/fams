interface StatusBadgeProps {
  status: 'checked-in' | 'tea-break' | 'lunch-break' | 'checked-out' | 'absent' | 'offline';
  size?: 'sm' | 'md';
}

const styles = {
  'checked-in':   { label: 'In',       color: 'var(--success)' },
  'tea-break':    { label: 'Tea',      color: 'var(--accent)' },
  'lunch-break':  { label: 'Lunch',    color: '#7C3AED' },
  'checked-out':  { label: 'Out',      color: 'var(--neutral)' },
  'absent':       { label: 'Absent',   color: 'var(--danger)' },
  'offline':      { label: 'Offline',  color: 'var(--warning)' },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const s = styles[status];
  const text = size === 'sm' ? 'text-[11px] px-1.5 py-0.5' : 'text-[12px] px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded fams-mono ${text}`}
      style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 10%, transparent)` }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}
