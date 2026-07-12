import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Target, ArrowRight, FileSearch, BarChart2, FileText, Layers } from 'lucide-react'
import { isTokenValid } from '@/lib/auth'

// ── Scroll reveal hook ────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({
  index, icon: Icon, label, title, body, visible,
}: {
  index: number
  icon: React.ElementType
  label: string
  title: string
  body: string
  visible: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '32px',
        border: '1px solid',
        borderColor: hovered ? 'rgba(198,255,52,0.25)' : 'rgba(255,255,255,0.08)',
        borderRadius: 16,
        background: hovered ? 'rgba(198,255,52,0.03)' : 'rgba(255,255,255,0.02)',
        transition: 'border-color 0.2s ease, background 0.2s ease, transform 0.2s ease',
        transform: visible
          ? hovered ? 'translateY(-4px)' : 'translateY(0)'
          : 'translateY(24px)',
        opacity: visible ? 1 : 0,
        transitionDelay: `${index * 80}ms`,
        cursor: 'default',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: hovered ? 'rgba(198,255,52,0.12)' : 'rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, transition: 'background 0.2s ease',
      }}>
        <Icon size={18} color={hovered ? '#C6FF34' : 'rgba(255,255,255,0.5)'} strokeWidth={1.5} style={{ transition: 'color 0.2s ease' }} />
      </div>
      <p style={{
        fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)',
        fontFamily: 'var(--font-mono)', marginBottom: 10, textTransform: 'uppercase',
      }}>
        {label}
      </p>
      <h3 style={{ fontSize: 17, fontWeight: 600, color: '#fff', marginBottom: 10, letterSpacing: '-0.02em' }}>
        {title}
      </h3>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65 }}>
        {body}
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function LandingPage() {
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)
  const [score, setScore] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const glowRef = useRef<HTMLDivElement>(null)
  const featuresReveal = useReveal()
  const stepsReveal = useReveal()
  const ctaReveal = useReveal()

  const isLoggedIn = isTokenValid()

  // mount → trigger entrance
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80)
    return () => clearTimeout(t)
  }, [])

  // score counter
  useEffect(() => {
    if (!mounted) return
    let frame: number
    const target = 94
    const duration = 1600
    const start = performance.now()
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
    const delay = setTimeout(() => {
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1)
        setScore(Math.round(easeOut(t) * target))
        if (t < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }, 500)
    return () => { clearTimeout(delay); cancelAnimationFrame(frame) }
  }, [mounted])

  // scroll detection for nav border
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // cursor glow
  const handleMouseMove = (e: React.MouseEvent) => {
    const x = e.clientX / window.innerWidth
    const y = e.clientY / window.innerHeight
    mouseRef.current = { x, y }
    if (glowRef.current) {
      glowRef.current.style.left = `${x * 100}%`
      glowRef.current.style.top = `${y * 100}%`
    }
  }

  const WORDS = ['Apply', 'with']
  const ACCENT = 'precision.'

  const FEATURES = [
    {
      icon: FileSearch,
      label: 'Resume Match',
      title: 'Know your fit before you apply',
      body: 'Score your resume against any job description in seconds. See exactly which skills align and which gaps to address.',
    },
    {
      icon: BarChart2,
      label: 'ATS Scoring',
      title: 'Beat the algorithm',
      body: "Applicant tracking systems reject 75% of résumés before a human reads them. Know your score before you're screened out.",
    },
    {
      icon: FileText,
      label: 'Cover Letters',
      title: 'Tailored, not templated',
      body: 'Generated from your real experience — not fabricated. Every letter is grounded in what you actually built and shipped.',
    },
    {
      icon: Layers,
      label: 'Application Tracker',
      title: 'Every stage, one place',
      body: 'Track applications across an 8-stage pipeline from applied to offer. No more spreadsheets.',
    },
  ]

  const STEPS = [
    { n: '01', title: 'Upload your resume', body: 'PDF parsed and indexed against your real skills and experience.' },
    { n: '02', title: 'Paste a job description', body: 'Any JD from any source. Visa eligibility is checked before anything else.' },
    { n: '03', title: 'Get your documents', body: 'Tailored resume, ATS score, match breakdown, and a cover letter — instantly.' },
  ]

  return (
    <div
      onMouseMove={handleMouseMove}
      style={{ background: '#171717', minHeight: '100vh', color: '#fff', overflowX: 'hidden' }}
    >
      {/* Ambient cursor glow */}
      <div
        ref={glowRef}
        style={{
          position: 'fixed', pointerEvents: 'none', zIndex: 0,
          width: 700, height: 700, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(198,255,52,0.055) 0%, transparent 65%)',
          transform: 'translate(-50%, -50%)',
          left: '50%', top: '50%',
          transition: 'left 0.9s ease, top 0.9s ease',
        }}
      />

      {/* ── Nav ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 48px', height: 64,
        background: scrolled ? 'rgba(23,23,23,0.9)' : 'transparent',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        transition: 'background 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: '#C6FF34',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Target size={12} color="#171717" strokeWidth={2.5} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em' }}>tailr</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!isLoggedIn && (
            <button
              onClick={() => navigate('/login')}
              style={{
                background: 'transparent', color: 'rgba(255,255,255,0.55)',
                border: 'none', padding: '8px 16px', fontSize: 13, cursor: 'pointer',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.55)'}
            >
              Sign in
            </button>
          )}
          <button
            onClick={() => navigate(isLoggedIn ? '/dashboard' : '/login')}
            style={{
              background: '#C6FF34', color: '#171717', border: 'none',
              borderRadius: 999, padding: '9px 20px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'opacity 0.15s, transform 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            {isLoggedIn ? 'Go to dashboard' : 'Get started'}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        padding: '120px 48px 100px', position: 'relative',
        maxWidth: 1200, margin: '0 auto',
      }}>
        <div style={{ width: '100%' }}>

          {/* Eyebrow */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 100,
            border: '1px solid rgba(198,255,52,0.25)',
            background: 'rgba(198,255,52,0.05)',
            marginBottom: 44,
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(10px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: '#C6FF34',
              display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{
              fontSize: 11, color: '#C6FF34', fontFamily: 'var(--font-mono)',
              letterSpacing: '0.09em', textTransform: 'uppercase',
            }}>
              AI-powered · Job OS
            </span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 'clamp(64px, 9vw, 128px)', fontWeight: 700,
            lineHeight: 0.95, letterSpacing: '-0.035em', margin: '0 0 40px',
          }}>
            {WORDS.map((word, i) => (
              <span key={word} style={{ display: 'inline-block', overflow: 'hidden', marginRight: '0.28em' }}>
                <span style={{
                  display: 'inline-block',
                  transform: mounted ? 'translateY(0)' : 'translateY(105%)',
                  opacity: mounted ? 1 : 0,
                  transition: `transform 0.75s cubic-bezier(0.16,1,0.3,1) ${i * 70}ms, opacity 0.4s ease ${i * 70}ms`,
                }}>
                  {word}
                </span>
              </span>
            ))}
            <br />
            <span style={{ display: 'inline-block', overflow: 'hidden' }}>
              <span style={{
                display: 'inline-block', color: '#C6FF34',
                transform: mounted ? 'translateY(0)' : 'translateY(105%)',
                opacity: mounted ? 1 : 0,
                transition: 'transform 0.75s cubic-bezier(0.16,1,0.3,1) 140ms, opacity 0.4s ease 140ms',
              }}>
                {ACCENT}
              </span>
            </span>
          </h1>

          {/* Subtext + score card row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 64, flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 440 }}>
              <p style={{
                fontSize: 18, lineHeight: 1.65, color: 'rgba(255,255,255,0.48)',
                margin: '0 0 40px',
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(14px)',
                transition: 'opacity 0.6s ease 280ms, transform 0.6s ease 280ms',
              }}>
                Upload your resume. Paste a job description. Get a tailored resume, ATS score, and cover letter — in seconds.
              </p>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 16,
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(14px)',
                transition: 'opacity 0.6s ease 380ms, transform 0.6s ease 380ms',
              }}>
                <button
                  onClick={() => navigate(isLoggedIn ? '/dashboard' : '/login')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: '#C6FF34', color: '#171717', border: 'none',
                    borderRadius: 999, padding: '14px 28px',
                    fontSize: 15, fontWeight: 700, cursor: 'pointer',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 12px 40px rgba(198,255,52,0.28)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {isLoggedIn ? 'Go to dashboard' : 'Start for free'} <ArrowRight size={15} />
                </button>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.28)' }}>
                  No credit card required
                </span>
              </div>
            </div>

            {/* Live score pill */}
            <div style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(14px)',
              transition: 'opacity 0.6s ease 440ms, transform 0.6s ease 440ms',
              flexShrink: 0,
            }}>
              <div style={{
                padding: '24px 32px', borderRadius: 16,
                border: '1px solid rgba(198,255,52,0.18)',
                background: 'rgba(198,255,52,0.04)',
                backdropFilter: 'blur(12px)',
              }}>
                <div style={{
                  fontSize: 64, fontWeight: 700, color: '#C6FF34',
                  fontFamily: 'var(--font-stat)', letterSpacing: '-0.04em', lineHeight: 1,
                }}>
                  {score}<span style={{ fontSize: 32 }}>%</span>
                </div>
                <div style={{
                  fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 8,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  Resume match score
                </div>
                <div style={{
                  fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 4,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  Demo
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section
        ref={stepsReveal.ref}
        style={{ padding: '80px 48px', maxWidth: 1200, margin: '0 auto' }}
      >
        <p style={{
          fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)',
          letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 48,
          opacity: stepsReveal.visible ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}>
          How it works
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              style={{
                padding: '40px 40px 40px 0',
                borderRight: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                paddingRight: i < 2 ? 40 : 0,
                paddingLeft: i > 0 ? 40 : 0,
                opacity: stepsReveal.visible ? 1 : 0,
                transform: stepsReveal.visible ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.6s ease ${i * 100}ms, transform 0.6s ease ${i * 100}ms`,
              }}
            >
              <div style={{
                fontSize: 48, fontWeight: 700, color: 'rgba(255,255,255,0.06)',
                fontFamily: 'var(--font-stat)', letterSpacing: '-0.04em',
                marginBottom: 24, lineHeight: 1,
              }}>
                {step.n}
              </div>
              <h3 style={{
                fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em',
                marginBottom: 12, color: '#fff',
              }}>
                {step.title}
              </h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.42)', lineHeight: 1.65 }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 48px' }} />

      {/* ── Features ── */}
      <section
        ref={featuresReveal.ref}
        style={{ padding: '80px 48px', maxWidth: 1200, margin: '0 auto' }}
      >
        <p style={{
          fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)',
          letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 48,
          opacity: featuresReveal.visible ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}>
          Everything you need
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.label} index={i} {...f} visible={featuresReveal.visible} />
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section
        ref={ctaReveal.ref}
        style={{ padding: '80px 48px 120px', maxWidth: 1200, margin: '0 auto' }}
      >
        <div style={{
          padding: '72px 64px', borderRadius: 24,
          border: '1px solid rgba(198,255,52,0.15)',
          background: 'rgba(198,255,52,0.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 48,
          flexWrap: 'wrap',
          opacity: ctaReveal.visible ? 1 : 0,
          transform: ctaReveal.visible ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.7s ease, transform 0.7s ease',
        }}>
          <div>
            <h2 style={{
              fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 700,
              letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 16,
            }}>
              Ready to start<br />
              <span style={{ color: '#C6FF34' }}>tailoring?</span>
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
              Your next role is one tailored application away.
            </p>
          </div>
          <button
            onClick={() => navigate('/login')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#C6FF34', color: '#171717', border: 'none',
              borderRadius: 999, padding: '16px 36px',
              fontSize: 16, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 16px 48px rgba(198,255,52,0.3)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            Get started free <ArrowRight size={17} />
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        padding: '24px 48px', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', background: '#C6FF34',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Target size={9} color="#171717" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>tailr</span>
        </div>
        <span style={{
          fontSize: 12, color: 'rgba(255,255,255,0.2)',
          fontFamily: 'var(--font-mono)',
        }}>
          © 2026
        </span>
      </footer>
    </div>
  )
}
