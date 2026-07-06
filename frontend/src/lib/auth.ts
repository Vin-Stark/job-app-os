export const setToken = (token: string) => localStorage.setItem('token', token)
export const getToken = () => localStorage.getItem('token')
export const clearToken = () => localStorage.removeItem('token')

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
