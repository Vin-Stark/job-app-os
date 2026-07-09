import { useMutation } from '@tanstack/react-query'
import { api } from '@/api/client'

// ── Deterministic keyword coverage (computed server-side in code, not by the LLM) ──
export interface KeywordMatch {
  term: string
  category: 'must_have' | 'preferred' | 'domain'
  matched_via: string
  found_in: string
}

export interface KeywordMiss {
  term: string
  category: 'must_have' | 'preferred' | 'domain'
}

export interface Coverage {
  score: number
  matched_count: number
  total_count: number
  matched: KeywordMatch[]
  missing: KeywordMiss[]
}

// A missing keyword Claude found real evidence for in the resume itself,
// under different wording. The quote is verbatim-validated server-side.
export interface InferredEvidence {
  term: string
  category: 'must_have' | 'preferred'
  quote: string
}

export interface ProjectGap {
  name: string
  needs_github: boolean
  needs_demo: boolean
}

export interface ResumeGaps {
  missing_project_links: ProjectGap[]
  generic_project_names: string[]
  tutorial_projects: string[]
  missing_github_profile: boolean
  missing_linkedin: boolean
  missing_portfolio: boolean
  missing_work_experience: boolean
  has_open_source_opportunity: boolean
}

// Code-computed interview-chances band for the match score — the text comes
// from the backend (utils/matchBands.js) so web app and extension always agree.
export interface Recommendation {
  band: string
  interview_chances: string
  advice: string
}

export interface AnalyzeResult {
  job_id: number
  job: {
    company_name: string
    job_title: string
    location: string
    salary: string
    experience_needed: string
    preferred_qualifications: string[]
    must_have_qualifications: string[]
  }
  match: {
    match_score: number
    matching_skills: string[]
    missing_skills: string[]
    gaps: string[]
  }
  recommendation: Recommendation
  coverage: Coverage
  inferred: InferredEvidence[]
  skills_breakdown: SkillsBreakdown
  resume_gaps: ResumeGaps
}

// Skill gaps split by what they mean for the application (evidence-verified
// server-side, never fed into the ATS score): must-have gaps surface with the
// eligibility checks; proof-based skills are already evidenced in the resume;
// trainable ones have a same-kind tool the candidate knows.
export interface SkillsBreakdown {
  must_have_missing: string[]
  proof_based: { term: string; category: string; quote: string }[]
  trainable: { term: string; category: string; similar_skill: string }[]
  not_covered: string[]
}

export interface AnalyzePayload {
  resume_id: number
  raw_text: string
  job_title: string
  company_name: string
}

export type AnalyzeResponse =
  | { success: true; eligible: true; data: AnalyzeResult }
  | { success: false; eligible: false; message: string }

export function useAnalyzeJob() {
  return useMutation({
    mutationFn: (payload: AnalyzePayload) =>
      api.post<AnalyzeResponse>('/api/generate/analyze', payload),
  })
}
