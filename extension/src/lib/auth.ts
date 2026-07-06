// Token storage in chrome.storage.local + JWT expiry check.
// Ported from frontend/src/lib/auth.ts (isTokenValid), adapted to the async
// chrome.storage API.

const TOKEN_KEY = 'jobappos_token'

export async function getToken(): Promise<string | null> {
  const out = await chrome.storage.local.get(TOKEN_KEY)
  return (out[TOKEN_KEY] as string) ?? null
}

export async function setToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token })
}

export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY)
}

// Decode the JWT payload without verifying (verification is the server's job);
// we only need the exp claim to avoid sending known-dead tokens.
function decodePayload(token: string): { exp?: number; user?: { id: number; name: string; email: string } } | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

export async function isAuthed(): Promise<boolean> {
  const token = await getToken()
  if (!token) return false
  const payload = decodePayload(token)
  if (!payload?.exp) {
    // No exp claim we can read → treat as invalid and clear it
    await clearToken()
    return false
  }
  const valid = payload.exp * 1000 > Date.now()
  if (!valid) await clearToken()
  return valid
}

export async function getUser(): Promise<{ id: number; name: string; email: string } | null> {
  const token = await getToken()
  if (!token) return null
  return decodePayload(token)?.user ?? null
}
