import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { ApplicationStatus } from '@/lib/statusConfig'

export interface Application {
  id: number
  status: ApplicationStatus
  applied_date: string
  job_url: string | null
  notes: string | null
  job_id: number
  resume_id: number | null
  created_at: string
  // joined from job_descriptions
  company_name: string | null
  job_title: string | null
  location: string | null
}

const QUERY_KEY = ['applications'] as const

export function useApplications() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Application[] }>('/api/application/')
      return res.data
    },
    staleTime: 30_000,
  })
}

export function useUpdateApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      status,
      notes,
      job_url,
    }: {
      id: number
      status?: ApplicationStatus
      notes?: string
      job_url?: string
    }) => api.patch(`/api/application/${id}`, { status, notes, job_url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useDeleteApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/application/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
