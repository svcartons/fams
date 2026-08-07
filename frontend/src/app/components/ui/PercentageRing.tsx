type PercentageRingProps = {
  pct: number;
  size?: number;
  stroke?: number;
  className?: string;
  label?: string;
};

export function PercentageRing({ pct, size = 64, stroke = 5, className = '', label }: PercentageRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 80 ? 'var(--success)' : clamped >= 50 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-semibold fams-mono">{clamped.toFixed(0)}%</span>
        {label && <span className="text-[9px] text-[var(--muted)]">{label}</span>}
      </div>
    </div>
  );
}
