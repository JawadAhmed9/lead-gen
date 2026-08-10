import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, Users, Mail, Settings, LogOut,
  ChevronRight, X, Plus, Trash2, Shield, Check, Zap,
  BarChart3, Activity as ActivityIcon, Trophy, UserCog,
  ChevronDown, KeyRound, Command, CalendarClock, FileText, FileCheck,
  Cpu, Factory, ShieldCheck, TrendingUp, Infinity as InfinityIcon, Mail as MailIcon, Phone, Globe,
  Menu as MenuIcon, Bell, Rocket,
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

// ─── Login ────────────────────────────────────────────────────────────────────
const CAPABILITIES = [
  { icon: Cpu,         label: 'Artificial Intelligence' },
  { icon: Factory,     label: 'Industrial Automation' },
  { icon: BarChart3,   label: 'Smart Analytics' },
  { icon: ShieldCheck, label: 'Secure & Reliable' },
  { icon: TrendingUp,  label: 'Data-Driven Decisions' },
  { icon: InfinityIcon,label: 'Continuous Innovation' },
]

function BrandPanel() {
  return (
    <div className="hidden lg:flex relative w-[56%] flex-col justify-between overflow-hidden bg-navy-950 text-white">
      {/* glowing hexagon hero as atmospheric background */}
      <div className="absolute inset-x-0 top-0 h-[62%] bg-cover bg-center opacity-80"
           style={{ backgroundImage: "url('/brand/hero-glow.jpg')" }} />
      {/* gradients: blend image into navy + darken bottom for legibility */}
      <div className="absolute inset-0"
           style={{ background: 'radial-gradient(120% 80% at 50% 12%, rgba(43,132,255,.18), transparent 55%), linear-gradient(180deg, rgba(6,11,24,.15) 0%, rgba(6,11,24,.55) 46%, #060B18 78%)' }} />
      {/* subtle blue edge glow */}
      <div className="absolute -right-1 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-brand-500/40 to-transparent" />

      {/* top: clean lockup */}
      <div className="relative z-10 p-10">
        <Wordmark size={30} subtitle dark />
      </div>

      {/* center: headline */}
      <div className="relative z-10 px-10 -mt-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-medium text-brand-200 mb-5 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" /> AI-Powered Lead Generation
        </div>
        <h1 className="text-[2.6rem] leading-[1.08] font-bold tracking-tight max-w-md">
          Powering <span className="text-brand-400">Intelligent</span> Industries
        </h1>
        <p className="mt-4 text-slate-300 text-[15px] leading-relaxed max-w-md">
          AI-driven solutions for automation, optimization, and growth — turning the GCC industrial market into your pipeline.
        </p>

        {/* capability pills */}
        <div className="mt-8 grid grid-cols-2 gap-2.5 max-w-lg">
          {CAPABILITIES.map(({ icon: Icon, label }) => (
            <div key={label}
                 className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/[.06] border border-white/10 backdrop-blur-sm">
              <Icon size={16} className="text-brand-400 shrink-0" />
              <span className="text-[13px] font-medium text-slate-200">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* footer: contact */}
      <div className="relative z-10 p-10 flex items-center gap-6 text-[13px] text-slate-400 border-t border-white/10 mt-8">
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
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await auth.login(email, password)
      localStorage.setItem('lp_token', res.token)
      onLogin(res.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      <BrandPanel />

      {/* right: sign-in */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-[380px]"
        >
          {/* mark + heading */}
          <div className="flex items-center gap-2.5 mb-8 lg:mb-9">
            <Logo size={40} />
            <div className="leading-none lg:hidden">
              <div className="font-bold tracking-tight text-navy-900 text-lg">Stemronic <span className="text-brand-500">AI</span></div>
              <div className="uppercase tracking-[0.18em] text-[9px] text-slate-400 mt-1">Lead Gen Platform</div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-navy-900 tracking-tight mb-1">Sign in to Stemronic AI</h1>
          <p className="text-sm text-slate-500 mb-7">Welcome back — access your lead-gen workspace.</p>

          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <Input label="Email" type="email" value={email}
              onChange={e => setEmail(e.target.value)} required autoFocus placeholder="you@stemronic.com" />
            <Input label="Password" type="password" value={password}
              onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
            <button
              type="submit" disabled={busy}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold
                         rounded-lg text-sm transition-colors disabled:opacity-50 mt-2 shadow-sm
                         shadow-brand-600/20"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} Stemronic AI · Intelligent Solutions, Industrial Impact
          </p>
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
      <div className="ml-auto"><NotificationBell /></div>
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
export default function App() {
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
