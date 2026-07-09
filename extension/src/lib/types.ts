// Shared types between popup, content scripts, and background.

export interface ScrapedJob {
  job_title: string
  company_name: string
  raw_text: string
  source: 'json-ld' | 'ats' | 'readability' | 'selection' | 'manual' | 'ai-extract'
  // Hostname of the scraped page — used to decide when AI cleanup should run
  page_host?: string
  // Which anchors produced each field — shown in the popup so failed scrapes
  // can be diagnosed without access to the page's DOM.
  debug?: string
}

export interface JdMeta {
  location: string
  salary: string
  experience_needed: string
  preferred_qualifications: string[]
  must_have_qualifications: string[]
}

export interface ExtractJobResponse {
  success: true
  data: {
    job_title: string
    company_name: string
    raw_text: string
    jd_meta: JdMeta
  }
}

export interface PrecheckResponse {
  success: true
  eligible: boolean
  checks: EligibilityCheck[]
  stats: {
    jd_years: number
    candidate_years: number
    tech_found: number
    tech_matched: number
  }
}

export interface Resume {
  id: number
  filename: string
  file_size: number
  created_at: string
}

export interface EligibilityCheck {
  name: string
  requirement: string
  candidate: string
  verdict: 'pass' | 'fail'
  reason: string
}

export interface Coverage {
  score: number
  matched_count: number
  total_count: number
  matched: { term: string; category: string; matched_via: string; found_in: string }[]
  missing: { term: string; category: string }[]
}

export interface AnalyzeIneligible {
  success: true
  eligible: false
  checks?: EligibilityCheck[]
  message: string
}

// Code-computed interview-chances band for a match_score — text comes from the
// backend (utils/matchBands.js) so extension and web app always say the same thing.
export interface Recommendation {
  band: string
  interview_chances: string
  advice: string
}

// Skill gaps split by what they mean for the application, computed server-side
// (evidence-verified — never fed into the ATS score):
//   must_have_missing — hard JD skills absent from the resume (shown with the
//     eligibility checks)
//   proof_based — JD skills the resume evidences under different wording;
//     apply with confidence
//   trainable — JD tools where the resume names a similar tool of the same kind
//   not_covered — honest gaps: none of the above
export interface SkillsBreakdown {
  must_have_missing: string[]
  proof_based: { term: string; category: string; quote: string }[]
  trainable: { term: string; category: string; similar_skill: string }[]
  not_covered: string[]
}

export interface AnalyzeEligible {
  success: true
  eligible: true
  data: {
    job_id: number
    job: { company_name: string; job_title: string; location: string }
    match: { match_score: number; missing_skills: string[] }
    recommendation: Recommendation
    coverage: Coverage
    skills_breakdown: SkillsBreakdown
    checks: EligibilityCheck[]
  }
}

export type AnalyzeResponse = AnalyzeEligible | AnalyzeIneligible

export interface FinalizeResponse {
  success: true
  data: {
    application_id: number
    tailored_resume: string
    cover_letter: string | null
    cover_letter_generated: boolean
    coverage: Coverage & { target_met: boolean }
  }
}

// Row from GET /api/applications (job_applications joined to job_descriptions)
export interface TrackerApplication {
  id: number
  status: string
  applied_date: string | null
  job_url: string | null
  job_id: number | null
  company_name: string | null
  job_title: string | null
}

// Messages exchanged over chrome.runtime
export type RuntimeMessage =
  | { type: 'SET_TOKEN'; token: string }
  | { type: 'SCRAPE_ACTIVE_TAB' }
  | { type: 'ENABLE_DRAG'; filename: string; dataUrl: string }
