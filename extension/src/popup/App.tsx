import { useEffect, useState, useCallback } from 'react'
import { api, ApiError } from '../lib/api'
import { isAuthed, getUser } from '../lib/auth'
import type {
  Resume, ScrapedJob, AnalyzeResponse, FinalizeResponse, EligibilityCheck,
  ExtractJobResponse, PrecheckResponse, JdMeta, TrackerApplication, Recommendation,
  SkillsBreakdown,
} from '../lib/types'
import { resumePdfDataUrl } from '../lib/resumePdf'
import { getDraft, setDraft, clearDraft, type DraftPhase } from '../lib/draftStore'
import { getHistory, addHistoryEntry, clearHistory, type HistoryEntry } from '../lib/historyStore'
import { relativeTime } from '../lib/time'
import { RecentList } from './RecentList'
import {
  scrapeCurrentTab, getSelectionFromTab, getFullPageText, getActiveTabUrl,
  enableDragOnTab, openLogin, openPdfPreview,
} from './actions'

type Phase =
  | 'loading' | 'unauth' | 'ready'
  | 'review' | 'prechecking' | 'extracting' | 'analyzing' | 'ineligible' | 'scored' | 'tailoring' | 'done'

// Band colors for the Job Match headline (thresholds mirror the backend's
// recommendation bands: ≥80 good, 60–79 borderline, <60 tailor first).
const matchBandCls = (s: number | null) =>
  s == null ? 'text-zinc-200' : s >= 80 ? 'text-emerald-300' : s >= 60 ? 'text-amber-300' : 'text-rose-300'

// Color-banded card background for the scored screen.
const scoreBandCls = (s: number | null) =>
  s == null ? 'border-zinc-800 bg-zinc-900/60'
  : s >= 80 ? 'border-emerald-800/60 bg-emerald-950/40'
  : s >= 60 ? 'border-amber-800/60 bg-amber-950/40'
  : 'border-rose-800/60 bg-rose-950/40'

// Color-banded pill for the done screen match score badge.
const matchPillCls = (s: number) =>
  s >= 80 ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
  : s >= 60 ? 'bg-amber-950/60 border-amber-800/60 text-amber-300'
  : 'bg-rose-950/60 border-rose-800/60 text-rose-300'

// Real skills (must-have + preferred) the resume lacks, must-haves first —
// domain terms are context vocabulary, not skills, and are excluded. Capped
// to keep drafts/history small; the count is what the UI leads with.
const missingSkillTerms = (missing?: { term: string; category: string }[]) => {
  if (!missing) return null
  const skills = missing.filter(m => m.category !== 'domain')
  return [
    ...skills.filter(m => m.category === 'must_have'),
    ...skills.filter(m => m.category !== 'must_have'),
  ].map(m => m.term).slice(0, 40)
}

function sanitize(s: string) {
  return (s || 'resume').replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'resume'
}

// A draft with no captured/typed content and no generated result. The 30-char
// floor matches the run() validation, below which a JD can't be submitted anyway.
const draftIsEmpty = (d: { title: string; company: string; jd: string; tailoredText: string }) =>
  !d.title.trim() && !d.company.trim() && d.jd.trim().length < 30 && !d.tailoredText

// Normalizers for duplicate detection: tolerate case/punctuation differences
// and tracking params in URLs.
const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const normUrl = (s: string) => {
  try {
    const u = new URL(s)
    return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase()
  } catch {
    return ''
  }
}

export function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [userName, setUserName] = useState<string>('')
  const [userId, setUserId] = useState<number | null>(null)
  const [resumes, setResumes] = useState<Resume[]>([])
  const [resumesLoaded, setResumesLoaded] = useState(false)
  const [resumeId, setResumeId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // captured / editable job fields
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [jd, setJd] = useState('')
  const [source, setSource] = useState<ScrapedJob['source'] | null>(null)
  const [scrapeDebug, setScrapeDebug] = useState('')
  // JD metadata from the extraction call — lets /analyze skip its JD-parse call
  const [jdMeta, setJdMeta] = useState<JdMeta | null>(null)

  // results
  const [checks, setChecks] = useState<EligibilityCheck[]>([])
  const [ineligibleMsg, setIneligibleMsg] = useState('')
  const [score, setScore] = useState<number | null>(null)
  const [matchScore, setMatchScore] = useState<number | null>(null)
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null)
  // Must-have + preferred JD keywords absent from the resume, must-haves first
  const [missingSkills, setMissingSkills] = useState<string[] | null>(null)
  // Categorized gap view (must-have / proof-based / trainable / not covered)
  const [skills, setSkills] = useState<SkillsBreakdown | null>(null)
  const [jobId, setJobId] = useState<number | null>(null)
  const [tailoredText, setTailoredText] = useState('')
  const [pdfDataUrl, setPdfDataUrl] = useState('')
  const [dragMsg, setDragMsg] = useState<string | null>(null)

  // persistence extras: when the current state came from a saved draft,
  // history entries, and a non-blocking "already in your tracker" warning
  const [restoredAt, setRestoredAt] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [dupWarning, setDupWarning] = useState<string | null>(null)

  const loadResumes = useCallback(async () => {
    const res = await api.get<{ success: boolean; resumes: Resume[] }>('/api/resumes/list')
    const list = res.resumes || []
    setResumes(list)
    setResumesLoaded(true)
    if (list.length > 0) setResumeId(prev => prev ?? list.reduce((a, b) => (a.id > b.id ? a : b)).id)
    return list
  }, [])

  const refreshAuth = useCallback(async () => {
    setError(null)
    // If unauthenticated, leave any saved draft alone — it restores after the
    // user logs back in (the userId guard below covers account switches).
    if (!(await isAuthed())) { setPhase('unauth'); return }
    const u = await getUser()
    const uid = u?.id ?? null
    setUserId(uid)
    setUserName(u?.name || u?.email || '')
    setHistory(await getHistory(uid))
    try {
      const list = await loadResumes()
      // Restore only after auth + resume list resolved, so restore can never
      // race the initial load or point at a resume that no longer exists.
      // Empty drafts (e.g. from a failed capture that landed on a blank review
      // form) are dropped — restoring them would hijack the home screen.
      const draft = await getDraft()
      if (draft && draft.userId === uid && !draftIsEmpty(draft)) {
        setTitle(draft.title); setCompany(draft.company); setJd(draft.jd)
        setSource(draft.source); setScrapeDebug(draft.scrapeDebug)
        setJdMeta(draft.jdMeta)
        if (draft.resumeId != null && list.some(r => r.id === draft.resumeId)) {
          setResumeId(draft.resumeId)
        }
        setChecks(draft.checks); setIneligibleMsg(draft.ineligibleMsg)
        setScore(draft.score); setJobId(draft.jobId); setTailoredText(draft.tailoredText)
        setMatchScore(draft.matchScore); setRecommendation(draft.recommendation)
        setMissingSkills(draft.missingSkills); setSkills(draft.skills)
        if (draft.phase === 'done' && draft.tailoredText) {
          try { setPdfDataUrl(resumePdfDataUrl(draft.tailoredText)) } catch { setPdfDataUrl('') }
        }
        setRestoredAt(draft.savedAt)
        // A scored draft is only restorable when the decision screen can
        // actually render and generate — otherwise fall back to review.
        setPhase(draft.phase === 'scored' && (draft.jobId == null || draft.matchScore == null)
          ? 'review'
          : draft.phase)
      } else {
        if (draft && draft.userId === uid) void clearDraft()
        setPhase('ready')
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load your resumes.')
      setPhase(e instanceof ApiError && e.status === 401 ? 'unauth' : 'ready')
    }
  }, [loadResumes])

  useEffect(() => { refreshAuth() }, [refreshAuth])

  // Persist the working draft on every meaningful change (debounced). This is
  // the only writer of the draft key, and it never fires from loading/unauth/
  // ready — merely opening the popup can't clobber a saved draft, and reset()
  // (which lands on 'ready') can't resurrect one. Transient phases persist as
  // 'review' so a reopen never lands on a dead spinner.
  useEffect(() => {
    if (phase === 'loading' || phase === 'unauth' || phase === 'ready') return
    const persistPhase: DraftPhase =
      phase === 'ineligible' ? 'ineligible'
        : phase === 'done' ? 'done'
        // Tailoring is transient but all of scored's inputs are in state — a
        // reopen mid-tailor lands back on the decision screen, not the form.
        : (phase === 'scored' || phase === 'tailoring') && jobId != null && matchScore != null ? 'scored'
        : 'review'
    const t = setTimeout(() => {
      const draft = {
        userId, phase: persistPhase, title, company, jd, source, scrapeDebug,
        jdMeta, resumeId, checks, ineligibleMsg, score, jobId, tailoredText,
        matchScore, recommendation, missingSkills, skills,
      }
      // A blank review form (failed capture, or the user cleared everything)
      // isn't worth keeping — remove any stored draft instead of saving it.
      if (draftIsEmpty(draft)) void clearDraft()
      else void setDraft(draft)
    }, 300)
    return () => clearTimeout(t)
  }, [phase, userId, title, company, jd, source, scrapeDebug, jdMeta, resumeId,
    checks, ineligibleMsg, score, jobId, tailoredText,
    matchScore, recommendation, missingSkills, skills])

  // Non-blocking tracker lookup: warn if this job already has an application.
  const checkDuplicate = async (jobTitle: string, companyName: string) => {
    try {
      const [res, tabUrl] = await Promise.all([
        api.get<{ success: boolean; data: TrackerApplication[] }>('/api/applications'),
        getActiveTabUrl(),
      ])
      const url = normUrl(tabUrl)
      const key = `${normText(companyName)}|${normText(jobTitle)}`
      const hit = (res.data || []).find(r => {
        if (url && r.job_url && normUrl(r.job_url) === url) return true
        if (key === '|') return false
        return `${normText(r.company_name || '')}|${normText(r.job_title || '')}` === key
      })
      if (hit) {
        const when = hit.applied_date ? new Date(hit.applied_date).toLocaleDateString() : ''
        setDupWarning(`Already in your tracker — ${hit.status.replace(/_/g, ' ')}${when ? `, applied ${when}` : ''}.`)
      }
    } catch { /* convenience check only — never block capture on it */ }
  }

  // ── Capture ──────────────────────────────────────────────────────────────
  const capture = async () => {
    setError(null)
    setJdMeta(null)
    // A new capture replaces whatever was saved — never restore the old job.
    void clearDraft()
    setRestoredAt(null)
    setDupWarning(null)
    setChecks([]); setIneligibleMsg(''); setScore(null)
    setMatchScore(null); setRecommendation(null); setMissingSkills(null); setSkills(null)
    setJobId(null); setTailoredText(''); setPdfDataUrl('')
    try {
      const job = await scrapeCurrentTab()
      setTitle(job.job_title)
      setCompany(job.company_name)
      setJd(job.raw_text)
      setSource(job.source)
      setScrapeDebug(job.debug || '')
      void checkDuplicate(job.job_title, job.company_name)

      // For the API calls, use the FULLEST text available: scraping heuristics
      // can drop the description entirely (LinkedIn), but if the JD is on
      // screen it's in the raw page text — and both precheck and extraction
      // are built to tolerate noise.
      const fullText = await getFullPageText()
      const captureText = fullText.length > job.raw_text.length ? fullText : job.raw_text

      // FREE pre-gate first: deterministic server check (visa, years of
      // experience, tech-stack floor) on the raw page text — zero AI credits.
      // Obviously-ineligible jobs stop here before any Claude call is made.
      if (resumeId && captureText.length >= 200) {
        setPhase('prechecking')
        try {
          const pre = await api.post<PrecheckResponse>('/api/generate/precheck', {
            resume_id: resumeId,
            raw_text: captureText,
          })
          if (!pre.eligible) {
            setChecks(pre.checks)
            setIneligibleMsg('You don\'t meet this role\'s hard requirements — checked instantly, no AI credits used. Nothing was logged.')
            setScrapeDebug(((job.debug || '') + ' · precheck=blocked-free').trim())
            setPhase('ineligible')
            return
          }
          setScrapeDebug(((job.debug || '') + ' · precheck=pass').trim())
        } catch {
          // Precheck is an optimization — never block capture on its failure;
          // /analyze re-runs the same gate server-side regardless.
          setScrapeDebug(((job.debug || '') + ' · precheck=skipped').trim())
        }
      }

      // LinkedIn readability-scrapes contain side-panel noise and often lack
      // title/company — run AI extraction on the FULL page text automatically.
      // Never blocks: any failure falls back to the raw editable capture.
      if (job.page_host?.includes('linkedin.com') && job.source === 'readability' && captureText.length >= 200) {
        setPhase('extracting')
        try {
          const cleaned = await api.post<ExtractJobResponse>('/api/generate/extract-job', {
            raw_text: captureText,
          })
          setTitle(cleaned.data.job_title || job.job_title)
          setCompany(cleaned.data.company_name || job.company_name)
          setJd(cleaned.data.raw_text)
          setJdMeta(cleaned.data.jd_meta ?? null)
          setSource('ai-extract')
          setScrapeDebug(prev => (prev + ' · ai-extract=ok').trim())
        } catch {
          setScrapeDebug(prev => (prev + ' · ai-extract=failed').trim())
        }
      }
      setPhase('review')
    } catch (e) {
      // Still let the user paste manually
      setTitle(''); setCompany(''); setJd(''); setSource('manual'); setScrapeDebug('')
      setError(e instanceof Error ? e.message : 'Could not read the page.')
      setPhase('review')
    }
  }

  // Manual AI cleanup — usable on any site from the review screen.
  const [cleaning, setCleaning] = useState(false)
  const applyExtract = (cleaned: ExtractJobResponse) => {
    if (cleaned.data.job_title) setTitle(cleaned.data.job_title)
    if (cleaned.data.company_name) setCompany(cleaned.data.company_name)
    setJd(cleaned.data.raw_text)
    setJdMeta(cleaned.data.jd_meta ?? null)
    setSource('ai-extract')
  }
  const cleanUpWithAI = async () => {
    setError(null)
    setCleaning(true)
    try {
      // Prefer the textarea content, but if it's thin (bad capture), start
      // straight from the full page text.
      let text = jd.trim()
      if (text.length < 500) {
        const full = await getFullPageText()
        if (full.length > text.length) text = full
      }
      if (text.length < 200) {
        setError('Not enough text to clean up — open the posting (with the description visible), re-capture, or paste the JD.')
        return
      }
      try {
        applyExtract(await api.post<ExtractJobResponse>('/api/generate/extract-job', { raw_text: text }))
      } catch (e) {
        // 422 = the given text had no complete JD. Retry ONCE with the whole
        // page — the description may be on screen but missing from the capture.
        if (e instanceof ApiError && e.status === 422) {
          const full = await getFullPageText()
          if (full.length >= 200 && full !== text) {
            try {
              applyExtract(await api.post<ExtractJobResponse>('/api/generate/extract-job', { raw_text: full }))
              return
            } catch { /* fall through to guidance below */ }
          }
          setError('No complete job description found on this page. Open the posting fully (click "See more" so the whole description is visible), then try again — or highlight the description text and click "Use highlighted text".')
          return
        }
        throw e
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'AI cleanup failed — the text is unchanged.')
    } finally {
      setCleaning(false)
    }
  }

  const useSelection = async () => {
    const sel = await getSelectionFromTab()
    if (sel) { setJd(sel); setSource('selection'); setError(null) }
    else setError('No text is highlighted on the page.')
  }

  // ── Analyze (strict) → scored review → Finalize on explicit click ─────────
  const run = async () => {
    setError(null)
    if (!resumeId) { setError('Pick a resume first.'); return }
    if (!title.trim() || !company.trim() || jd.trim().length < 30) {
      setError('Fill in the role, company, and a job description (at least a few lines).')
      return
    }
    setPhase('analyzing')
    let analyze: AnalyzeResponse
    try {
      analyze = await api.post<AnalyzeResponse>('/api/generate/analyze', {
        resume_id: resumeId,
        raw_text: jd.trim(),
        job_title: title.trim(),
        company_name: company.trim(),
        strict_eligibility: true,
        // Pre-parsed metadata from extraction — saves the JD-parse Claude call
        ...(jdMeta ? { jd_meta: jdMeta } : {}),
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Analysis failed. Try again.')
      setPhase('review')
      return
    }

    if (!analyze.eligible) {
      setChecks(analyze.checks || [])
      setIneligibleMsg(analyze.message || 'You do not meet this role’s hard requirements.')
      setPhase('ineligible')
      return
    }

    setChecks(analyze.data.checks || [])
    setScore(analyze.data.coverage?.score ?? null)
    setMatchScore(Math.round(analyze.data.match?.match_score ?? 0))
    setRecommendation(analyze.data.recommendation ?? null)
    setMissingSkills(missingSkillTerms(analyze.data.coverage?.missing))
    setSkills(analyze.data.skills_breakdown ?? null)
    setJobId(analyze.data.job_id)
    // Stop here — show the match score and recommendation. Tailoring (and the
    // tracker entry it creates) only happens on the user's explicit click.
    setPhase('scored')
  }

  const generate = async () => {
    if (!resumeId || jobId == null) return
    setError(null)
    setPhase('tailoring')
    try {
      const fin = await api.post<FinalizeResponse>('/api/generate/finalize', {
        resume_id: resumeId,
        job_id: jobId,
        generate_cover_letter: false,
      })
      const text = fin.data.tailored_resume || ''
      const finalScore = fin.data.coverage?.score ?? score
      // Skills the tailor could NOT truthfully cover — the honest remaining gaps
      const finalMissing = missingSkillTerms(fin.data.coverage?.missing) ?? missingSkills
      setTailoredText(text)
      setScore(finalScore)
      setMissingSkills(finalMissing)
      // Build the PDF once, up front, so preview + drag are instant.
      try {
        setPdfDataUrl(resumePdfDataUrl(text))
      } catch {
        setPdfDataUrl('') // preview/drag disabled but the tailored text still shows
      }
      // Record under "Recent" so the PDF can be reopened later without
      // regenerating (no AI credits).
      void addHistoryEntry({
        userId, jobId,
        title: title.trim(), company: company.trim(),
        score: finalScore, matchScore, missingSkills: finalMissing, tailoredText: text,
        checks,
      }).then(() => getHistory(userId).then(setHistory)).catch(() => {})
      setPhase('done')
    } catch (e) {
      // Analysis is already paid for and saved — retry from the scored screen.
      setError(e instanceof ApiError ? e.message : 'Tailoring failed. Your analysis is saved — try again.')
      setPhase('scored')
    }
  }

  const filename = `${sanitize(company)}_${sanitize(title)}_resume.pdf`

  const preview = () => { if (pdfDataUrl) openPdfPreview(pdfDataUrl) }
  const download = () => {
    if (!pdfDataUrl) return
    const a = document.createElement('a')
    a.href = pdfDataUrl
    a.download = filename
    a.click()
  }
  const enableDrag = async () => {
    setDragMsg(null)
    try {
      await enableDragOnTab(filename, pdfDataUrl)
      setDragMsg('Drag handle added to the page — drag it into the résumé upload field.')
    } catch (e) {
      setDragMsg(e instanceof Error ? e.message : 'Could not add the drag handle.')
    }
  }

  const reset = () => {
    void clearDraft()
    setPhase('ready'); setError(null); setChecks([]); setIneligibleMsg('')
    setPdfDataUrl(''); setScore(null); setDragMsg(null); setJdMeta(null)
    setMatchScore(null); setRecommendation(null); setMissingSkills(null); setSkills(null)
    setTitle(''); setCompany(''); setJd(''); setSource(null); setScrapeDebug('')
    setJobId(null); setTailoredText(''); setRestoredAt(null); setDupWarning(null)
  }

  // Reopen a finished capture from "Recent": rebuild the done screen and PDF
  // from the stored tailored text — zero network, zero AI credits.
  const openHistoryEntry = (e: HistoryEntry) => {
    setError(null); setDragMsg(null); setDupWarning(null)
    setTitle(e.title); setCompany(e.company)
    setChecks(e.checks || []); setScore(e.score)
    setMatchScore(e.matchScore ?? null); setRecommendation(null)
    setMissingSkills(e.missingSkills ?? null)
    setJobId(e.jobId); setTailoredText(e.tailoredText)
    try { setPdfDataUrl(resumePdfDataUrl(e.tailoredText)) } catch { setPdfDataUrl('') }
    setRestoredAt(e.savedAt)
    setPhase('done')
  }

  const clearRecent = () => {
    void clearHistory()
    setHistory([])
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 min-h-[200px] text-[13px]">
      <Header userName={userName} phase={phase} />

      {error && (
        <div className="mb-3 rounded-md border border-rose-800/60 bg-rose-950/50 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      )}

      {phase === 'loading' && <p className="text-zinc-400">Loading…</p>}

      {phase === 'unauth' && (
        <div className="space-y-3">
          <p className="text-zinc-300 leading-relaxed">
            Connect your tailr account to capture jobs and tailor resumes.
          </p>
          <button onClick={openLogin}
            className="w-full h-9 rounded-full font-semibold hover:opacity-90"
            style={{ background: '#C6FF34', color: '#171717' }}>
            Connect account
          </button>
          <button onClick={refreshAuth}
            className="w-full h-8 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-[12px]">
            I've logged in — refresh
          </button>
        </div>
      )}

      {phase === 'ready' && (
        <div className="space-y-3">
          {!resumesLoaded ? (
            <button onClick={refreshAuth}
              className="w-full h-9 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              Retry loading resumes
            </button>
          ) : resumes.length === 0 ? (
            <p className="text-amber-300 leading-relaxed">
              No resume on file. Upload one in the web app's Profile, then reopen this.
            </p>
          ) : (
            <>
              <ResumePicker resumes={resumes} value={resumeId} onChange={setResumeId} />
              <button onClick={capture}
                className="w-full h-10 rounded-full font-semibold hover:opacity-90"
                style={{ background: '#C6FF34', color: '#171717' }}>
                Capture this job
              </button>
              <p className="text-[11px] text-zinc-500 text-center">
                Reads the open posting. Nothing is saved until you pass the checks.
              </p>
            </>
          )}
          <RecentList entries={history} onOpen={openHistoryEntry} onClear={clearRecent} />
        </div>
      )}

      {phase === 'review' && (
        <div className="space-y-3">
          {dupWarning && (
            <div className="rounded-md border border-amber-800/60 bg-amber-950/50 px-3 py-2 text-[12px] text-amber-200 leading-relaxed">
              {dupWarning}
            </div>
          )}
          {restoredAt != null && (
            <p className="text-[11px] text-zinc-500">
              Restored draft · captured {relativeTime(restoredAt)}
            </p>
          )}
          <ResumePicker resumes={resumes} value={resumeId} onChange={setResumeId} />
          <Field label="Role"><input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Senior Frontend Engineer" className={inputCls} /></Field>
          <Field label="Company"><input value={company} onChange={e => setCompany(e.target.value)}
            placeholder="e.g. Acme" className={inputCls} /></Field>
          <Field label={`Job description${source ? ` · via ${source}` : ''}`}>
            <textarea value={jd} onChange={e => setJd(e.target.value)} rows={5}
              placeholder="Paste the JD here if the page couldn't be read." className={inputCls + ' resize-none'} />
          </Field>
          {(source === 'ai-extract' || source === 'json-ld' || (source === 'ats' && jd.trim().length > 300)) ? (
            <p className="text-[11px] text-emerald-400">
              ✓ Captured{source === 'ai-extract' ? ' & cleaned by AI' : ''} — review the fields and continue.
            </p>
          ) : (
            scrapeDebug && (
              <p className="text-[10px] text-zinc-600 leading-relaxed break-all">{scrapeDebug}</p>
            )
          )}
          <div className="flex gap-2">
            <button onClick={useSelection}
              className="flex-1 h-8 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-[12px]">
              Use highlighted text
            </button>
            <button onClick={capture}
              className="flex-1 h-8 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-[12px]">
              Re-scrape page
            </button>
          </div>
          <button onClick={cleanUpWithAI} disabled={cleaning}
            className="w-full h-8 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-[12px] disabled:opacity-40 flex items-center justify-center gap-2">
            {cleaning && <span className="w-3 h-3 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />}
            {cleaning ? 'Cleaning…' : 'Clean up with AI (extract role · company · JD)'}
          </button>
          <button onClick={run}
            className="w-full h-10 rounded-full font-semibold hover:opacity-90"
            style={{ background: '#C6FF34', color: '#171717' }}>
            Check eligibility & match
          </button>
          <button onClick={reset} className="w-full h-8 text-[12px] text-zinc-400 hover:text-zinc-200">Cancel</button>
        </div>
      )}

      {phase === 'prechecking' && <Busy label="Instant eligibility check — no AI…" />}
      {phase === 'extracting' && <Busy label="Cleaning up the capture with AI…" />}
      {phase === 'analyzing' && <Busy label="Checking eligibility & scoring the match…" />}
      {phase === 'tailoring' && <Busy label="Tailoring your resume…" />}

      {phase === 'scored' && (
        <div className="space-y-3">
          <div className={`rounded-[10px] border px-3 py-3 ${scoreBandCls(matchScore)}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.12em] text-zinc-500"
                style={{ fontFamily: 'var(--font-mono)' }}>Job match</span>
              <span className={`text-[32px] font-bold leading-none ${matchBandCls(matchScore)}`}
                style={{ fontFamily: 'var(--font-stat)' }}>{matchScore}%</span>
            </div>
            {recommendation && (
              <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-300">
                <b className="text-zinc-200">Interview chances: {recommendation.interview_chances}.</b>{' '}
                {recommendation.advice}
              </p>
            )}
          </div>
          <SkillGaps skills={skills} />
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Job match = AI judgment of how well your background fits this role.
            Skill gaps are split by what they mean: proof-based ones are already
            evidenced in your resume, trainable ones have a same-kind tool you
            know — only real gaps stay gaps. Tailoring never invents skills.
          </p>
          <ChecksList checks={checks} />
          <button onClick={generate}
            className="w-full h-10 rounded-full font-semibold hover:opacity-90"
            style={{ background: '#C6FF34', color: '#171717' }}>
            Generate tailored resume
          </button>
          <p className="text-[11px] text-zinc-500 text-center">
            Not in your tracker yet — generating adds it.
          </p>
          <button onClick={reset} className="w-full h-8 text-[12px] text-zinc-400 hover:text-zinc-200">Start over</button>
        </div>
      )}

      {phase === 'ineligible' && (
        <div className="space-y-3">
          <div className="rounded-md border border-amber-800/60 bg-amber-950/50 px-3 py-2 text-amber-200 text-[12px] leading-relaxed">
            {ineligibleMsg}
          </div>
          <ChecksList checks={checks} />
          <p className="text-[11px] text-zinc-500">Not added to your tracker — nothing was logged.</p>
          <button onClick={() => setPhase('review')}
            className="w-full h-9 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            Edit & retry
          </button>
          <button onClick={reset} className="w-full h-8 text-[12px] text-zinc-400 hover:text-zinc-200">Start over</button>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 px-2.5 py-1 text-[12px] font-semibold">
              Eligible · logged to tracker
            </span>
            {matchScore != null && (
              <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold border ${matchPillCls(matchScore)}`}>
                Match {matchScore}%
              </span>
            )}
            {missingSkills != null && (
              <span className="rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 px-2.5 py-1 text-[12px] font-semibold">
                {missingSkills.length} missing
              </span>
            )}
          </div>
          {restoredAt != null && (
            <p className="text-[11px] text-zinc-500">
              {company || title ? `${company}${company && title ? ' · ' : ''}${title} — ` : ''}
              generated {relativeTime(restoredAt)}
            </p>
          )}
          {checks.length > 0 && <ChecksList checks={checks} />}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={preview} disabled={!pdfDataUrl}
              className="h-9 rounded-md border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">
              Preview
            </button>
            <button onClick={download} disabled={!pdfDataUrl}
              className="h-9 rounded-md border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">
              Download
            </button>
          </div>
          <button onClick={enableDrag} disabled={!pdfDataUrl}
            className="w-full h-10 rounded-full font-semibold hover:opacity-90 disabled:opacity-40"
            style={{ background: '#C6FF34', color: '#171717' }}>
            Drag into the application
          </button>
          {dragMsg && <p className="text-[11px] text-zinc-400 leading-relaxed">{dragMsg}</p>}
          {!pdfDataUrl && (
            <p className="text-[11px] text-amber-300">
              PDF couldn't be generated from the tailored text, but it's saved in your tracker.
            </p>
          )}
          <button onClick={reset} className="w-full h-8 text-[12px] text-zinc-400 hover:text-zinc-200">Capture another</button>
        </div>
      )}
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#C6FF34]/40 text-[12px]'

function Header({ userName, phase }: { userName: string; phase: Phase }) {
  // Version in the header proves which build is loaded — bump on every fix.
  let version = ''
  try { version = chrome.runtime.getManifest().version } catch { /* non-extension context */ }
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div style={{
          background: '#C6FF34', color: '#171717', width: '20px', height: '20px',
          borderRadius: '5px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
          </svg>
        </div>
        <span style={{ fontWeight: 600, fontSize: '14px', color: '#fff', letterSpacing: '-0.01em' }}>
          tailr{version && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 400, color: '#71717a' }}>v{version}</span>}
        </span>
      </div>
      {phase !== 'loading' && phase !== 'unauth' && userName && (
        <div className="text-[11px] text-zinc-500 truncate max-w-[140px]">{userName}</div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1"
        style={{ fontFamily: 'var(--font-mono)' }}>{label}</span>
      {children}
    </label>
  )
}

function ResumePicker({ resumes, value, onChange }: { resumes: Resume[]; value: number | null; onChange: (id: number) => void }) {
  if (resumes.length === 0) return null
  return (
    <Field label="Resume">
      <select value={value ?? ''} onChange={e => onChange(Number(e.target.value))} className={inputCls}>
        {resumes.map(r => <option key={r.id} value={r.id}>{r.filename}</option>)}
      </select>
    </Field>
  )
}

// Categorized skill-gap view for the scored screen. Rendered only when the
// JD isn't a 100% keyword match; buckets come pre-validated from the backend.
function SkillGaps({ skills }: { skills: SkillsBreakdown | null }) {
  if (!skills) return null
  const gapTotal = skills.must_have_missing.length + skills.proof_based.length
    + skills.trainable.length + skills.not_covered.length
  if (gapTotal === 0) {
    return (
      <p className="rounded-md border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-[12px] text-emerald-300">
        ✓ Your resume covers every skill named in this JD.
      </p>
    )
  }
  const terms = (list: string[], cap = 6) =>
    list.slice(0, cap).join(' · ') + (list.length > cap ? ' · …' : '')
  return (
    <div className="rounded-[10px] border border-zinc-800 px-3 py-2.5 space-y-2.5">
      {skills.must_have_missing.length > 0 ? (
        <div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-semibold text-rose-300">Must-have skills missing</span>
            <span className="font-semibold text-rose-300">{skills.must_have_missing.length}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400 leading-relaxed">{terms(skills.must_have_missing)}</p>
        </div>
      ) : (
        <p className="text-[12px] text-emerald-300">✓ All must-have skills covered</p>
      )}
      {skills.proof_based.length > 0 && (
        <div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-semibold text-emerald-300">Proof-based — you've done this work</span>
            <span className="font-semibold text-emerald-300">{skills.proof_based.length}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400 leading-relaxed">{terms(skills.proof_based.map(p => p.term))}</p>
        </div>
      )}
      {skills.trainable.length > 0 && (
        <div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-semibold text-amber-300">Trainable — you know something similar</span>
            <span className="font-semibold text-amber-300">{skills.trainable.length}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-400 leading-relaxed">
            {skills.trainable.slice(0, 4).map(t => `${t.term} (knows ${t.similar_skill})`).join(' · ')}
            {skills.trainable.length > 4 ? ' · …' : ''}
          </p>
        </div>
      )}
      {skills.not_covered.length > 0 && (
        <div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-zinc-400">Not covered</span>
            <span className="text-zinc-400">{skills.not_covered.length}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500 leading-relaxed">{terms(skills.not_covered)}</p>
        </div>
      )}
    </div>
  )
}

function ChecksList({ checks }: { checks: EligibilityCheck[] }) {
  if (!checks || checks.length === 0) return null
  return (
    <ul className="space-y-1.5">
      {checks.map((c, i) => (
        <li key={i} className="flex items-start gap-2 text-[12px]">
          <span className={c.verdict === 'pass' ? 'text-emerald-400' : 'text-rose-400'}>
            {c.verdict === 'pass' ? '✓' : '✗'}
          </span>
          <span className="text-zinc-300">
            <b className="text-zinc-200 capitalize">{c.name.replace(/_/g, ' ')}:</b> {c.reason}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Busy({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-6 justify-center text-zinc-300">
      <span className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
      {label}
    </div>
  )
}
