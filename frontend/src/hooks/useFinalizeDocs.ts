import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Coverage, ResumeGaps } from './useAnalyzeJob'

export interface SupplementInput {
  keyword: string | null
  content: string
  kind?: string
}

export interface FinalizePayload {
  resume_id: number
  job_id: number
  generate_cover_letter: boolean
  supplements: SupplementInput[]
}

export interface FinalizeResult {
  application_id: number
  tailored_resume: string
  cover_letter: string | null
  cover_letter_generated: boolean
  coverage: Coverage & { target_met: boolean }
  baseline_coverage: Coverage
  resume_gaps: ResumeGaps
}

export type FinalizeResponse = { success: true; data: FinalizeResult }

export function useFinalizeDocs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: FinalizePayload) =>
      api.post<FinalizeResponse>('/api/generate/finalize', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  })
}
