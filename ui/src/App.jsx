import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, Users, Mail, Settings, LogOut,
  ChevronRight, X, Plus, Trash2, Shield, Check, Zap,
  BarChart3, Activity as ActivityIcon, Trophy, UserCog,
} from 'lucide-react'
import { auth, usersApi, can } from './api'
import Dashboard from './Dashboard'
import Leads from './Leads'
import Compose from './Compose'
import Pipeline from './Pipeline'
import Analytics from './Analytics'
import ActivityPage from './Activity'
import Performance from './Performance'
import Team from './Team'
import { ToastProvider, CommandPalette } from './ui'

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
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition
          placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400
          ${error ? 'border-red-300' : 'border-slate-200'}`}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ─── Login ────────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [email, setEmail]       = useState('admin@company.com')
  const [password, setPassword] = useState('admin123')
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

  const demos = [
    ['admin@company.com',   'admin123',   'Admin'],
    ['manager@company.com', 'manager123', 'Manager'],
    ['agent@company.com',   'agent123',   'Agent'],
    ['viewer@company.com',  'viewer123',  'Viewer'],
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-[400px]"
      >
        {/* Wordmark */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center">
            <div className="w-4 h-4 border-[2.5px] border-white rounded-[3px]" />
          </div>
          <span className="text-slate-900 font-semibold text-lg tracking-tight">Lead Pipeline</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8">
          <h1 className="text-xl font-semibold text-slate-900 mb-1">Welcome back</h1>
          <p className="text-sm text-slate-500 mb-6">Sign in to your workspace</p>

          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <Input label="Email" type="email" value={email}
              onChange={e => setEmail(e.target.value)} required autoFocus />
            <Input label="Password" type="password" value={password}
              onChange={e => setPassword(e.target.value)} required />
            <button
              type="submit" disabled={busy}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium
                         rounded-lg text-sm transition-colors disabled:opacity-50 mt-2"
            >
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
              Demo accounts
            </p>
            <div className="space-y-1">
              {demos.map(([e, p, role]) => (
                <button key={e}
                  onClick={() => { setEmail(e); setPassword(p) }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg
                             text-sm hover:bg-slate-50 transition-colors group"
                >
                  <span className="text-slate-600 group-hover:text-slate-900 transition-colors">{e}</span>
                  <span className="text-xs text-slate-400 font-medium">{role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
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
    if (!confirm('Remove this team member?')) return
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
        className="absolute right-0 top-0 bottom-0 w-[480px] bg-white shadow-panel flex flex-col"
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white
                           text-xs font-medium rounded-lg hover:bg-slate-800 transition-colors">
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
                                     focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                          <option value="viewer">Viewer — read only</option>
                          <option value="manager">Manager — edit + send</option>
                          <option value="admin">Admin — full access</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="submit" disabled={saving}
                        className="flex-1 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg
                                   hover:bg-slate-800 transition-colors disabled:opacity-50">
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
                    <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center
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
                                     focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white capitalize">
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
  { to: '/',           label: 'Dashboard',   icon: LayoutDashboard, roles: ['admin', 'manager', 'viewer'] },
  { to: '/analytics',  label: 'Analytics',   icon: BarChart3,       roles: ['admin', 'manager', 'viewer'] },
  { to: '/leads',      label: 'Leads',       icon: Users,           roles: ['admin', 'manager', 'agent', 'viewer'] },
  { to: '/performance',label: 'Leaderboard', icon: Trophy,          roles: ['admin', 'manager', 'agent', 'viewer'] },
  { to: '/pipeline',   label: 'Pipeline',    icon: Zap,             roles: ['admin', 'manager'] },
  { to: '/compose',    label: 'Compose',     icon: Mail,            roles: ['admin', 'manager', 'agent'] },
  { to: '/team',       label: 'Team',        icon: UserCog,         roles: ['admin', 'manager'] },
  { to: '/activity',   label: 'Activity',    icon: ActivityIcon,    roles: ['admin', 'manager'] },
]

function Sidebar({ onSettings }) {
  const { user, logout } = useAuth()
  const navItems = NAV.filter(n => n.roles.includes(user?.role))

  return (
    <aside className="w-[220px] flex-shrink-0 bg-navy-900 flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
            <div className="w-4 h-4 border-[2px] border-white rounded-[3px]" />
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">Lead Pipeline</span>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
               ${isActive
                 ? 'bg-white/10 text-white font-medium'
                 : 'text-slate-400 hover:bg-white/[.06] hover:text-slate-200'}`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={16} className={isActive ? 'text-blue-400' : ''} strokeWidth={isActive ? 2 : 1.75} />
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
  )
}

// ─── Main layout ──────────────────────────────────────────────────────────────
function Layout() {
  const { user } = useAuth()
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar onSettings={() => setShowSettings(true)} />

      <main className="flex-1 overflow-y-auto min-w-0">
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/"            element={user?.role === 'agent' ? <Navigate to="/leads" replace /> : <Dashboard />} />
            <Route path="/analytics"   element={<Analytics />} />
            <Route path="/leads"       element={<Leads />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/pipeline"    element={<Pipeline user={user} />} />
            <Route path="/compose"     element={<Compose />} />
            <Route path="/team"        element={<Team />} />
            <Route path="/activity"    element={<ActivityPage />} />
            <Route path="*"            element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </main>

      <CommandPalette />

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
      <Ctx.Provider value={{ user, logout }}>
        <BrowserRouter>
          <Layout />
        </BrowserRouter>
      </Ctx.Provider>
    </ToastProvider>
  )
}
