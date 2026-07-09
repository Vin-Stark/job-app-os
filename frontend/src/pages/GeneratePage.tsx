import { useState, useEffect, useRef } from 'react'
import { Sparkles, FileText, AlertTriangle, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react'
import { useResumes } from '@/hooks/useResumes'
import { useAnalyzeJob, type AnalyzeResult } from '@/hooks/useAnalyzeJob'
import { useFinalizeDocs, type FinalizeResult, type SupplementInput } from '@/hooks/useFinalizeDocs'
import { ResumeEditor, ResumeEditorHandle } from '@/components/ResumeEditor'
import { FitReport } from '@/components/FitReport'

const MONO = { fontFamily: 'var(--font-mono)' } as const

function slug(company: string, role: string) {
  return `${role.toLowerCase().replace(/\s+/g, '_')}_${company.toLowerCase().replace(/\s+/g, '_')}`
}

function coverageColor(score: number) {
  if (score >= 70) return 'text-emerald-300'
  if (score >= 50) return 'text-amber-300'
  return 'text-rose-300'
}

export function GeneratePage({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [resumeId, setResumeId] = useState<number | null>(null)
  const [company, setCompany] = useState(() => localStorage.getItem('gen_company') ?? '')
  const [role, setRole] = useState(() => localStorage.getItem('gen_role') ?? '')
  const [jdText, setJdText] = useState(() => localStorage.getItem('gen_jd') ?? '')
  const [genTab, setGenTab] = useState<'resume' | 'cover'>('resume')
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false)

  // Flow state: analysis first, docs only after the user reviews gaps
  const [step, setStep] = useState<'idle' | 'report' | 'docs'>('idle')
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null)
  const [docs, setDocs] = useState<FinalizeResult | null>(null)
  const [ineligibleMsg, setIneligibleMsg] = useState<string | null>(null)

  const resumeEditorRef = useRef<ResumeEditorHandle>(null)
  const coverEditorRef = useRef<ResumeEditorHandle>(null)

  useEffect(() => { localStorage.setItem('gen_company', company) }, [company])
  useEffect(() => { localStorage.setItem('gen_role', role) }, [role])
  useEffect(() => { localStorage.setItem('gen_jd', jdText) }, [jdText])

  const { data: resumes, isLoading: resumesLoading } = useResumes()
  const analyze = useAnalyzeJob()
  const finalize = useFinalizeDocs()

  // Auto-select most recently uploaded resume
  useEffect(() => {
    if (resumes && resumes.length > 0 && resumeId === null) {
      const latest = resumes.reduce((a, b) => (a.id > b.id ? a : b))
      setResumeId(latest.id)
    }
  }, [resumes, resumeId])

  const hasResumes = !resumesLoading && resumes && resumes.length > 0
  const canAnalyze = hasResumes && resumeId !== null && company.trim() && role.trim() && jdText.trim()

  const handleAnalyze = () => {
    if (!canAnalyze || !resumeId) return
    setIneligibleMsg(null)
    setDocs(null)
    analyze.mutate(
      {
        resume_id: resumeId,
        raw_text: jdText,
        job_title: role,
        company_name: company,
      },
      {
        onSuccess: resp => {
          if (resp.eligible) {
            setAnalysis(resp.data)
            setStep('report')
          } else {
            setAnalysis(null)
            setIneligibleMsg(resp.message)
            setStep('idle')
          }
        },
      }
    )
  }

  const handleGenerate = (supplements: SupplementInput[]) => {
    if (!resumeId || !analysis) return
    finalize.mutate(
      {
        resume_id: resumeId,
        job_id: analysis.job_id,
        generate_cover_letter: includeCoverLetter,
        supplements,
      },
      {
        onSuccess: resp => {
          setDocs(resp.data)
          // Refresh the report's baseline with the recomputed coverage so
          // "Refine" shows up-to-date numbers including new supplements
          setAnalysis(prev =>
            prev
              ? { ...prev, coverage: resp.data.baseline_coverage, resume_gaps: resp.data.resume_gaps }
              : prev
          )
          setStep('docs')
          setGenTab('resume')
        },
      }
    )
  }

  const handleReset = () => {
    analyze.reset()
    finalize.reset()
    setAnalysis(null)
    setDocs(null)
    setIneligibleMsg(null)
    setStep('idle')
    setCompany('')
    setRole('')
    setJdText('')
    setGenTab('resume')
    setIncludeCoverLetter(false)
    localStorage.removeItem('gen_company')
    localStorage.removeItem('gen_role')
    localStorage.removeItem('gen_jd')
  }

  const activeError = analyze.isError ? analyze.error : finalize.isError ? finalize.error : null

  return (
    <div className="h-full flex flex-col">
      {/* No-resume banner */}
      {!resumesLoading && !hasResumes && (
        <div className="flex items-center gap-3 px-5 py-3 bg-amber-950/60 border-b border-amber-800/50 flex-shrink-0">
          <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
          <p className="text-[12px] text-amber-300 flex-1">
            Upload your resume in Profile before generating documents.
          </p>
          <button
            onClick={() => onNavigate('profile')}
            className="text-[11px] font-medium text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors whitespace-nowrap"
          >
            Go to Profile →
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ── Left: input panel ── */}
        <div className="w-[400px] flex-shrink-0 border-r border-border flex flex-col bg-card">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-1" style={MONO}>
              New Application
            </p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Paste the JD to see your real match score and gaps first — then generate documents.
            </p>
          </div>

          <div className="px-4 pt-4 space-y-3">
            {/* Company */}
            <div>
              <label className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-1.5" style={MONO}>
                Company
              </label>
              <input
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="e.g. Stripe"
                className="w-full px-3 h-9 text-[13px] bg-muted/40 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/50"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-1.5" style={MONO}>
                Role
              </label>
              <input
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="e.g. Senior Frontend Engineer"
                className="w-full px-3 h-9 text-[13px] bg-muted/40 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/50"
              />
            </div>

            {/* JD label */}
            <div>
              <label className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-1.5" style={MONO}>
                Job Description
              </label>
            </div>
          </div>

          {/* JD textarea */}
          <div className="flex-1 px-4 pb-4 min-h-0">
            <textarea
              value={jdText}
              onChange={e => setJdText(e.target.value)}
              placeholder={"We're looking for an engineer to join our growth team...\n\nRequirements:\n• 5+ years of React experience\n• Strong TypeScript skills\n• Experience with design systems"}
              className="w-full h-full resize-none text-[12px] bg-muted/40 border border-border rounded-md p-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring leading-relaxed"
              style={MONO}
            />
          </div>

          {/* Generate mode toggle */}
          <div className="px-4 pb-3">
            <label className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-1.5" style={MONO}>
              Generate
            </label>
            <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-md">
              {([
                { value: false, label: 'Resume only' },
                { value: true, label: 'Resume + Cover Letter' },
              ] as const).map(opt => (
                <button
                  key={String(opt.value)}
                  onClick={() => setIncludeCoverLetter(opt.value)}
                  className={`flex-1 h-7 text-[11px] rounded transition-colors whitespace-nowrap ${
                    includeCoverLetter === opt.value
                      ? 'bg-card text-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  style={MONO}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-border space-y-2">
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze || analyze.isPending || finalize.isPending}
              className="w-full flex items-center justify-center gap-2 h-9 bg-foreground text-background text-[13px] font-medium rounded-md hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
            >
              {analyze.isPending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-background/25 border-t-background rounded-full animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  {analysis ? 'Re-analyze Fit' : 'Analyze Fit'}
                </>
              )}
            </button>
            {(analysis || ineligibleMsg || activeError) && (
              <button
                onClick={handleReset}
                className="w-full h-8 text-[11px] text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors hover:bg-muted"
              >
                Start over
              </button>
            )}
            {!analysis && !analyze.isPending && !ineligibleMsg && (
              <p className="text-[10px] text-muted-foreground text-center" style={MONO}>
                Honest scores first · documents second
              </p>
            )}
          </div>
        </div>

        {/* ── Right: output panel ── */}
        <div className="flex-1 min-w-0 flex flex-col bg-background overflow-hidden">

          {/* Idle */}
          {step === 'idle' && !analyze.isPending && !ineligibleMsg && !activeError && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-10">
              <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center mb-4">
                <FileText size={18} className="text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="text-[14px] font-semibold text-foreground mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                No analysis yet
              </p>
              <p className="text-[12px] text-muted-foreground max-w-xs leading-relaxed">
                Paste a job description on the left and click Analyze Fit. You'll see your real keyword coverage and what's missing before anything is generated.
              </p>
            </div>
          )}

          {/* Analyzing */}
          {analyze.isPending && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-10">
              <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center mb-4">
                <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
              </div>
              <p className="text-[14px] font-semibold text-foreground mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Analyzing your fit…
              </p>
              <p className="text-[12px] text-muted-foreground">
                Parsing JD · extracting keywords · scoring your resume
              </p>
            </div>
          )}

          {/* Error */}
          {!analyze.isPending && !finalize.isPending && activeError && step !== 'report' && step !== 'docs' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-10">
              <div className="w-12 h-12 rounded-xl bg-rose-950/60 border border-rose-800/60 flex items-center justify-center mb-4">
                <XCircle size={18} className="text-rose-400" strokeWidth={1.5} />
              </div>
              <p className="text-[14px] font-semibold text-foreground mb-2">Something went wrong</p>
              <p className="text-[12px] text-rose-400 max-w-xs">
                {activeError instanceof Error ? activeError.message : 'Please try again.'}
              </p>
            </div>
          )}

          {/* Ineligible */}
          {ineligibleMsg && !analyze.isPending && (
            <div className="flex-1 flex flex-col items-center justify-center px-10">
              <div className="max-w-md w-full bg-amber-950/60 border border-amber-800/50 rounded-lg p-6 text-center">
                <div className="w-10 h-10 rounded-lg bg-amber-900/60 border border-amber-700/60 flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle size={16} className="text-amber-400" />
                </div>
                <p className="text-[13px] font-semibold text-amber-300 mb-2">Visa Eligibility Issue</p>
                <p className="text-[12px] text-amber-400/80 leading-relaxed mb-4">{ineligibleMsg}</p>
                <button
                  onClick={handleReset}
                  className="text-[11px] font-medium text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
                >
                  Try a different role
                </button>
              </div>
            </div>
          )}

          {/* Fit report — review gaps, add evidence, then generate */}
          {step === 'report' && analysis && !analyze.isPending && resumeId !== null && (
            <div className="flex flex-col h-full">
              {finalize.isError && (
                <div className="px-5 py-2 bg-rose-950/60 border-b border-rose-800/50 flex-shrink-0">
                  <p className="text-[11px] text-rose-400">
                    {finalize.error instanceof Error ? finalize.error.message : 'Generation failed. Try again.'}
                  </p>
                </div>
              )}
              <FitReport
                analysis={analysis}
                resumeId={resumeId}
                generating={finalize.isPending}
                onGenerate={handleGenerate}
              />
            </div>
          )}

          {/* Docs — generated documents + honest final score */}
          {step === 'docs' && docs && analysis && (
            <div className="flex flex-col h-full">
              {/* Score + metadata bar */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card flex-shrink-0 flex-wrap gap-y-2">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                  docs.coverage.target_met
                    ? 'bg-emerald-950/60 border-emerald-800/60'
                    : 'bg-amber-950/60 border-amber-800/60'
                }`}>
                  <span className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground font-medium" style={MONO}>
                    Keyword Coverage
                  </span>
                  <span className={`text-[13px] font-bold ${coverageColor(docs.coverage.score)}`}
                    style={{ fontFamily: 'var(--font-stat)' }}>
                    {docs.coverage.score}%
                  </span>
                  <span className="text-[10px] text-muted-foreground" style={MONO}>
                    ({docs.coverage.matched_count}/{docs.coverage.total_count})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-950/60 border border-blue-800/60">
                  <span className="text-[9px] uppercase tracking-[0.1em] text-blue-400/70 font-medium" style={MONO}>Job Match</span>
                  <span className="text-[13px] font-bold text-blue-300" style={{ fontFamily: 'var(--font-stat)' }}>
                    {analysis.match.match_score}%
                  </span>
                </div>
                {!docs.coverage.target_met && (
                  <span className="text-[10px] text-amber-400/80" style={MONO}>
                    below 70% target — add more evidence via Refine
                  </span>
                )}
                <div className="flex items-center gap-3 ml-auto">
                  <button
                    onClick={() => setStep('report')}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft size={11} />
                    Refine
                  </button>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 size={12} />
                    <span className="text-[11px]">Saved to tracker</span>
                  </div>
                </div>
              </div>

              {/* Remaining honest gaps */}
              {docs.coverage.missing.length > 0 && (
                <div className="px-5 py-3 border-b border-border flex-shrink-0">
                  <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium mr-3" style={MONO}>
                    Still missing
                  </span>
                  <span className="inline-flex flex-wrap gap-1.5">
                    {docs.coverage.missing.slice(0, 8).map(m => (
                      <span key={m.term}
                        className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded"
                        style={MONO}>
                        {m.term}
                      </span>
                    ))}
                    {docs.coverage.missing.length > 8 && (
                      <span className="text-[9px] text-muted-foreground/60" style={MONO}>
                        +{docs.coverage.missing.length - 8} more
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Tab switcher */}
              {docs.cover_letter_generated && (
                <div className="flex items-center h-10 px-5 border-b border-border bg-card flex-shrink-0">
                  <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-md">
                    <button
                      onClick={() => setGenTab('resume')}
                      className={`px-4 h-7 text-[11px] rounded transition-colors whitespace-nowrap ${
                        genTab === 'resume'
                          ? 'bg-card text-foreground font-medium shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      style={MONO}
                    >
                      Resume
                    </button>
                    <button
                      onClick={() => setGenTab('cover')}
                      className={`px-4 h-7 text-[11px] rounded transition-colors whitespace-nowrap ${
                        genTab === 'cover'
                          ? 'bg-card text-foreground font-medium shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      style={MONO}
                    >
                      Cover Letter
                    </button>
                  </div>
                </div>
              )}

              {/* Editors — both mounted, CSS-hidden when inactive to preserve edits */}
              <div className={`flex-1 min-h-0 flex flex-col ${genTab === 'resume' ? '' : 'hidden'}`}>
                <ResumeEditor
                  ref={resumeEditorRef}
                  initialContent={docs.tailored_resume ?? ''}
                  filename={`resume_${slug(analysis.job.company_name, analysis.job.job_title)}.pdf`}
                />
              </div>
              {docs.cover_letter_generated && (
                <div className={`flex-1 min-h-0 flex flex-col ${genTab === 'cover' ? '' : 'hidden'}`}>
                  <ResumeEditor
                    ref={coverEditorRef}
                    initialContent={docs.cover_letter ?? ''}
                    filename={`cover_letter_${slug(analysis.job.company_name, analysis.job.job_title)}.pdf`}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
