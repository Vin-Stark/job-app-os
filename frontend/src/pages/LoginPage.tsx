import { useState, useRef, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Target, Eye, EyeOff } from 'lucide-react'
import { setToken } from '@/lib/auth'
import { api } from '@/api/client'

const API = import.meta.env.VITE_API_BASE_URL as string
type Tab = 'login' | 'register'

// ── Sliding glass pill tab switcher ──────────────────────────────────────────
function TabSwitcher({ tab, onSwitch }: { tab: Tab; onSwitch: (t: Tab) => void }) {
  const loginRef = useRef<HTMLButtonElement>(null)
  const registerRef = useRef<HTMLButtonElement>(null)
  const [pill, setPill] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const el = tab === 'login' ? loginRef.current : registerRef.current
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
  }, [tab])

  return (
    <div
      className="relative inline-flex items-center p-1 mb-7 rounded-full"
      style={{
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* sliding pill */}
      <span
        className="absolute top-1 bottom-1 rounded-full pointer-events-none"
        style={{
          left: pill.left,
          width: pill.width,
          background: '#C6FF34',
          transition: 'left 0.28s cubic-bezier(0.34,1.56,0.64,1), width 0.28s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      />
      <button
        ref={loginRef}
        onClick={() => onSwitch('login')}
        className="relative z-10 px-5 py-1.5 rounded-full text-[13px] font-medium transition-colors duration-200"
        style={{ color: tab === 'login' ? '#171717' : 'rgba(255,255,255,0.45)' }}
      >
        Log in
      </button>
      <button
        ref={registerRef}
        onClick={() => onSwitch('register')}
        className="relative z-10 px-5 py-1.5 rounded-full text-[13px] font-medium transition-colors duration-200"
        style={{ color: tab === 'register' ? '#171717' : 'rgba(255,255,255,0.45)' }}
      >
        Create account
      </button>
    </div>
  )
}

// ── Input field ───────────────────────────────────────────────────────────────
function Field({
  label, type, value, onChange, placeholder, children,
}: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  children?: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>{label}</label>
      <div className="relative">
        <input
          type={type}
          required
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full h-11 px-3.5 text-[13px] focus:outline-none transition-all rounded-xl placeholder:text-white/25"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: '#fff',
            paddingRight: children ? '2.75rem' : undefined,
          }}
          onFocus={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.13)'; e.currentTarget.style.borderColor = 'rgba(198,255,52,0.5)' }}
          onBlur={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)' }}
        />
        {children}
      </div>
    </div>
  )
}

// ── Google icon ───────────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" className="flex-shrink-0">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
)

// ── Main page ─────────────────────────────────────────────────────────────────
export function LoginPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const resetForm = () => { setName(''); setEmail(''); setPassword(''); setError(''); setSuccess('') }
  const switchTab = (t: Tab) => { setTab(t); resetForm() }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const data = await api.post<{ token: string }>('/api/auth/login', { email, password })
      setToken(data.token)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await api.post('/api/auth/register', { name, email, password })
      setSuccess('Account created! Please log in.')
      setTimeout(() => switchTab('login'), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    /* Full-bleed photo background */
    <div
      className="min-h-screen flex items-center justify-end relative"
      style={{
        backgroundImage: 'url(/bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Dark scrim so the card reads cleanly */}
      <div className="absolute inset-0 bg-black/50" />

      {/* ── Glassmorphism card ── */}
      <div
        className="relative z-10 w-full p-12 min-h-screen flex flex-col justify-center"
        style={{
          maxWidth: 520,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(40px) saturate(160%)',
          WebkitBackdropFilter: 'blur(40px) saturate(160%)',
          borderLeft: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '-8px 0 48px rgba(0,0,0,0.4)',
        }}
      >
        {/* Logo row */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: '#C6FF34' }}>
            <Target size={13} className="text-[#171717]" strokeWidth={2.5} />
          </div>
          <span className="text-[22px] font-bold tracking-tight lowercase" style={{ color: '#fff' }}>tailr</span>
        </div>

        <div className="flex justify-center">
          <TabSwitcher tab={tab} onSwitch={switchTab} />
        </div>

        {/* ── Login form ── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="name@example.com" />

            <Field label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={setPassword} placeholder="Enter your password">
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </Field>

            {error && <p className="text-[12px] text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-[14px] font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-1 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#C6FF34] focus-visible:ring-offset-black"
              style={{ background: '#C6FF34', color: '#171717' }}
            >
              {loading ? 'Logging in…' : 'Log in'}
            </button>

            <a
              href={`${API}/api/auth/google`}
              className="flex items-center justify-center gap-2.5 w-full h-12 rounded-xl text-[14px] font-medium transition-all hover:brightness-110"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              <GoogleIcon />
              Continue with Google
            </a>

            <p className="text-center text-[13px] pt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              New to Tailr?{' '}
              <button type="button" onClick={() => switchTab('register')} className="font-bold hover:underline" style={{ color: '#C6FF34' }}>
                Register now
              </button>
            </p>
          </form>
        )}

        {/* ── Register form ── */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <Field label="Full name" type="text" value={name} onChange={setName} placeholder="Your name" />
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="name@example.com" />

            <Field label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={setPassword} placeholder="Create a password">
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </Field>

            {error && <p className="text-[12px] text-rose-400">{error}</p>}
            {success && <p className="text-[12px] text-emerald-400">{success}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-[14px] font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-1 hover:brightness-110"
              style={{ background: '#C6FF34', color: '#171717' }}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>

            <p className="text-center text-[13px] pt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Already have an account?{' '}
              <button type="button" onClick={() => switchTab('login')} className="font-bold hover:underline" style={{ color: '#C6FF34' }}>
                Log in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
