import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

export interface Resume {
  id: number
  filename: string
  file_size: number | null
  created_at: string
}

export interface ResumeSummary {
  parsed: boolean
  name?: string
  summary?: string
  skills?: string[]
}

export function useResumes() {
  return useQuery({
    queryKey: ['resumes'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; resumes: Resume[] }>('/api/resumes/list')
      return res.resumes
    },
    staleTime: 60_000,
  })
}

export function useResumeSummary(resumeId: number | null) {
  return useQuery<ResumeSummary>({
    queryKey: ['resume-summary', resumeId],
    queryFn: () =>
      api.get<ResumeSummary>(`/api/parse/summary/${resumeId}`),
    enabled: resumeId !== null,
    staleTime: Infinity,
  })
}
