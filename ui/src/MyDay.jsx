import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Mail, Check, Clock, CalendarClock, RefreshCw, ListChecks, Building2 } from 'lucide-react'
import { tasksApi } from './api'
import { useAuth, pageAnim } from './App'
import { useToast, Skeleton } from './ui'
import CallConsole from './CallConsole'

const TYPE_META = {
  call:     { icon: Phone, color: '#0891B2' },
  email:    { icon: Mail,  color: '#2563EB' },
  followup: { icon: CalendarClock, color: '#7C3AED' },
  todo:     { icon: ListChecks, color: '#64748B' },
}
const today = () => new Date().toISOString().slice(0, 10)
const fmtDue = (d) => {
  if (!d) return ''
  const t = today()
  if (d < t) return 'Overdue'
  if (d === t) return 'Today'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function TaskRow({ t, onDone, onCall }) {
  const meta = TYPE_META[t.type] || TYPE_META.todo
  const Icon = meta.icon
  const name = [t.first_name, t.last_name].filter(Boolean).join(' ') || t.company || 'Lead'
  const overdue = t.due_at && t.due_at < today()
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 20 }}
      className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-100 rounded-xl">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.color + '18' }}>
        <Icon size={15} style={{ color: meta.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
        <p className="text-xs text-slate-500 truncate flex items-center gap-1">
          <Building2 size={10} /> {t.company || name}
          {t.sequence && <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">{t.sequence}</span>}
        </p>
      </div>
      <span className={`text-xs font-medium ${overdue ? 'text-red-500' : 'text-slate-400'}`}>{fmtDue(t.due_at)}</span>
      {t.type === 'call' && (
        <button onClick={() => onCall(t)} title="Start call"
          className="p-1.5 rounded-lg text-cyan-600 hover:bg-cyan-50 transition-colors"><Phone size={15} /></button>
      )}
      <button onClick={() => onDone(t)} title="Mark done"
        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"><Check size={16} /></button>
    </motion.div>
  )
}

export default function MyDay() {
  const { user } = useAuth()
  const { push } = useToast()
  const [data, setData] = useState(null)
  const [callLead, setCallLead] = useState(null)

  const load = () => tasksApi.mine().then(setData).catch(() => setData({ tasks: [], counts: {} }))
  useEffect(() => { load() }, [])

  const done = async (t) => {
    setData(d => ({ ...d, tasks: d.tasks.filter(x => x.id !== t.id) }))
    await tasksApi.complete(t.id).catch(() => {})
    push('Task completed', 'success')
  }
  const call = (t) => setCallLead({
    id: t.lead_id, first_name: t.first_name, last_name: t.last_name,
    company: t.company, phone: t.phone, email: t.email,
  })

  const tasks = data?.tasks || []
  const t = today()
  const buckets = [
    ['Overdue', tasks.filter(x => x.due_at && x.due_at < t), '#DC2626'],
    ['Today', tasks.filter(x => x.due_at === t), '#0891B2'],
    ['Upcoming', tasks.filter(x => x.due_at && x.due_at > t), '#64748B'],
  ]

  return (
    <motion.div {...pageAnim} className="p-4 sm:p-6 lg:p-8 max-w-[820px]">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">My Day</h1>
          <p className="text-sm text-slate-500 mt-1">Your open follow-ups and tasks, prioritized.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white text-slate-600 text-sm rounded-lg hover:bg-slate-50">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {!data ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : tasks.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-xl py-16 text-center">
          <ListChecks size={24} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">You're all caught up 🎉</p>
          <p className="text-xs text-slate-400 mt-1">New follow-ups appear here after calls or when a lead is enrolled in a cadence.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {buckets.map(([label, items, color]) => items.length > 0 && (
            <div key={label}>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <h2 className="text-sm font-semibold text-slate-700">{label}</h2>
                <span className="text-xs text-slate-400">{items.length}</span>
              </div>
              <div className="space-y-2">
                <AnimatePresence>
                  {items.map(t => <TaskRow key={t.id} t={t} onDone={done} onCall={call} />)}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {callLead && <CallConsole lead={callLead} onClose={() => setCallLead(null)} onLogged={load} />}
      </AnimatePresence>
    </motion.div>
  )
}
