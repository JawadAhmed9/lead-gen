import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, Users, Mail, Settings, LogOut,
  ChevronRight, X, Plus, Trash2, Shield, Check, Zap,
  BarChart3, Activity as ActivityIcon, Trophy, UserCog,
  ChevronDown, KeyRound, Command, CalendarClock, FileText, FileCheck,
  Cpu, Factory, ShieldCheck, TrendingUp, Infinity as InfinityIcon, Mail as MailIcon, Phone, Globe,
  Menu as MenuIcon, Bell, Rocket,
  Eye, EyeOff, AlertCircle, AlertTriangle, Lock,
} from 'lucide-react'
import { auth, usersApi, can, notificationsApi } from './api'
import { Logo, Wordmark } from './Logo'
import Dashboard from './Dashboard'
import Leads from './Leads'
import Compose from './Compose'
import Pipeline from './Pipeline'
import Analytics from './Analytics'
import ActivityPage from './Activity'
import Performance from './Performance'
import AgentDashboard from './AgentDashboard'
import MyDay from './MyDay'
import Scripts from './Scripts'
import RfqPipeline from './RfqPipeline'
import Team from './Team'
import Roadmap from './Roadmap'
import Copilot from './Copilot'
import { ThemeProvider, ThemeToggle, ThemeSegmented } from './theme'
import { ToastProvider, ConfirmProvider, CommandPalette, useToast, useConfirm } from './ui'

// ─── Auth context ─────────────────────────────────────────────────────────────
const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)
export { can }

// ─── Shared primitives ────────────────────────────────────────────────────────
export const pageAnim = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0 },
  transition: { duration: 0.22 },
}

function Input({ label, error, ...props }) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>}
      <input
        {...props}
        className={`w-full px-3.5 py-2.5 border rounded-lg text-sm bg-white
          focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition
          placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400
          ${error ? 'border-red-300' : 'border-slate-200'}`}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ─── Login (Constellation + Spotlight) ───────────────────────────────────────
function useCountUp(target, dur = 1400) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf, t0
    const step = (t) => { if (!t0) t0 = t; const p = Math.min(1, (t - t0) / dur); setV(Math.round(target * (1 - Math.pow(1 - p, 4)))); if (p < 1) raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf)
  }, [target, dur])
  return v
}

function ConstellationCanvas() {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d'); let w, h, nodes, raf
    const mouse = { x: -999, y: -999 }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const size = () => { const r = c.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2); c.width = r.width * dpr; c.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); w = r.width; h = r.height }
    const init = () => { const n = Math.min(80, Math.floor(w * h / 13000)); nodes = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, hex: Math.random() < .16, tw: Math.random() * Math.PI * 2 })) }
    const hexagon = (x, y, r) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; const px = x + r * Math.cos(a), py = y + r * Math.sin(a); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) } ctx.closePath() }
    const frame = () => {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < nodes.length; i++) { const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) { const b = nodes[j]; const dx = a.x - b.x, dy = a.y - b.y; const d = Math.hypot(dx, dy)
          if (d < 130) { ctx.strokeStyle = `rgba(90,160,255,${(1 - d / 130) * .18})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke() } } }
      for (const p of nodes) {
        if (!reduce) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1
          const mdx = p.x - mouse.x, mdy = p.y - mouse.y, md = Math.hypot(mdx, mdy); if (md < 130 && md > 0) { const f = (130 - md) / 130 * .6; p.x += mdx / md * f; p.y += mdy / md * f }
          p.tw += .03 }
        const tw = .6 + Math.sin(p.tw) * .4
        if (p.hex) { ctx.strokeStyle = `rgba(150,200,255,${.5 * tw})`; ctx.lineWidth = 1; hexagon(p.x, p.y, 3.4); ctx.stroke() }
        else { ctx.fillStyle = `rgba(134,190,255,${.5 * tw})`; ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, 7); ctx.fill() }
      }
      if (!reduce) raf = requestAnimationFrame(frame)
    }
    size(); init(); frame()
    const onMove = (e) => { const r = c.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top }
    const onResize = () => { size(); init() }
    c.addEventListener('mousemove', onMove); window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); c.removeEventListener('mousemove', onMove); window.removeEventListener('resize', onResize) }
  }, [])
  return <canvas ref={ref} className="absolute inset-0 w-full h-full" />
}

function BrandPanel() {
  const s1 = useCountUp(13500), s2 = useCountUp(6), s3 = useCountUp(150)
  // Everything here sits on a permanently-dark navy panel, so all text uses
  // FIXED light colors (never remapped slate classes, which would flip to dark).
  return (
    <div className="hidden lg:flex relative w-[56%] flex-col justify-between overflow-hidden" style={{ background: '#06070B' }}>
      <ConstellationCanvas />
      <div className="pointer-events-none absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full" style={{ background: 'rgba(43,132,255,.42)', filter: 'blur(84px)' }} />
      <div className="pointer-events-none absolute -bottom-24 -right-16 w-[360px] h-[360px] rounded-full" style={{ background: 'rgba(29,224,211,.2)', filter: 'blur(84px)' }} />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-px" style={{ background: 'linear-gradient(180deg,transparent,rgba(43,132,255,.4),transparent)' }} />

      <div className="relative z-10 p-10"><Wordmark size={30} subtitle dark /></div>

      <div className="relative z-10 px-10 -mt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium mb-6"
             style={{ background: 'rgba(255,255,255,.08)', borderColor: 'rgba(255,255,255,.14)', color: '#bcd4f5' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" /> AI-Powered Lead Generation
        </div>
        <h1 className="text-[2.6rem] leading-[1.06] font-bold tracking-tight text-white max-w-md">
          Every enterprise is a <span style={{ background: 'linear-gradient(90deg,#86BEFF,#2B84FF,#1DE0D3)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>signal</span>.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed max-w-md" style={{ color: 'rgba(255,255,255,.6)' }}>
          AI-driven discovery, scoring and outreach — turning the GCC industrial market into your pipeline.
        </p>
        <div className="mt-9 flex gap-10">
          {[[s1.toLocaleString() + '+', 'Leads sourced'], [s2, 'GCC markets'], [s3 + '+', 'ICP signals']].map(([v, l]) => (
            <div key={l}>
              <div className="text-2xl font-bold text-white tabular-nums">{v}</div>
              <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: '#8fa2b8' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 p-10 flex items-center gap-6 text-[13px]" style={{ color: 'rgba(255,255,255,.5)', borderTop: '1px solid rgba(255,255,255,.1)' }}>
        <span className="flex items-center gap-1.5"><MailIcon size={13} className="text-brand-400" /> info@stemronic.com</span>
        <span className="flex items-center gap-1.5"><Globe size={13} className="text-brand-400" /> stemronic.com</span>
        <span className="flex items-center gap-1.5"><Phone size={13} className="text-brand-400" /> +92 123 456 7890</span>
      </div>
    </div>
  )
}

function Login({ onLogin }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow]         = useState(false)
  const [keep, setKeep]         = useState(true)
  const [caps, setCaps]         = useState(false)
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)
  const paneRef = useRef(null)
  const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const submit = async (e) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return }
    setBusy(true); setError('')
    try {
      const res = await auth.login(email, password)
      localStorage.setItem('lp_token', res.token)
      onLogin(res.user)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const onMove = (e) => {
    const el = paneRef.current; if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px')
    el.style.setProperty('--my', (e.clientY - r.top) + 'px')
  }
  const onCaps = (e) => { try { setCaps(!!(e.getModifierState && e.getModifierState('CapsLock'))) } catch (_) {} }
  const field = "w-full pl-9 pr-3 py-2.5 rounded-xl bg-elevated/60 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-transparent transition"

  return (
    <div className="min-h-screen flex bg-white">
      <div className="fixed top-4 right-4 z-50"><ThemeToggle /></div>
      <BrandPanel />

      {/* right: cursor spotlight + sign-in */}
      <div ref={paneRef} onMouseMove={onMove} className="flex-1 relative flex items-center justify-center p-6 sm:p-10 overflow-hidden">
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(120,140,170,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(120,140,170,.10) 1px,transparent 1px)', backgroundSize: '56px 56px' }} />
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(110,180,255,.8) 1px,transparent 1px),linear-gradient(90deg,rgba(110,180,255,.8) 1px,transparent 1px)', backgroundSize: '56px 56px', WebkitMaskImage: 'radial-gradient(300px circle at var(--mx,50%) var(--my,50%),#000,transparent 70%)', maskImage: 'radial-gradient(300px circle at var(--mx,50%) var(--my,50%),#000,transparent 70%)' }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(440px circle at var(--mx,50%) var(--my,50%),rgba(43,132,255,.13),transparent 70%)' }} />

        <motion.div
          initial={{ opacity: 0, y: 22, scale: .978, filter: 'blur(5px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: .8, ease: [.16, 1, .3, 1] }}
          className="tl-card relative w-full max-w-[400px] z-10">
          <div className="relative rounded-[21px] p-8 bg-surface shadow-lift">
            <div className="flex items-center gap-2.5 mb-7">
              <Logo size={38} />
              <div className="leading-none">
                <div className="font-bold tracking-tight text-slate-900 text-base">Stemronic <span className="text-brand-500">AI</span></div>
                <div className="uppercase tracking-[0.18em] text-[8.5px] text-slate-400 mt-1">Lead Gen Platform</div>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Sign in to Stemronic AI</h1>
            <p className="text-sm text-slate-500 mb-6">Welcome back — access your lead-gen workspace.</p>

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm flex items-center gap-2">
                <AlertCircle size={15} /> {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
                <div className="relative">
                  <MailIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
                    placeholder="you@stemronic.com" className={field} />
                </div>
                {!emailValid && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12} /> Enter a valid email</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    onKeyUp={onCaps} onKeyDown={onCaps} required placeholder="••••••••" className={field + ' pr-10'} />
                  <button type="button" onClick={() => setShow(s => !s)} aria-label="Toggle password visibility"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {caps && <p className="mt-1 text-xs text-amber-500 flex items-center gap-1"><AlertTriangle size={12} /> Caps Lock is on</p>}
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 select-none cursor-pointer">
                <input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} className="w-4 h-4 rounded accent-brand-600" />
                Keep me signed in
              </label>

              <button type="submit" disabled={busy}
                className="w-full py-2.5 rounded-xl text-white font-semibold text-sm mt-1 transition-all hover:brightness-105 active:scale-[.988] disabled:opacity-60"
                style={{ background: 'linear-gradient(90deg,#4F9EFF,#2B84FF,#1059C8)', boxShadow: '0 10px 26px -8px rgba(43,132,255,.55)' }}>
                {busy
                  ? <span className="inline-flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing in…</span>
                  : 'Sign in'}
              </button>
              <p className="text-center text-[11px] text-slate-400">Press ↵ to sign in</p>
            </form>

            <p className="mt-6 text-center text-[11px] text-slate-400">
              © {new Date().getFullYear()} Stemronic AI · Intelligent Solutions, Industrial Impact
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

// ─── Settings panel (slide-over) ──────────────────────────────────────────────
const ROLE_STYLES = {
  admin:   'bg-purple-50 text-purple-700 border-purple-100',
  manager: 'bg-blue-50 text-blue-700 border-blue-100',
  viewer:  'bg-slate-100 text-slate-600 border-slate-200',
}

function SettingsPanel({ onClose }) {
  const { user } = useAuth()
  const confirm = useConfirm()
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'viewer', password: '' })
  const [saving, setSaving] = useState(false)

  const reload = () => usersApi.list().then(setMembers).finally(() => setLoading(false))
  useEffect(() => { reload() }, [])

  const invite = async (e) => {
    e.preventDefault(); setSaving(true)
    try { await usersApi.invite(form); await reload(); setShowForm(false); setForm({ name: '', email: '', role: 'viewer', password: '' }) }
    finally { setSaving(false) }
  }

  const changeRole = async (id, role) => {
    await usersApi.setRole(id, role)
    setMembers(m => m.map(u => u.id === id ? { ...u, role } : u))
  }

  const remove = async (id) => {
    if (!(await confirm({ title: 'Remove team member?', message: 'They will lose access immediately.', confirmLabel: 'Remove', danger: true }))) return
    await usersApi.remove(id); setMembers(m => m.filter(u => u.id !== id))
  }

  const MATRIX = [
    ['View all data',    true, true,  true],
    ['Add / edit leads', true, true,  false],
    ['Delete leads',     true, false, false],
    ['Send emails',      true, true,  false],
    ['Team management',  true, false, false],
  ]

  return (
    <div className="fixed inset-0 z-50 flex">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />

      <motion.aside
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="absolute right-0 top-0 bottom-0 w-full sm:w-[480px] bg-white shadow-panel flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-7 py-6 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Team & Access</h2>
            <p className="text-sm text-slate-500 mt-0.5">Manage roles and workspace permissions</p>
          </div>
          <button onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors mt-0.5">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-8">
          {/* Appearance */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Appearance</h3>
            <p className="text-xs text-slate-500 mb-3">Choose light, dark, or follow your system.</p>
            <ThemeSegmented />
          </div>

          {/* Members list */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">Team members</h3>
              <button onClick={() => setShowForm(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white
                           text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors">
                <Plus size={13} /> Invite
              </button>
            </div>

            {/* Invite form */}
            <AnimatePresence>
              {showForm && (
                <motion.form onSubmit={invite}
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                  className="overflow-hidden mb-4"
                >
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <p className="text-xs font-semibold text-slate-600">New member</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Full name" required value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                      <Input label="Email" type="email" required value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                      <Input label="Temp password" type="password" required value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">Role</label>
                        <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm
                                     focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
                          <option value="viewer">Viewer — read only</option>
                          <option value="manager">Manager — edit + send</option>
                          <option value="admin">Admin — full access</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="submit" disabled={saving}
                        className="flex-1 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg
                                   hover:bg-brand-700 transition-colors disabled:opacity-50">
                        {saving ? 'Sending...' : 'Send invite'}
                      </button>
                      <button type="button" onClick={() => setShowForm(false)}
                        className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600
                                   hover:bg-slate-50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {members.map(m => (
                  <div key={m.id}
                    className="flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100
                               rounded-xl transition-colors">
                    <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center
                                    text-white text-sm font-semibold flex-shrink-0">
                      {m.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                      <p className="text-xs text-slate-500 truncate">{m.email}</p>
                    </div>
                    {m.id !== user.id ? (
                      <>
                        <select value={m.role} onChange={e => changeRole(m.id, e.target.value)}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5
                                     focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white capitalize">
                          {['admin','manager','viewer'].map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <button onClick={() => remove(m.id)}
                          className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg
                                     transition-colors text-slate-400 flex-shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium border capitalize
                                        ${ROLE_STYLES[m.role]}`}>
                        {m.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Permission matrix */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Shield size={14} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">Permission matrix</h3>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Action</th>
                    {['Admin','Manager','Viewer'].map(r => (
                      <th key={r} className="text-center px-4 py-3 text-xs font-semibold text-slate-600">{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map(([label, admin, manager, viewer], i) => (
                    <tr key={label} className={i < MATRIX.length - 1 ? 'border-b border-slate-100' : ''}>
                      <td className="px-4 py-3 text-xs text-slate-600">{label}</td>
                      {[admin, manager, viewer].map((v, j) => (
                        <td key={j} className="text-center px-4 py-3">
                          {v
                            ? <Check size={14} className="inline text-emerald-500" />
                            : <span className="inline-block w-3 h-0.5 bg-slate-200 rounded" />
                          }
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </motion.aside>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
// roles controls which nav items each role sees
const NAV = [
  { to: '/',           label: 'Dashboard',   icon: LayoutDashboard, roles: ['admin', 'manager', 'agent', 'viewer'] },
  { to: '/myday',      label: 'My Day',      icon: CalendarClock,   roles: ['admin', 'manager', 'agent'] },
  { to: '/analytics',  label: 'Analytics',   icon: BarChart3,       roles: ['admin', 'manager', 'viewer'] },
  { to: '/leads',      label: 'Leads',       icon: Users,           roles: ['admin', 'manager', 'agent', 'viewer'] },
  { to: '/performance',label: 'Leaderboard', icon: Trophy,          roles: ['admin', 'manager', 'agent', 'viewer'] },
  { to: '/rfqs',       label: 'RFQ Pipeline',icon: FileCheck,       roles: ['admin', 'manager', 'agent'] },
  { to: '/pipeline',   label: 'Pipeline',    icon: Zap,             roles: ['admin', 'manager'] },
  { to: '/compose',    label: 'Compose',     icon: Mail,            roles: ['admin', 'manager', 'agent'] },
  { to: '/team',       label: 'Team',        icon: UserCog,         roles: ['admin', 'manager'] },
  { to: '/scripts',    label: 'Scripts',     icon: FileText,        roles: ['admin', 'manager', 'agent'] },
  { to: '/roadmap',    label: 'Roadmap',     icon: Rocket,          roles: ['admin', 'manager', 'agent', 'viewer'] },
  { to: '/activity',   label: 'Activity',    icon: ActivityIcon,    roles: ['admin', 'manager'] },
]

function Sidebar({ onSettings, open, onClose }) {
  const { user, logout } = useAuth()
  const navItems = NAV.filter(n => n.roles.includes(user?.role))

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[1px] lg:hidden transition-opacity duration-200
                    ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-[240px] sm:w-[220px] flex-shrink-0 bg-navy-900 flex flex-col h-full
                         transform transition-transform duration-200 ease-out lg:translate-x-0
                         ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Logo */}
      <div className="px-5 py-6">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <div className="leading-none">
            <div className="text-white font-bold text-sm tracking-tight">Stemronic <span className="text-brand-400">AI</span></div>
            <div className="text-[8.5px] uppercase tracking-[0.16em] text-slate-400 mt-1">Lead Gen Platform</div>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
               ${isActive
                 ? 'bg-brand-500/15 text-white font-medium ring-1 ring-inset ring-brand-500/25'
                 : 'text-slate-400 hover:bg-white/[.06] hover:text-slate-200'}`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={16} className={isActive ? 'text-brand-400' : ''} strokeWidth={isActive ? 2 : 1.75} />
                <span className="flex-1">{label}</span>
                {isActive && <ChevronRight size={13} className="text-slate-500" />}
              </>
            )}
          </NavLink>
        ))}

        {user?.role === 'admin' && (
          <button onClick={onSettings}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                       text-slate-400 hover:bg-white/[.06] hover:text-slate-200 transition-colors">
            <Settings size={16} strokeWidth={1.75} />
            Settings
          </button>
        )}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-white/[.08]">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center
                          justify-center text-white text-xs font-semibold flex-shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate leading-tight">{user?.name}</p>
            <p className="text-slate-400 text-[11px] capitalize mt-0.5">{user?.role}</p>
          </div>
          <button onClick={logout} title="Sign out"
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-500
                       hover:text-slate-300 flex-shrink-0">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
    </>
  )
}

// ─── Change-password modal ────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const { push } = useToast()
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [cf, setCf] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (nw.length < 6) return setErr('New password must be at least 6 characters')
    if (nw !== cf) return setErr('New passwords do not match')
    setBusy(true)
    try { await auth.changePassword(cur, nw); push('Password updated', 'success'); onClose() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <motion.form onSubmit={submit}
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
        className="relative bg-white rounded-2xl border border-slate-200 shadow-panel w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Change password</h3>
        {err && <div className="mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs">{err}</div>}
        {[["Current password", cur, setCur], ["New password", nw, setNw], ["Confirm new password", cf, setCf]].map(([lbl, val, set]) => (
          <div key={lbl} className="mb-3">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">{lbl}</label>
            <input type="password" required value={val} onChange={e => set(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        ))}
        <div className="flex gap-2.5 mt-5">
          <button type="submit" disabled={busy}
            className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {busy ? 'Saving…' : 'Update password'}
          </button>
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
        </div>
      </motion.form>
    </div>
  )
}

// ─── Top bar ────────────────────────────────────────────────────────────────
function NotificationBell() {
  const navg = useNavigate()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(false)
  useEffect(() => { notificationsApi.list().then(r => setItems(r.items || [])).catch(() => {}) }, [])
  const count = items.length
  return (
    <div className="relative">
      <button onClick={() => { setOpen(o => !o); setSeen(true) }} aria-label="Notifications"
        className="relative p-2 rounded-lg hover:bg-slate-50 text-slate-500 transition-colors">
        <Bell size={18} />
        {count > 0 && !seen && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-panel z-40 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-900">Notifications</div>
            {count === 0
              ? <div className="px-4 py-8 text-center text-sm text-slate-400">You're all caught up.</div>
              : <div className="max-h-80 overflow-y-auto">
                  {items.map(n => (
                    <button key={n.id} onClick={() => { setOpen(false); if (n.route) navg(n.route) }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-50 last:border-0">
                      <p className="text-sm text-slate-800">{n.title}</p>
                      {n.sub && <p className="text-xs text-slate-400 mt-0.5">{n.sub}</p>}
                    </button>
                  ))}
                </div>}
          </div>
        </>
      )}
    </div>
  )
}

function TopBar({ onMenu }) {
  const { user, logout } = useAuth()
  const [menu, setMenu] = useState(false)
  const [pw, setPw] = useState(false)
  return (
    <header className="h-14 flex-shrink-0 bg-white border-b border-slate-200 flex items-center gap-2 px-4 sm:px-6">
      {/* Mobile: hamburger + brand */}
      <button onClick={onMenu} aria-label="Open menu"
        className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
        <MenuIcon size={20} />
      </button>
      <div className="flex items-center gap-2 lg:hidden">
        <Logo size={24} />
        <span className="font-bold text-navy-900 text-sm tracking-tight">Stemronic <span className="text-brand-500">AI</span></span>
      </div>

      <button onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        className="hidden sm:flex items-center gap-2 text-xs text-slate-400 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors">
        <Command size={12} /> Quick search
        <kbd className="ml-1 text-[10px] bg-slate-100 rounded px-1">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-0.5">
        <ThemeToggle />
        <NotificationBell />
      </div>
      <div className="relative">
        <button onClick={() => setMenu(m => !m)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition-colors">
          <span className="w-8 h-8 rounded-full bg-brand-600 text-white text-xs font-semibold flex items-center justify-center">
            {user?.name?.[0]?.toUpperCase()}
          </span>
          <span className="text-sm text-slate-700 hidden sm:block">{user?.name}</span>
          <ChevronDown size={14} className="text-slate-400" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
            <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-panel z-40 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">{user?.role}</span>
              </div>
              <button onClick={() => { setMenu(false); setPw(true) }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                <KeyRound size={14} className="text-slate-400" /> Change password
              </button>
              <button onClick={logout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100">
                <LogOut size={14} className="text-slate-400" /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
      <AnimatePresence>{pw && <ChangePasswordModal onClose={() => setPw(false)} />}</AnimatePresence>
    </header>
  )
}

// ─── Main layout ──────────────────────────────────────────────────────────────
function Layout() {
  const { user } = useAuth()
  const [showSettings, setShowSettings] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setNavOpen(false) }, [location.pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)}
               onSettings={() => { setShowSettings(true); setNavOpen(false) }} />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onMenu={() => setNavOpen(true)} />
        <main className="flex-1 overflow-y-auto min-w-0">
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/"            element={user?.role === 'agent' ? <AgentDashboard /> : <Dashboard />} />
            <Route path="/myday"       element={<MyDay />} />
            <Route path="/analytics"   element={<Analytics />} />
            <Route path="/leads"       element={<Leads />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/rfqs"        element={<RfqPipeline />} />
            <Route path="/scripts"     element={<Scripts />} />
            <Route path="/roadmap"     element={<Roadmap />} />
            <Route path="/pipeline"    element={<Pipeline user={user} />} />
            <Route path="/compose"     element={<Compose />} />
            <Route path="/team"        element={<Team />} />
            <Route path="/activity"    element={<ActivityPage />} />
            <Route path="*"            element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
        </main>
      </div>

      <CommandPalette />
      <Copilot />

      <AnimatePresence>
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      </AnimatePresence>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function AppInner() {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (localStorage.getItem('lp_token')) {
      auth.me().then(setUser).catch(() => localStorage.removeItem('lp_token')).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    await auth.logout().catch(() => {})
    localStorage.removeItem('lp_token')
    setUser(null)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Login onLogin={setUser} />

  return (
    <ToastProvider>
      <ConfirmProvider>
        <Ctx.Provider value={{ user, logout }}>
          <BrowserRouter>
            <Layout />
          </BrowserRouter>
        </Ctx.Provider>
      </ConfirmProvider>
    </ToastProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  )
}
