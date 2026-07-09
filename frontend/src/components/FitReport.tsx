import { useState, useEffect } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Plus, Sparkles, X } from 'lucide-react'
import type { AnalyzeResult, KeywordMiss } from '@/hooks/useAnalyzeJob'
import type { SupplementInput } from '@/hooks/useFinalizeDocs'
import { useResumeLinks, useSaveLinks } from '@/hooks/useLinks'

const INPUT_CLS =
  'w-full px-3 h-9 text-[12px] bg-muted/40 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/50'

const LABEL_CLS =
  'block text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-1'

const MONO = { fontFamily: 'var(--font-mono)' } as const

function scoreColor(score: number) {
  if (score >= 70) return 'text-emerald-300'
  if (score >= 50) return 'text-amber-300'
  return 'text-rose-300'
}

function scoreChipCls(score: number) {
  if (score >= 70) return 'bg-emerald-950/60 border-emerald-800/60'
  if (score >= 50) return 'bg-amber-950/60 border-amber-800/60'
  return 'bg-rose-950/60 border-rose-800/60'
}

// Job Match bands mirror the backend's recommendation table:
// ≥80 good, 60–79 borderline, <60 tailor first.
function matchColor(score: number) {
  if (score >= 80) return 'text-emerald-300'
  if (score >= 60) return 'text-amber-300'
  return 'text-rose-300'
}

function matchChipCls(score: number) {
  if (score >= 80) return 'bg-emerald-950/60 border-emerald-800/60'
  if (score >= 60) return 'bg-amber-950/60 border-amber-800/60'
  return 'bg-rose-950/60 border-rose-800/60'
}

// One missing keyword row with an expandable evidence input
function MissingKeywordRow({
  kw, value, onChange,
}: {
  kw: KeywordMiss
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const hasValue = value.trim().length > 0

  return (
    <div className="border border-border rounded-md bg-muted/20">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[12px] text-foreground flex-1" style={MONO}>{kw.term}</span>
        {hasValue && !open && (
          <span className="text-[9px] text-emerald-400" style={MONO}>evidence added</span>
        )}
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          style={MONO}
        >
          {open ? <X size={10} /> : <Plus size={10} />}
          {open ? 'Close' : hasValue ? 'Edit' : 'I have this'}
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3">
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={`Real evidence only — e.g. "Set up ${kw.term} for 3 services at my last internship". This gets woven into your resume as fact.`}
            rows={2}
            className="w-full px-3 py-2 text-[12px] bg-muted/40 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/50 resize-none leading-relaxed"
          />
        </div>
      )}
    </div>
  )
}

interface Props {
  analysis: AnalyzeResult
  resumeId: number
  generating: boolean
  onGenerate: (supplements: SupplementInput[]) => void
}

export function FitReport({ analysis, resumeId, generating, onGenerate }: Props) {
  const { coverage, match, resume_gaps: gaps } = analysis

  // Evidence answers keyed by keyword term
  const [answers, setAnswers] = useState<Record<string, string>>({})
  // Inferred-evidence confirmations (default: confirmed)
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})
  const [extraFacts, setExtraFacts] = useState('')
  const [showMatched, setShowMatched] = useState(false)
  const [showPreferred, setShowPreferred] = useState(false)

  // Links state (pre-filled from DB)
  const [githubProfile, setGithubProfile] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [portfolio, setPortfolio] = useState('')
  const [projectLinks, setProjectLinks] = useState<Record<string, { github: string; live: string }>>({})
  const [openSourceNotes, setOpenSourceNotes] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  const linksQuery = useResumeLinks(resumeId)
  const saveLinks = useSaveLinks()

  useEffect(() => {
    if (!linksQuery.data) return
    const { social, projects } = linksQuery.data
    setGithubProfile(social.github_url || '')
    setLinkedin(social.linkedin_url || '')
    setPortfolio(social.portfolio_url || '')
    setOpenSourceNotes(social.open_source_notes || '')
    const map: Record<string, { github: string; live: string }> = {}
    for (const p of projects) {
      map[p.project_name] = { github: p.github_url || '', live: p.live_url || '' }
    }
    setProjectLinks(map)
  }, [linksQuery.data])

  // Only offer inferred suggestions for terms that are still missing
  const stillMissing = new Set(coverage.missing.map(m => m.term))
  const inferredActive = analysis.inferred.filter(i => stillMissing.has(i.term))
  const inferredTerms = new Set(inferredActive.map(i => i.term))

  // Seed inferred evidence into answers + confirmations (don't clobber edits)
  useEffect(() => {
    setAnswers(prev => {
      const next = { ...prev }
      for (const inf of analysis.inferred) {
        if (next[inf.term] === undefined) next[inf.term] = inf.quote
      }
      return next
    })
    setConfirmed(prev => {
      const next = { ...prev }
      for (const inf of analysis.inferred) {
        if (next[inf.term] === undefined) next[inf.term] = true
      }
      return next
    })
  }, [analysis.inferred])

  // Weight-ranked missing groups (inferred handled separately)
  const missingMustHave = coverage.missing.filter(m => m.category === 'must_have' && !inferredTerms.has(m.term))
  const missingPreferred = coverage.missing.filter(m => m.category === 'preferred' && !inferredTerms.has(m.term))
  const missingDomain = coverage.missing.filter(m => m.category === 'domain')

  const typedCount = coverage.missing.filter(
    m => !inferredTerms.has(m.term) && (answers[m.term] ?? '').trim()
  ).length
  const confirmedCount = inferredActive.filter(i => confirmed[i.term] && (answers[i.term] ?? '').trim()).length

  const showLinksSection =
    gaps.missing_github_profile || gaps.missing_linkedin || gaps.missing_portfolio ||
    gaps.missing_project_links.length > 0

  const handleGenerate = async () => {
    setSaveError(null)
    try {
      // Persist links first so the tailor picks them up from DB
      await saveLinks.mutateAsync({
        resumeId,
        payload: {
          social: {
            github_url: githubProfile.trim() || null,
            linkedin_url: linkedin.trim() || null,
            portfolio_url: portfolio.trim() || null,
          },
          projects: Object.entries(projectLinks).map(([project_name, v]) => ({
            project_name,
            github_url: v.github.trim() || null,
            live_url: v.live.trim() || null,
          })),
          open_source_notes: openSourceNotes.trim() || null,
        },
      })

      const supplements: SupplementInput[] = []
      // Confirmed resume-derived evidence
      for (const inf of inferredActive) {
        const content = (answers[inf.term] ?? '').trim()
        if (confirmed[inf.term] && content) {
          supplements.push({ keyword: inf.term, content, kind: 'evidence' })
        }
      }
      // User-typed evidence for keywords with no resume trace
      for (const m of coverage.missing) {
        if (inferredTerms.has(m.term)) continue
        const content = (answers[m.term] ?? '').trim()
        if (content) supplements.push({ keyword: m.term, content, kind: 'evidence' })
      }
      if (extraFacts.trim()) {
        supplements.push({ keyword: null, content: extraFacts.trim(), kind: 'note' })
      }
      onGenerate(supplements)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save links. Try again.')
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">

        {/* ── Scores ── */}
        <div>
          <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-3" style={MONO}>
            Fit Report — {analysis.job.job_title} @ {analysis.job.company_name}
          </p>
          <div className="flex items-stretch gap-3">
            <div className={`flex-1 rounded-lg border p-4 ${matchChipCls(match.match_score)}`}>
              <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground font-medium mb-1" style={MONO}>
                Job Match
              </p>
              <p className={`text-[28px] font-bold leading-none ${matchColor(match.match_score)}`} style={{ fontFamily: 'var(--font-stat)' }}>
                {match.match_score}%
              </p>
              <p className="text-[10px] text-muted-foreground mt-1.5" style={MONO}>
                recruiter-style AI judgment
              </p>
            </div>
            <div className={`flex-1 rounded-lg border p-4 ${scoreChipCls(coverage.score)}`}>
              <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground font-medium mb-1" style={MONO}>
                Keyword Coverage (ATS)
              </p>
              <p className={`text-[28px] font-bold leading-none ${scoreColor(coverage.score)}`} style={{ fontFamily: 'var(--font-stat)' }}>
                {coverage.score}%
              </p>
              <p className="text-[10px] text-muted-foreground mt-1.5" style={MONO}>
                {coverage.matched_count}/{coverage.total_count} keywords · target 70%+
              </p>
            </div>
          </div>
          {analysis.recommendation && (
            <div className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-2.5">
              <p className="text-[12px] text-foreground leading-relaxed">
                <b>Interview chances: {analysis.recommendation.interview_chances}.</b>{' '}
                <span className="text-muted-foreground">{analysis.recommendation.advice}</span>
              </p>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-3">
            Job Match is the AI's judgment of how well your background fits the role. Keyword Coverage is
            scored by strict keyword matching in code, weighted the way the JD weights them: must-haves ×2,
            nice-to-haves ×1, context terms ×0.5. We already searched your resume for evidence — only the
            leftovers below need your input, and anything you skip stays an honest gap.
          </p>
        </div>

        {/* ── Found in your resume — just confirm ── */}
        {inferredActive.length > 0 && (
          <div className="space-y-2">
            <p className="text-[9px] uppercase tracking-[0.12em] text-emerald-400/90 font-medium" style={MONO}>
              Found in your resume — confirm ({inferredActive.length})
            </p>
            <p className="text-[10px] text-muted-foreground/70 -mt-1">
              These JD keywords aren't verbatim in your resume, but we found real evidence of them in your own words. Confirm to count them.
            </p>
            <div className="space-y-1.5">
              {inferredActive.map(inf => (
                <div key={inf.term} className={`border rounded-md ${confirmed[inf.term] ? 'border-emerald-800/50 bg-emerald-950/20' : 'border-border bg-muted/20'}`}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      onClick={() => setConfirmed(prev => ({ ...prev, [inf.term]: !prev[inf.term] }))}
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        confirmed[inf.term]
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'border-border bg-muted/40'
                      }`}
                      title={confirmed[inf.term] ? 'Included — click to exclude' : 'Excluded — click to include'}
                    >
                      {confirmed[inf.term] && <Check size={11} strokeWidth={3} />}
                    </button>
                    <span className="text-[12px] text-foreground flex-1" style={MONO}>{inf.term}</span>
                    {inf.category === 'must_have' && (
                      <span className="text-[8px] uppercase tracking-[0.1em] text-rose-400/80 font-medium" style={MONO}>
                        must-have ×2
                      </span>
                    )}
                  </div>
                  {confirmed[inf.term] && (
                    <div className="px-3 pb-2.5">
                      <textarea
                        value={answers[inf.term] ?? ''}
                        onChange={e => setAnswers(prev => ({ ...prev, [inf.term]: e.target.value }))}
                        rows={2}
                        className="w-full px-3 py-2 text-[11px] bg-muted/30 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-muted-foreground focus:text-foreground resize-none leading-relaxed"
                      />
                      <p className="text-[9px] text-muted-foreground/60 mt-1" style={MONO}>from your resume — edit if needed</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Missing must-haves (×2 weight) ── */}
        {missingMustHave.length > 0 && (
          <div className="space-y-2">
            <p className="text-[9px] uppercase tracking-[0.12em] text-rose-400/90 font-medium" style={MONO}>
              Missing must-haves — ×2 weight ({missingMustHave.length})
            </p>
            <p className="text-[10px] text-muted-foreground/70 -mt-1">
              No trace of these in your resume. Add evidence only if you genuinely have it.
            </p>
            <div className="space-y-1.5">
              {missingMustHave.map(kw => (
                <MissingKeywordRow
                  key={kw.term}
                  kw={kw}
                  value={answers[kw.term] ?? ''}
                  onChange={v => setAnswers(prev => ({ ...prev, [kw.term]: v }))}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Missing nice-to-haves (×1 weight, collapsed) ── */}
        {missingPreferred.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => setShowPreferred(v => !v)}
              className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-amber-400/80 font-medium hover:text-amber-300 transition-colors"
              style={MONO}
            >
              Missing nice-to-haves — ×1 weight ({missingPreferred.length})
              {showPreferred ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {showPreferred && (
              <div className="space-y-1.5">
                {missingPreferred.map(kw => (
                  <MissingKeywordRow
                    key={kw.term}
                    kw={kw}
                    value={answers[kw.term] ?? ''}
                    onChange={v => setAnswers(prev => ({ ...prev, [kw.term]: v }))}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Trainable skills (same-kind tool known — display only) ── */}
        {(analysis.skills_breakdown?.trainable?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <p className="text-[9px] uppercase tracking-[0.12em] text-amber-400/80 font-medium" style={MONO}>
              Trainable — you know a similar tool ({analysis.skills_breakdown.trainable.length})
            </p>
            <p className="text-[10px] text-muted-foreground/70 -mt-1">
              The JD names a tool you haven't used, but your resume shows the same kind of tool.
              Worth mentioning in interviews — never added to your resume automatically.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {analysis.skills_breakdown.trainable.map(t => (
                <span key={t.term}
                  className="text-[10px] bg-amber-950/40 border border-amber-800/40 text-amber-200 px-2 py-0.5 rounded"
                  style={MONO}>
                  {t.term} <span className="text-muted-foreground">(knows {t.similar_skill})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Missing context terms (×0.5, no questions — display only) ── */}
        {missingDomain.length > 0 && (
          <div className="space-y-2">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium" style={MONO}>
              Context terms — ×0.5 weight, low impact ({missingDomain.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {missingDomain.map(m => (
                <span key={m.term}
                  className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded"
                  style={MONO}>
                  {m.term}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Matched keywords (collapsed) ── */}
        {coverage.matched.length > 0 && (
          <div>
            <button
              onClick={() => setShowMatched(v => !v)}
              className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium hover:text-foreground transition-colors"
              style={MONO}
            >
              Matched keywords ({coverage.matched.length})
              {showMatched ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {showMatched && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {coverage.matched.map(m => (
                  <span
                    key={m.term}
                    title={m.matched_via !== m.term.toLowerCase() ? `matched via "${m.matched_via}"` : undefined}
                    className="text-[9px] bg-emerald-950/50 border border-emerald-800/40 text-emerald-300 px-1.5 py-0.5 rounded"
                    style={MONO}
                  >
                    {m.term}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Anything else ── */}
        <div className="space-y-2">
          <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium" style={MONO}>
            Anything else? (skills, certs, experience not on your resume)
          </p>
          <textarea
            value={extraFacts}
            onChange={e => setExtraFacts(e.target.value)}
            placeholder={'e.g. "AWS Certified Cloud Practitioner (2025)" or "Migrated our team\'s CI from Jenkins to GitHub Actions"'}
            rows={2}
            className="w-full px-3 py-2 text-[12px] bg-muted/40 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/50 resize-none leading-relaxed"
          />
        </div>

        {/* ── Profile & project links ── */}
        {showLinksSection && (
          <div className="space-y-3">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium" style={MONO}>
              Links (AI screeners deduct −3 to −5 pts per unlinked project)
            </p>
            {gaps.missing_github_profile && (
              <div>
                <label className={LABEL_CLS}>GitHub Profile URL</label>
                <input value={githubProfile} onChange={e => setGithubProfile(e.target.value)}
                  placeholder="https://github.com/yourusername" className={INPUT_CLS} />
              </div>
            )}
            {gaps.missing_linkedin && (
              <div>
                <label className={LABEL_CLS}>LinkedIn URL</label>
                <input value={linkedin} onChange={e => setLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/in/yourprofile" className={INPUT_CLS} />
              </div>
            )}
            {gaps.missing_portfolio && (
              <div>
                <label className={LABEL_CLS}>Portfolio / Personal Site</label>
                <input value={portfolio} onChange={e => setPortfolio(e.target.value)}
                  placeholder="https://yoursite.dev" className={INPUT_CLS} />
              </div>
            )}
            {gaps.missing_project_links.map(proj => (
              <div key={proj.name} className="space-y-2">
                <p className="text-[12px] font-medium text-foreground">{proj.name}</p>
                {proj.needs_github && (
                  <div>
                    <label className={LABEL_CLS}>GitHub Repo URL</label>
                    <input
                      value={projectLinks[proj.name]?.github ?? ''}
                      onChange={e => setProjectLinks(prev => ({
                        ...prev,
                        [proj.name]: { ...(prev[proj.name] ?? { github: '', live: '' }), github: e.target.value }
                      }))}
                      placeholder="https://github.com/you/project" className={INPUT_CLS} />
                  </div>
                )}
                {proj.needs_demo && (
                  <div>
                    <label className={LABEL_CLS}>Live Demo URL</label>
                    <input
                      value={projectLinks[proj.name]?.live ?? ''}
                      onChange={e => setProjectLinks(prev => ({
                        ...prev,
                        [proj.name]: { ...(prev[proj.name] ?? { github: '', live: '' }), live: e.target.value }
                      }))}
                      placeholder="https://yourproject.vercel.app" className={INPUT_CLS} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Open source notes ── */}
        {gaps.has_open_source_opportunity && (
          <div className="space-y-2">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium" style={MONO}>
              Open source contributions (contributions to others' repos score up to 35 pts; personal repos cap at 10)
            </p>
            <textarea
              value={openSourceNotes}
              onChange={e => setOpenSourceNotes(e.target.value)}
              placeholder={'e.g. "Contributed 8 PRs to React Query (TanStack/query, 35k stars)"'}
              rows={2}
              className="w-full px-3 py-2 text-[12px] bg-muted/40 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/50 resize-none leading-relaxed"
              style={MONO}
            />
          </div>
        )}

        {/* ── Resume-quality warnings ── */}
        {(gaps.generic_project_names.length > 0 || gaps.tutorial_projects.length > 0 || gaps.missing_work_experience) && (
          <div className="space-y-2">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium" style={MONO}>
              Resume-quality warnings
            </p>
            {gaps.generic_project_names.map(name => (
              <div key={name} className="flex items-start gap-2 text-[11px] text-amber-400/80">
                <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                <span>Generic project name: <span className="font-medium text-amber-300">"{name}"</span> — screeners deduct −1 pt per generic name.</span>
              </div>
            ))}
            {gaps.tutorial_projects.map(name => (
              <div key={name} className="flex items-start gap-2 text-[11px] text-amber-400/80">
                <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                <span>Tutorial-tier project: <span className="font-medium text-amber-300">"{name}"</span> — describe real-world impact instead.</span>
              </div>
            ))}
            {gaps.missing_work_experience && (
              <div className="flex items-start gap-2 text-[11px] text-amber-400/80">
                <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                <span>No work experience detected — production experience is worth up to 25 pts with AI screeners.</span>
              </div>
            )}
          </div>
        )}

        {/* ── Error ── */}
        {saveError && <p className="text-[11px] text-rose-400">{saveError}</p>}

        {/* ── Generate ── */}
        <div className="pb-6">
          <button
            onClick={handleGenerate}
            disabled={generating || saveLinks.isPending}
            className="w-full flex items-center justify-center gap-2 h-10 bg-foreground text-background text-[13px] font-medium rounded-md hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
          >
            {generating || saveLinks.isPending ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-background/25 border-t-background rounded-full animate-spin" />
                {saveLinks.isPending ? 'Saving…' : 'Tailoring your resume…'}
              </>
            ) : (
              <>
                <Sparkles size={13} />
                Generate Tailored Resume
                {(confirmedCount + typedCount) > 0 && ` (+${confirmedCount + typedCount} fact${confirmedCount + typedCount !== 1 ? 's' : ''})`}
              </>
            )}
          </button>
          <p className="text-[10px] text-muted-foreground text-center mt-2" style={MONO}>
            Keywords you don't cover stay as honest gaps — nothing is fabricated.
          </p>
        </div>
      </div>
    </div>
  )
}
