// Fetch wrapper mirroring frontend/src/api/client.ts, but pulling the JWT from
// chrome.storage and surfacing typed, catchable errors. Every call is defensive:
// network failures, non-JSON bodies, and the backend's mixed error conventions
// (some routes return { error } on a 200) are all normalized to a thrown ApiError.

import { getToken, clearToken } from './auth'

export const API_BASE: string =
  typeof __API_BASE__ !== 'undefined' ? __API_BASE__ : 'http://localhost:5001'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?')
  }

  if (res.status === 401) {
    await clearToken()
    throw new ApiError(401, 'Your session expired. Reconnect your account.')
  }
  if (res.status === 429) {
    throw new ApiError(429, 'Rate limit reached. Wait a moment and try again.')
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`)
    throw new ApiError(res.status, 'Server returned an unreadable response.')
  }

  const body = data as { error?: string; message?: string }
  if (!res.ok || body?.error) {
    throw new ApiError(res.status, body?.error || `Request failed (${res.status})`)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, bodyObj: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(bodyObj) }),
}
