export const setToken = (token: string) => localStorage.setItem('token', token)
export const getToken = () => localStorage.getItem('token')
export const clearToken = () => localStorage.removeItem('token')

// Drops the token and returns to the login screen. Hard nav (not router
// navigate) so all in-memory state and the React Query cache are discarded —
// no stale user data survives the switch. Mirrors the 401 path in api/client.ts.
export const logout = () => {
  clearToken()
  window.location.href = '/login'
}

export interface AuthUser {
  id: number
  name: string
  email: string
}

export const getUser = (): AuthUser | null => {
  const token = getToken()
  if (!token) return null
  try {
    return JSON.parse(atob(token.split('.')[1])).user as AuthUser
  } catch {
    return null
  }
}

// Decodes the JWT and checks the exp claim against the current time.
// Clears the token if it's expired or malformed so stale tokens don't linger.
export const isTokenValid = (): boolean => {
  const token = getToken()
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (!payload.exp) return false
    const valid = payload.exp * 1000 > Date.now()
    if (!valid) clearToken()
    return valid
  } catch {
    clearToken()
    return false
  }
}
