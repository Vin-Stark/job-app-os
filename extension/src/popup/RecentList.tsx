// Collapsible list of recent finished captures on the ready screen. Clicking
// one reopens its done-state (PDF re-rendered locally — no network, no credits).

import { useState } from 'react'
import type { HistoryEntry } from '../lib/historyStore'
import { relativeTime } from '../lib/time'

export function RecentList({ entries, onOpen, onClear }: {
  entries: HistoryEntry[]
  onOpen: (e: HistoryEntry) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null
  return (
    <div className="pt-1">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500 hover:text-slate-300">
        <span>Recent ({entries.length})</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {entries.map((e, i) => (
            <button key={i} onClick={() => onOpen(e)}
              className="w-full text-left rounded-md border border-slate-800 hover:border-slate-600 hover:bg-slate-900 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-slate-200 truncate">
                  <b>{e.company || 'Unknown'}</b> · {e.title || 'Untitled role'}
                </span>
                {e.matchScore != null && (
                  <span className="shrink-0 text-[11px] text-slate-400">Match {e.matchScore}%</span>
                )}
              </div>
              <div className="text-[10px] text-slate-600">{relativeTime(e.savedAt)}</div>
            </button>
          ))}
          <button onClick={onClear} className="w-full h-6 text-[11px] text-slate-600 hover:text-slate-400">
            Clear recent
          </button>
        </div>
      )}
    </div>
  )
}
