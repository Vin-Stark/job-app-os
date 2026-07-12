import { STATUS_CONFIG, type ApplicationStatus } from '@/lib/statusConfig'

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[9px] px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <span className={`w-1 h-1 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}
