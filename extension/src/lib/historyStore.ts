// Recent finished captures in chrome.storage.local: lets the user reopen a
// tailored resume and re-download the PDF without spending AI credits again.
// Capped list, newest first; the PDF is re-rendered from tailoredText locally.

import type { EligibilityCheck } from './types'

const HISTORY_KEY = 'jobappos_history'
const MAX_ENTRIES = 10

export interface HistoryEntry {
  savedAt: number
  userId: number | null
  jobId: number | null
  title: string
  company: string
  // Post-tailor keyword coverage % (deterministic ATS score)
  score: number | null
  // Holistic job-match % — optional: entries saved before it existed lack it,
  // so every reader must guard
  matchScore?: number | null
  // JD skills still missing after tailoring (must-have + preferred terms) —
  // optional for the same reason
  missingSkills?: string[] | null
  tailoredText: string
  checks: EligibilityCheck[]
}

async function readAll(): Promise<HistoryEntry[]> {
  const out = await chrome.storage.local.get(HISTORY_KEY)
  const list = out[HISTORY_KEY] as HistoryEntry[] | undefined
  return Array.isArray(list) ? list : []
}

export async function getHistory(userId: number | null): Promise<HistoryEntry[]> {
  return (await readAll()).filter(e => e.userId === userId)
}

export async function addHistoryEntry(e: Omit<HistoryEntry, 'savedAt'>): Promise<void> {
  const entry: HistoryEntry = { ...e, savedAt: Date.now() }
  const rest = (await readAll()).filter(
    x => !(x.userId === entry.userId && x.jobId != null && x.jobId === entry.jobId)
  )
  await chrome.storage.local.set({ [HISTORY_KEY]: [entry, ...rest].slice(0, MAX_ENTRIES) })
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.remove(HISTORY_KEY)
}
