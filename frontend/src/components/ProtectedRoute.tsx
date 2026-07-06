import { Navigate } from 'react-router-dom'
import { isTokenValid } from '@/lib/auth'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isTokenValid()) return <Navigate to="/login" replace />
  return <>{children}</>
}
