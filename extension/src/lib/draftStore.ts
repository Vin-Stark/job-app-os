// In-progress capture draft in chrome.storage.local, so closing the popup /
// side panel (or restarting the browser) doesn't lose the captured JD, edits,
// jd_meta, or a finished result. Same storage pattern as auth.ts.

import type { ScrapedJob, JdMeta, EligibilityCheck } from './types'

const DRAFT_KEY = 'jobappos_draft'
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

// Only settled phases are restorable — transient ones (analyzing, tailoring…)
// degrade to 'review' at save time so a reopen never lands on a dead spinner.
export type DraftPhase = 'review' | 'ineligible' | 'done'

export interface Draft {
  v: 1 // schema version — bump to invalidate persisted drafts on shape changes
  savedAt: number
  userId: number | null // owner guard: never restore another account's draft
  phase: DraftPhase
  title: string
  company: string
  jd: string
  source: ScrapedJob['source'] | null
  scrapeDebug: string
  jdMeta: JdMeta | null
  resumeId: number | null
  checks: EligibilityCheck[]
  ineligibleMsg: string
  score: number | null
  jobId: number | null
  // Plain text, not the PDF data URL — the PDF is re-rendered locally from
  // this via resumePdf.ts, so there's no point persisting 100s of KB of base64.
  tailoredText: string
}

export async function getDraft(): Promise<Draft | null> {
  const out = await chrome.storage.local.get(DRAFT_KEY)
  const draft = out[DRAFT_KEY] as Draft | undefined
  if (!draft || draft.v !== 1 || Date.now() - draft.savedAt > DRAFT_TTL_MS) {
    if (draft) await clearDraft()
    return null
  }
  return draft
}

export async function setDraft(d: Omit<Draft, 'v' | 'savedAt'>): Promise<void> {
  const draft: Draft = { ...d, v: 1, savedAt: Date.now() }
  await chrome.storage.local.set({ [DRAFT_KEY]: draft })
}

export async function clearDraft(): Promise<void> {
  await chrome.storage.local.remove(DRAFT_KEY)
}
