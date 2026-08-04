import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertCircle, Info, X, Search, LayoutDashboard, Users, Mail, Zap, BarChart3, Activity as ActivityIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { leadsApi } from './api'

// ─── Formatting helpers ───────────────────────────────────────────────────────
export function fmtMoney(n, { compact = true } = {}) {
  const v = Number(n) || 0
  if (compact) {
    if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`
    if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  }
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function fmtNum(n) {
  return (Number(n) || 0).toLocaleString()
}

// ─── Time — stored timestamps are UTC (no 'Z'); parse as UTC, show local ──────
function _utc(iso) {
  if (!iso) return null
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z')
  return isNaN(d) ? null : d
}
export function fmtDateTime(iso) {
  const d = _utc(iso)
  return d ? d.toLocaleString() : ''
}
export function timeAgo(iso) {
  const d = _utc(iso)
  if (!d) return ''
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return d.toLocaleDateString()
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ className = '', style }) {
  return <div className={`skeleton ${className}`} style={style} />
}

// ─── Toasts ─────────────────────────────────────────────────────────────────
const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx) || { push: () => {} }

const TOAST_STYLE = {
  success: { icon: CheckCircle, ring: 'text-emerald-500', bar: 'bg-emerald-500' },
  error:   { icon: AlertCircle, ring: 'text-red-500',     bar: 'bg-red-500' },
  info:    { icon: Info,        ring: 'text-blue-500',    bar: 'bg-blue-500' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, type = 'success', ttl = 3600) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ttl)
  }, [])
  const remove = (id) => setToasts(t => t.filter(x => x.id !== id))

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 w-[340px]">
        <AnimatePresence>
          {toasts.map(t => {
            const s = TOAST_STYLE[t.type] || TOAST_STYLE.info
            const Icon = s.icon
            return (
              <motion.div key={t.id}
                initial={{ opacity: 0, x: 40, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="relative bg-white border border-slate-200 rounded-xl shadow-panel
                           overflow-hidden flex items-start gap-3 px-4 py-3.5">
                <span className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar}`} />
                <Icon size={17} className={`${s.ring} flex-shrink-0 mt-0.5`} />
                <p className="text-sm text-slate-700 flex-1 leading-snug">{t.message}</p>
                <button onClick={() => remove(t.id)}
                  className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0">
                  <X size={14} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

// ─── Confirm dialog (styled replacement for window.confirm) ───────────────────
const ConfirmCtx = createContext(null)
export const useConfirm = () => useContext(ConfirmCtx) || (async (o) => window.confirm(typeof o === 'string' ? o : o?.message))

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const confirm = useCallback((opts) => new Promise((resolve) => {
    const o = typeof opts === 'string' ? { message: opts } : (opts || {})
    setState({ title: 'Are you sure?', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', danger: false, ...o, resolve })
  }), [])
  const close = (val) => { state?.resolve(val); setState(null) }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {state && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => close(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.16 }}
              className="relative bg-white rounded-2xl border border-slate-200 shadow-panel w-full max-w-sm p-6">
              <h3 className="text-base font-semibold text-slate-900">{state.title}</h3>
              {state.message && <p className="text-sm text-slate-500 mt-1.5 leading-relaxed whitespace-pre-line">{state.message}</p>}
              <div className="flex gap-2.5 mt-5">
                <button onClick={() => close(true)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-colors
                              ${state.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}>
                  {state.confirmLabel}
                </button>
                <button onClick={() => close(false)}
                  className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  {state.cancelLabel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmCtx.Provider>
  )
}

// ─── Command palette (⌘/Ctrl-K) ───────────────────────────────────────────────
const NAV_ITEMS = [
  { label: 'Dashboard', to: '/',         icon: LayoutDashboard, kw: 'home overview' },
  { label: 'Analytics', to: '/analytics', icon: BarChart3,      kw: 'metrics pipeline value market' },
  { label: 'Leads',     to: '/leads',     icon: Users,          kw: 'contacts table' },
  { label: 'Pipeline',  to: '/pipeline',  icon: Zap,            kw: 'collect apollo run' },
  { label: 'Compose',   to: '/compose',   icon: Mail,           kw: 'email draft' },
  { label: 'Activity',  to: '/activity',  icon: ActivityIcon,   kw: 'audit log history' },
]

export function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [leads, setLeads] = useState([])
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (open) { setQ(''); setLeads([]); setActive(0); setTimeout(() => inputRef.current?.focus(), 40) } }, [open])

  // Debounced lead search
  useEffect(() => {
    if (!open || q.trim().length < 2) { setLeads([]); return }
    const t = setTimeout(async () => {
      const res = await leadsApi.list({ page: 1, limit: 6, search: q }).catch(() => null)
      setLeads(res?.leads || [])
    }, 220)
    return () => clearTimeout(t)
  }, [q, open])

  const nav = NAV_ITEMS.filter(n =>
    !q || n.label.toLowerCase().includes(q.toLowerCase()) || n.kw.includes(q.toLowerCase()))
  const results = [
    ...nav.map(n => ({ type: 'nav', ...n })),
    ...leads.map(l => ({ type: 'lead', ...l })),
  ]

  const go = (item) => {
    setOpen(false)
    if (item.type === 'nav') navigate(item.to)
    else navigate('/leads', { state: { search: [item.first_name, item.last_name].filter(Boolean).join(' ') || item.company } })
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]) }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[14vh] px-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }} transition={{ duration: 0.16 }}
            className="relative w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-panel overflow-hidden">
            <div className="flex items-center gap-3 px-4 border-b border-slate-100">
              <Search size={16} className="text-slate-400" />
              <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setActive(0) }} onKeyDown={onKeyDown}
                placeholder="Jump to a page or search leads…"
                className="flex-1 py-4 text-sm outline-none placeholder:text-slate-400" />
              <kbd className="text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">ESC</kbd>
            </div>
            <div className="max-h-[340px] overflow-y-auto py-2">
              {results.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">No matches</p>
              )}
              {results.map((item, i) => {
                const Icon = item.type === 'nav' ? item.icon : Users
                const label = item.type === 'nav'
                  ? item.label
                  : ([item.first_name, item.last_name].filter(Boolean).join(' ') || item.company || 'Lead')
                const sub = item.type === 'nav' ? 'Page' : (item.company || item.title || '')
                return (
                  <button key={i} onMouseEnter={() => setActive(i)} onClick={() => go(item)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                                ${i === active ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                    <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Icon size={13} className="text-slate-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 truncate">{label}</p>
                      {sub && <p className="text-[11px] text-slate-400 truncate">{sub}</p>}
                    </div>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-300">{item.type}</span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
