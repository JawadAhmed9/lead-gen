import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Activity as ActivityIcon, RefreshCw, LogIn, Zap, UserPlus, Trash2,
  Upload, Play, Settings2, ShieldCheck, DollarSign, UserCog, Phone,
} from 'lucide-react'
import { activityApi } from './api'
import { pageAnim } from './App'
import { Skeleton } from './ui'

// map action → icon + accent
const ACTION_META = {
  'auth.login':        { icon: LogIn,      color: '#2563EB', ring: '#EFF6FF', label: 'Signed in' },
  'call.logged':       { icon: Phone,      color: '#0891B2', ring: '#ECFEFF', label: 'Logged a call' },
  'lead.score':        { icon: Zap,        color: '#D97706', ring: '#FFFBEB', label: 'Scored lead' },
  'lead.add':          { icon: UserPlus,   color: '#059669', ring: '#ECFDF5', label: 'Added lead' },
  'lead.delete':       { icon: Trash2,     color: '#DC2626', ring: '#FEF2F2', label: 'Deleted lead' },
  'lead.import':       { icon: Upload,     color: '#7C3AED', ring: '#F5F3FF', label: 'Imported leads' },
  'pipeline.run':      { icon: Play,       color: '#0891B2', ring: '#ECFEFF', label: 'Ran pipeline' },
  'settings.update':   { icon: Settings2,  color: '#475569', ring: '#F1F5F9', label: 'Updated settings' },
  'economics.update':  { icon: DollarSign, color: '#059669', ring: '#ECFDF5', label: 'Updated assumptions' },
  'user.invite':       { icon: UserPlus,   color: '#2563EB', ring: '#EFF6FF', label: 'Invited user' },
  'user.role':         { icon: UserCog,    color: '#7C3AED', ring: '#F5F3FF', label: 'Changed role' },
  'user.remove':       { icon: Trash2,     color: '#DC2626', ring: '#FEF2F2', label: 'Removed user' },
}
const fallback = { icon: ShieldCheck, color: '#475569', ring: '#F1F5F9', label: 'Activity' }

const ROLE_STYLE = {
  admin: 'bg-purple-50 text-purple-700', manager: 'bg-blue-50 text-blue-700',
  viewer: 'bg-slate-100 text-slate-600', system: 'bg-slate-100 text-slate-500',
}

function timeAgo(iso) {
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'))
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return d.toLocaleDateString()
}

export default function Activity() {
  const [events, setEvents] = useState(null)

  const load = () => activityApi.list(100).then(r => setEvents(r.events)).catch(() => setEvents([]))
  useEffect(() => {
    load()
    const id = setInterval(load, 20_000)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.div {...pageAnim} className="p-4 sm:p-6 lg:p-8 max-w-[900px]">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Activity</h1>
          <p className="text-sm text-slate-500 mt-1">Audit trail of every action across the workspace</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        {events == null ? (
          <div className="p-5 space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
        ) : events.length === 0 ? (
          <div className="py-20 text-center">
            <ActivityIcon size={22} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">No activity recorded yet</p>
            <p className="text-xs text-slate-400 mt-1">Actions like scoring, imports, and pipeline runs will appear here</p>
          </div>
        ) : (
          <div>
            {events.map((e, i) => {
              const m = ACTION_META[e.action] || fallback
              const Icon = m.icon
              return (
                <motion.div key={e.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 15) * 0.02 }}
                  className="flex items-center gap-3.5 px-5 py-3.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: m.ring }}>
                    <Icon size={14} style={{ color: m.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">
                      <span className="font-medium">{e.actor_name}</span>
                      <span className="text-slate-500"> · {e.detail || m.label}</span>
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{e.actor_email}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0 ${ROLE_STYLE[e.actor_role] || ROLE_STYLE.system}`}>
                    {e.actor_role}
                  </span>
                  <span className="text-[11px] text-slate-400 flex-shrink-0 w-16 text-right">{timeAgo(e.ts)}</span>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}
