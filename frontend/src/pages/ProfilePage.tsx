import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Upload, X, CheckCircle2, Trash2, Circle } from 'lucide-react'
import { api } from '@/api/client'
import { getUser } from '@/lib/auth'
import { useResumes, useResumeSummary } from '@/hooks/useResumes'

interface UserProfile {
  id: number
  name: string
  email: string
  work_authorization_status: string
}

const WORK_AUTH_OPTIONS = [
  { value: 'permanent', label: 'Permanent Resident / Citizen' },
  { value: 'opt_cpt', label: 'OPT / CPT' },
  { value: 'needs_h1b', label: 'Needs H-1B Sponsorship' },
]

const WORK_AUTH_HINTS: Record<string, string> = {
  permanent: 'No sponsorship required. Eligible to work anywhere in the US.',
  opt_cpt: 'Currently authorized via OPT/CPT. May require future sponsorship.',
  needs_h1b: 'Will need employer H-1B sponsorship to work in the US.',
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

function formatBytes(bytes: number | null) {
  if (!bytes) return 'PDF'
  return `${Math.round(bytes / 1024)} KB · PDF`
}

export function ProfilePage() {
  const qc = useQueryClient()
  const jwtUser = getUser()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [workAuth, setWorkAuth] = useState('')
  const [workAuthSaved, setWorkAuthSaved] = useState(false)
  const [workAuthDirty, setWorkAuthDirty] = useState(false)

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await api.get<{ user: UserProfile }>('/api/auth/me')
      return res.user
    },
  })

  useEffect(() => {
    if (profile && !workAuthDirty) {
      setWorkAuth(profile.work_authorization_status || '')
    }
  }, [profile, workAuthDirty])

  const { data: resumes, isLoading: resumesLoading } = useResumes()

  // Auto-pick latest resume for AI analysis (same logic as GeneratePage)
  const latestResumeId = resumes && resumes.length > 0
    ? resumes.reduce((a, b) => (a.id > b.id ? a : b)).id
    : null

  const { data: summary } = useResumeSummary(latestResumeId)

  const uploadResume = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('resume', file)
      return api.postForm<{ success: boolean; resumeId: number }>('/api/resumes/upload', form)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resumes'] }),
  })

  const deleteResume = useMutation({
    mutationFn: (id: number) =>
      api.delete<{ success: boolean }>(`/api/resumes/delete/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resumes'] }),
  })

  const saveWorkAuth = useMutation({
    mutationFn: (status: string) =>
      api.patch<{ success: boolean }>('/api/auth/work-auth', { work_authorization_status: status }),
    onSuccess: () => {
      setWorkAuthSaved(true)
      setWorkAuthDirty(false)
      qc.invalidateQueries({ queryKey: ['profile'] })
      setTimeout(() => setWorkAuthSaved(false), 2500)
    },
  })

  const handleFile = (file: File) => {
    if (file.type !== 'application/pdf') return
    uploadResume.mutate(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const displayName = profile?.name ?? jwtUser?.name ?? '—'
  const displayEmail = profile?.email ?? jwtUser?.email ?? ''

  // Completeness states
  const hasResume = !resumesLoading && !!resumes && resumes.length > 0
  const isAnalyzed = summary?.parsed === true
  const hasWorkAuth = !!(profile?.work_authorization_status)

  const steps = [
    { label: 'Resume uploaded', done: hasResume },
    { label: 'Resume analyzed', done: isAnalyzed },
    { label: 'Work auth set', done: hasWorkAuth },
  ]
  const completedCount = steps.filter(s => s.done).length

  return (
    <div className="p-6 max-w-[600px]">
      <div className="space-y-5">

        {/* Completeness strip */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium"
              style={{ fontFamily: 'var(--font-mono)' }}>
              Profile Setup
            </p>
            <span className="text-[10px] text-muted-foreground" style={{ fontFamily: 'var(--font-mono)' }}>
              {completedCount}/{steps.length}
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1 bg-muted rounded-full mb-3 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {steps.map(step => (
              <div key={step.label} className="flex items-center gap-1.5">
                {step.done
                  ? <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
                  : <Circle size={12} className="text-muted-foreground/40 flex-shrink-0" />
                }
                <span className={`text-[11px] ${step.done ? 'text-foreground' : 'text-muted-foreground/60'}`}
                  style={{ fontFamily: 'var(--font-mono)' }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* User info */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium"
              style={{ fontFamily: 'var(--font-mono)' }}>
              Account
            </p>
          </div>
          <div className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-muted border border-border flex items-center justify-center text-[14px] font-semibold text-foreground flex-shrink-0">
              {displayName !== '—' ? initials(displayName) : '?'}
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-foreground truncate">{displayName}</p>
              <p className="text-[12px] text-muted-foreground truncate">{displayEmail}</p>
            </div>
          </div>
        </div>

        {/* Resume upload */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium"
              style={{ fontFamily: 'var(--font-mono)' }}>
              Resume
            </p>
            {uploadResume.isPending && (
              <span className="text-[10px] text-muted-foreground" style={{ fontFamily: 'var(--font-mono)' }}>
                Uploading…
              </span>
            )}
          </div>
          <div className="p-5 space-y-3">
            {/* Uploaded resumes list */}
            {!resumesLoading && resumes && resumes.length > 0 && (
              <div className="space-y-2">
                {resumes.map(r => (
                  <div key={r.id}
                    className="flex items-center gap-3 px-4 py-3 bg-muted/40 border border-border rounded-md">
                    <FileText size={14} className="text-muted-foreground flex-shrink-0" strokeWidth={1.5} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">{r.filename}</p>
                      <p className="text-[10px] text-muted-foreground" style={{ fontFamily: 'var(--font-mono)' }}>
                        {formatBytes(r.file_size)} · {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteResume.mutate(r.id)}
                      disabled={deleteResume.isPending}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-rose-950/60 text-muted-foreground hover:text-rose-400 transition-colors flex-shrink-0 disabled:opacity-40"
                      title="Delete resume"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Dropzone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-3 px-6 py-8 border-2 border-dashed rounded-md cursor-pointer transition-colors ${
                dragging
                  ? 'border-foreground/40 bg-muted/60'
                  : uploadResume.isPending
                  ? 'border-border bg-muted/20 cursor-not-allowed opacity-50'
                  : 'border-border hover:border-foreground/25 hover:bg-muted/30'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <Upload size={14} className="text-muted-foreground" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="text-[13px] font-medium text-foreground mb-0.5">
                  {dragging ? 'Drop to upload' : 'Drag & drop your resume'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  or <span className="text-foreground underline underline-offset-2">browse files</span> · PDF only
                </p>
              </div>
            </div>
            {uploadResume.isError && (
              <p className="text-[11px] text-rose-400 flex items-center gap-1.5">
                <X size={11} />
                {uploadResume.error instanceof Error ? uploadResume.error.message : 'Upload failed'}
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploadResume.isPending}
            />
          </div>
        </div>

        {/* AI Analysis card — only shown once a resume exists */}
        {latestResumeId && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium"
                style={{ fontFamily: 'var(--font-mono)' }}>
                AI Analysis
              </p>
              {summary?.parsed && (
                <span className="flex items-center gap-1 text-[9px] text-emerald-400"
                  style={{ fontFamily: 'var(--font-mono)' }}>
                  <CheckCircle2 size={10} />
                  Analyzed
                </span>
              )}
            </div>
            <div className="p-5">
              {summary?.parsed ? (
                <div className="space-y-3">
                  {summary.name && (
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground mb-1"
                        style={{ fontFamily: 'var(--font-mono)' }}>
                        Detected name
                      </p>
                      <p className="text-[13px] font-medium text-foreground">{summary.name}</p>
                    </div>
                  )}
                  {summary.summary && (
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground mb-1"
                        style={{ fontFamily: 'var(--font-mono)' }}>
                        Summary
                      </p>
                      <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-3">
                        {summary.summary}
                      </p>
                    </div>
                  )}
                  {summary.skills && summary.skills.length > 0 && (
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground mb-2"
                        style={{ fontFamily: 'var(--font-mono)' }}>
                        Skills ({summary.skills.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {summary.skills.slice(0, 20).map(skill => (
                          <span key={skill}
                            className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded"
                            style={{ fontFamily: 'var(--font-mono)' }}>
                            {skill}
                          </span>
                        ))}
                        {summary.skills.length > 20 && (
                          <span className="text-[10px] text-muted-foreground/50"
                            style={{ fontFamily: 'var(--font-mono)' }}>
                            +{summary.skills.length - 20} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  Not yet analyzed — AI will extract your skills and experience automatically when you first generate documents.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Work authorization */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium"
              style={{ fontFamily: 'var(--font-mono)' }}>
              Work Authorization
            </p>
          </div>
          <div className="p-5">
            <select
              value={workAuth}
              onChange={e => { setWorkAuth(e.target.value); setWorkAuthDirty(true); setWorkAuthSaved(false) }}
              className="w-full px-3 h-9 text-[13px] bg-muted/40 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring text-foreground appearance-none cursor-pointer"
              style={{
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
              }}
            >
              <option value="" disabled>Select status…</option>
              {WORK_AUTH_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {workAuth && (
              <p className="text-[11px] text-muted-foreground mt-2" style={{ fontFamily: 'var(--font-mono)' }}>
                {WORK_AUTH_HINTS[workAuth]}
              </p>
            )}
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => saveWorkAuth.mutate(workAuth)}
                disabled={!workAuth || !workAuthDirty || saveWorkAuth.isPending}
                className="flex items-center gap-2 px-5 h-9 bg-foreground text-background text-[13px] font-medium rounded-md hover:opacity-85 disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
              >
                {saveWorkAuth.isPending ? 'Saving…' : 'Save'}
              </button>
              {workAuthSaved && (
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 size={13} />
                  <span className="text-[12px]">Saved</span>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
