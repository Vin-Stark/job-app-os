import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'

export interface ProjectLink {
  project_name: string
  github_url: string | null
  live_url: string | null
}

export interface SocialLinks {
  github_url: string | null
  linkedin_url: string | null
  portfolio_url: string | null
  open_source_notes?: string | null
}

export interface LinksResponse {
  success: boolean
  social: SocialLinks
  projects: ProjectLink[]
}

export interface LinksPayload {
  social: SocialLinks
  projects: ProjectLink[]
  open_source_notes?: string | null
}

export function useResumeLinks(resumeId: number | null) {
  return useQuery({
    queryKey: ['resume-links', resumeId],
    queryFn: () => api.get<LinksResponse>(`/api/links/${resumeId}`),
    enabled: resumeId !== null,
    staleTime: 60_000,
  })
}

export function useSaveLinks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ resumeId, payload }: { resumeId: number; payload: LinksPayload }) =>
      api.put<{ success: boolean }>(`/api/links/${resumeId}`, payload),
    onSuccess: (_, { resumeId }) => {
      qc.invalidateQueries({ queryKey: ['resume-links', resumeId] })
    },
  })
}
