import { useState, useEffect } from 'react'
import { ArrowRight, Briefcase, TrendingUp, Clock, CheckCircle, Zap, ChevronRight, Puzzle } from 'lucide-react'
import { useApplications, type Application } from '@/hooks/useApplications'
import { STATUS_CONFIG, ALL_STATUSES, type ApplicationStatus } from '@/lib/statusConfig'
import { StatusBadge } from '@/components/StatusBadge'

function useExtensionInstalled() {
  const [installed, setInstalled] = useState(
    () => document.documentElement.getAttribute('data-tailr-ext') === 'true'
  )
  useEffect(() => {
    if (installed) return
    const handler = () => setInstalled(true)
    document.addEventListener('tailr:installed', handler)
    return () => document.removeEventListener('tailr:installed', handler)
  }, [installed])
  return installed
}

// ── Company initial badge ─────────────────────────────────────────────────────
function CompanyBadge({ name }: { name: string | null }) {
  return (
    <div className="w-6 h-6 rounded-[6px] bg-muted border border-border flex items-center justify-center text-[9px] font-bold text-foreground flex-shrink-0">
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted/60 ${className}`} />
}

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg px-4 py-4 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-2 bg-card border border-border rounded-lg p-4 space-y-3">
          <Skeleton className="h-3 w-32" />
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
        <div className="col-span-3 bg-card border border-border rounded-lg p-4 space-y-3">
          <Skeleton className="h-3 w-40" />
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </div>
    </div>
  )
}

// ── Compute dashboard stats ───────────────────────────────────────────────────
function computeStats(apps: Application[]) {
  const total = apps.length
  const counts = ALL_STATUSES.reduce<Record<ApplicationStatus, number>>((acc, s) => {
    acc[s] = apps.filter(a => a.status === s).length
    return acc
  }, {} as Record<ApplicationStatus, number>)

  const progressed = apps.filter(a => !['applied', 'rejected', 'withdrawn'].includes(a.status)).length
  const responseRate = total > 0 ? Math.round((progressed / total) * 100) : 0

  const activeInterviews = (
    counts.phone_screen +
    counts.technical_round +
    counts.behavioral_round +
    counts.hr_round
  )

  return { total, counts, responseRate, activeInterviews }
}

// ── Main component ────────────────────────────────────────────────────────────
export function DashboardPage({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { data: apps, isLoading, error } = useApplications()
  const extensionInstalled = useExtensionInstalled()

  if (isLoading) return <DashboardSkeleton />

  if (error) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-sm text-rose-400">Failed to load applications. Please refresh.</p>
      </div>
    )
  }
  const list = apps ?? []
  const { total, counts, responseRate, activeInterviews } = computeStats(list)
  const recent = list.slice(0, 6)

  const STATS = [
    {
      label: 'Total Tracked',
      value: total,
      sub: total === 0 ? 'No applications yet' : `${list.filter(a => {
        const d = new Date(a.applied_date)
        const week = new Date(); week.setDate(week.getDate() - 7)
        return d >= week
      }).length} this week`,
      icon: Briefcase,
    },
    {
      label: 'Response Rate',
      value: `${responseRate}%`,
      sub: responseRate === 0 ? 'No responses yet' : 'Got past initial apply',
      icon: TrendingUp,
    },
    {
      label: 'Active Interviews',
      value: activeInterviews,
      sub: activeInterviews === 0 ? 'None in progress' : `Across ${activeInterviews} position${activeInterviews !== 1 ? 's' : ''}`,
      icon: Clock,
    },
    {
      label: 'Offers',
      value: counts.offer,
      sub: counts.offer === 0 ? 'Keep applying' : `${counts.offer} pending decision${counts.offer !== 1 ? 's' : ''}`,
      icon: CheckCircle,
    },
  ]

  // Pipeline: all 8 statuses, skip any with 0 count and total > 0 to keep it clean
  const pipelineRows = ALL_STATUSES
    .map(s => ({ status: s, count: counts[s], pct: total > 0 ? Math.round((counts[s] / total) * 100) : 0 }))
    .filter(r => total === 0 || r.count > 0)

  return (
    <div className="p-6 space-y-5">

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-4 gap-4">
        {STATS.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="bg-card border border-border rounded-lg px-4 py-4 hover:bg-muted/20 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium"
                style={{ fontFamily: 'var(--font-mono)' }}>
                {label}
              </span>
              <Icon size={13} className="text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div className="text-[40px] font-extrabold text-foreground leading-none mb-2 tracking-tight"
              style={{ fontFamily: 'var(--font-stat)' }}>
              {value}
            </div>
            <div className="text-[11px] text-muted-foreground">{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Middle row ── */}
      <div className="grid grid-cols-5 gap-4">

        {/* Pipeline breakdown */}
        <div className="col-span-2 bg-card border border-border rounded-lg p-4">
          <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-4"
            style={{ fontFamily: 'var(--font-mono)' }}>
            Pipeline breakdown
          </p>
          {total === 0 ? (
            <p className="text-[12px] text-muted-foreground">No applications tracked yet.</p>
          ) : (
            <div className="space-y-3">
              {pipelineRows.map(({ status, count, pct }) => {
                const cfg = STATUS_CONFIG[status]
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        <span className="text-[12px] text-foreground">{cfg.label}</span>
                      </div>
                      <span className="text-[12px] font-bold text-muted-foreground tracking-tight"
                        style={{ fontFamily: 'var(--font-stat)' }}>
                        {count} <span className="font-normal opacity-60">· {pct}%</span>
                      </span>
                    </div>
                    <div className="h-[3px] bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${cfg.dot}`}
                        style={{ width: `${pct}%`, transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent applications */}
        <div className="col-span-3 bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium"
              style={{ fontFamily: 'var(--font-mono)' }}>
              Recent applications
            </p>
            <button
              onClick={() => onNavigate('applications')}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              View all <ArrowRight size={11} />
            </button>
          </div>

          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-[13px] font-medium text-foreground mb-1">No applications yet</p>
              <p className="text-[12px] text-muted-foreground mb-4">
                Paste a job description to get started.
              </p>
              <button
                onClick={() => onNavigate('generate')}
                className="flex items-center gap-1.5 px-4 h-8 text-[11px] font-medium rounded-full hover:opacity-85 transition-opacity"
                style={{ background: 'var(--lime)', color: 'var(--lime-foreground)' }}
              >
                <Zap size={11} /> Generate first application
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {recent.map(app => (
                <div key={app.id}
                  className="flex items-center gap-3 py-2 border-b border-border last:border-0 hover:bg-muted/40 -mx-2 px-2 rounded transition-colors cursor-default">
                  <CompanyBadge name={app.company_name} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-foreground truncate">
                      {app.job_title ?? '—'}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {app.company_name ?? '—'}{app.location ? ` · ${app.location}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <StatusBadge status={app.status} />
                    <span className="text-[10px] text-muted-foreground"
                      style={{ fontFamily: 'var(--font-mono)' }}>
                      {new Date(app.applied_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CTA banner ── */}
      <div
        onClick={() => onNavigate('generate')}
        className="rounded-lg px-6 py-5 flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity"
        style={{ background: 'var(--lime)' }}
      >
        <div>
          <div className="text-[15px] font-semibold mb-1"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--lime-foreground)' }}>
            Generate tailored resume &amp; cover letter
          </div>
          <p className="text-[12px]" style={{ color: 'rgba(23,23,23,0.5)' }}>
            Paste a job description and get matched documents in under 5 seconds.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md px-4 py-2.5 flex-shrink-0"
          style={{ background: 'rgba(23,23,23,0.12)' }}>
          <Zap size={13} style={{ color: 'var(--lime-foreground)' }} />
          <span className="text-[12px] font-medium" style={{ color: 'var(--lime-foreground)' }}>Try it now</span>
          <ChevronRight size={13} style={{ color: 'rgba(23,23,23,0.6)' }} />
        </div>
      </div>

      {!extensionInstalled && (
        <div className="rounded-lg border border-border px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Puzzle size={15} strokeWidth={1.75} className="text-muted-foreground flex-shrink-0" />
            <div>
              <div className="text-[13px] font-semibold text-foreground"
                style={{ fontFamily: 'var(--font-display)' }}>
                Get the tailr extension
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Capture job postings and drag tailored resumes straight into applications.
              </p>
            </div>
          </div>
          <a
            href="https://github.com/Vin-Stark/job-app-os/tree/main/extension"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-[12px] font-medium px-4 py-2 rounded-md border border-border
                       text-foreground hover:bg-muted transition-colors"
          >
            Install →
          </a>
        </div>
      )}
    </div>
  )
}
