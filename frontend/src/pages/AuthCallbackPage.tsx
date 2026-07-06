import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setToken } from '@/lib/auth'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  useEffect(() => {
    // Token arrives in the URL fragment (#token=...) — fragments never hit
    // server logs or the Referer header, unlike query strings.
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('token')
    const fromQuery = new URLSearchParams(window.location.search).get('token') // legacy fallback
    const token = fromHash || fromQuery
    if (token) {
      setToken(token)
      // Scrub the token from the address bar / history before navigating
      window.history.replaceState(null, '', window.location.pathname)
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/login', { replace: true })
    }
  }, [navigate])
  return null
}
