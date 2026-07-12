import { useState } from 'react'
import { Search, Trash2, Zap } from 'lucide-react'
import { useApplications, useUpdateApplication, useDeleteApplication } from '@/hooks/useApplications'
import { STATUS_CONFIG, ALL_STATUSES, type ApplicationStatus } from '@/lib/statusConfig'
import { StatusBadge } from '@/components/StatusBadge'

type FilterStatus = ApplicationStatus | 'all'

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted/60 ${className}`} />
}

function ApplicationsSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-[520px]" />
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="h-10 bg-muted/30 border-b border-border" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ApplicationsPage({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const { data: apps, isLoading, error } = useApplications()
  const updateApp = useUpdateApplication()
  const deleteApp = useDeleteApplication()

  if (isLoading) return <ApplicationsSkeleton />

  if (error) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-sm text-rose-400">Failed to load applications. Please refresh.</p>
      </div>
    )
  }

  const list = apps ?? []

  const statusCounts = ALL_STATUSES.reduce<Record<ApplicationStatus, number>>((acc, s) => {
    acc[s] = list.filter(a => a.status === s).length
    return acc
  }, {} as Record<ApplicationStatus, number>)

  const filtered = list.filter(a => {
    const matchStatus = filterStatus === 'all' || a.status === filterStatus
    const q = searchQuery.toLowerCase()
    const matchSearch = !q ||
      (a.company_name?.toLowerCase().includes(q) ?? false) ||
      (a.job_title?.toLowerCase().includes(q) ?? false) ||
      (a.location?.toLowerCase().includes(q) ?? false)
    return matchStatus && matchSearch
  })

  return (
    <div className="p-6">
      {/* Toolbar */}
      <div className="flex items-start gap-3 mb-5 flex-wrap">
        <div className="relative w-[240px] flex-shrink-0">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search company or role…"
            className="w-full pl-8 pr-3 h-8 text-[12px] bg-card border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-0.5 bg-card border border-border p-0.5 rounded-md overflow-x-auto flex-shrink-0 max-w-full">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-2.5 h-6 text-[10px] rounded transition-colors whitespace-nowrap flex-shrink-0 ${
              filterStatus === 'all' ? 'font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
            style={filterStatus === 'all'
              ? { fontFamily: 'var(--font-mono)', background: 'var(--lime)', color: 'var(--lime-foreground)' }
              : { fontFamily: 'var(--font-mono)' }}
          >
            All ({list.length})
          </button>
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2.5 h-6 text-[10px] rounded transition-colors whitespace-nowrap flex-shrink-0 ${
                filterStatus === s ? 'font-medium' : 'text-muted-foreground hover:text-foreground'
              }`}
              style={filterStatus === s
                ? { fontFamily: 'var(--font-mono)', background: 'var(--lime)', color: 'var(--lime-foreground)' }
                : { fontFamily: 'var(--font-mono)' }}
            >
              {STATUS_CONFIG[s].label} ({statusCounts[s]})
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {list.length === 0 ? (
        <div className="bg-card border border-border rounded-lg flex flex-col items-center justify-center py-16 text-center">
          <p className="text-[14px] font-semibold text-foreground mb-1">No applications yet</p>
          <p className="text-[12px] text-muted-foreground mb-4">
            Generate your first tailored documents to get started.
          </p>
          <button
            onClick={() => onNavigate('generate')}
            className="flex items-center gap-1.5 px-4 h-8 text-[11px] font-medium rounded-full hover:opacity-85 transition-opacity"
            style={{ background: 'var(--lime)', color: 'var(--lime-foreground)' }}
          >
            <Zap size={11} /> Generate first application
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg flex items-center justify-center py-12">
          <p className="text-[13px] text-muted-foreground">No applications match this filter.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Company', 'Role', 'Location', 'Status', 'Applied', ''].map(h => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground bg-muted"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(app => (
                <tr
                  key={app.id}
                  className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors group"
                >
                  {/* Company */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-[6px] bg-muted border border-border flex items-center justify-center text-[9px] font-bold text-foreground flex-shrink-0">
                        {app.company_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <span className="text-[13px] font-medium text-foreground">
                        {app.company_name ?? '—'}
                      </span>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3 max-w-[200px]">
                    <span className="text-[13px] text-foreground truncate block">
                      {app.job_title ?? '—'}
                    </span>
                  </td>

                  {/* Location */}
                  <td className="px-4 py-3">
                    <span className="text-[12px] text-muted-foreground">
                      {app.location ?? '—'}
                    </span>
                  </td>

                  {/* Status — badge with invisible select overlay for inline editing */}
                  <td className="px-4 py-3">
                    <div className="relative inline-flex">
                      <StatusBadge status={app.status} />
                      <select
                        value={app.status}
                        onChange={e =>
                          updateApp.mutate({ id: app.id, status: e.target.value as ApplicationStatus })
                        }
                        disabled={updateApp.isPending}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full disabled:cursor-not-allowed"
                        title="Change status"
                      >
                        {ALL_STATUSES.map(s => (
                          <option key={s} value={s}>
                            {STATUS_CONFIG[s].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  {/* Applied date */}
                  <td className="px-4 py-3">
                    <span
                      className="text-[11px] text-muted-foreground"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {new Date(app.applied_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </td>

                  {/* Delete */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deleteApp.mutate(app.id)}
                      disabled={deleteApp.isPending}
                      className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-rose-400 hover:bg-rose-950/40 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
