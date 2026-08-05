import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Users, Target, CheckCircle, Clock,
  Send, MessageSquare, Play, RefreshCw, TrendingUp,
} from 'lucide-react'
import { statsApi, pipelineApi, can } from './api'
import { useAuth, pageAnim } from './App'

// ─── Animated counter ─────────────────────────────────────────────────────────
function Counter({ to }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!to) return
    let raf, start = null
    const dur = 600
    const step = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / dur, 1)
      setN(Math.floor(p * to))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return n.toLocaleString()
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-panel text-xs">
      <p className="text-slate-500 mb-1">{label}</p>
      <p className="font-semibold text-slate-900">{payload[0].value.toLocaleString()}</p>
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
const KPI = [
  { key: 'raw',      label: 'Total Collected', icon: Users,         color: '#64748B', ring: '#F1F5F9' },
  { key: 'enriched', label: 'Enriched',        icon: Target,        color: '#3B82F6', ring: '#EFF6FF' },
  { key: 'scored',   label: 'Scored',          icon: CheckCircle,   color: '#8B5CF6', ring: '#F5F3FF' },
  { key: 'queued',   label: 'Qualified',       icon: Clock,         color: '#F59E0B', ring: '#FFFBEB' },
  { key: 'sent',     label: 'Emails Sent',     icon: Send,          color: '#10B981', ring: '#ECFDF5', phase2: true },
  { key: 'replied',  label: 'Replies',         icon: MessageSquare, color: '#EF4444', ring: '#FEF2F2', phase2: true },
]

// Only the live stages feed the funnel chart (no empty Phase-2 bars).
const ACTIVE_KPI = KPI.filter(k => !k.phase2)
const FUNNEL_COLORS = ['#94A3B8', '#3B82F6', '#8B5CF6', '#F59E0B']

// ─── Step button ──────────────────────────────────────────────────────────────
function StepBtn({ step, label, running, onClick }) {
  return (
    <button onClick={() => onClick(step)} disabled={!!running}
      className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white rounded-lg
                 text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-300
                 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
      {running === step
        ? <RefreshCw size={13} className="animate-spin text-blue-500" />
        : <Play size={13} className="text-slate-400" />
      }
      {running === step ? `Running ${label}...` : label}
    </button>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData]       = useState(null)
  const [running, setRunning] = useState(null)

  const load = () => statsApi.get().then(setData).catch(console.error)

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  const trigger = async (step) => {
    setRunning(step)
    await pipelineApi.trigger(step).catch(console.error)
    setTimeout(() => { load(); setRunning(null) }, 2500)
  }

  const funnel = ACTIVE_KPI.map(({ key, label }) => ({ name: label, value: data?.[key] ?? 0 }))

  const convRate = data?.sent && data?.replied
    ? ((data.replied / data.sent) * 100).toFixed(1)
    : null

  return (
    <motion.div {...pageAnim} className="p-4 sm:p-6 lg:p-8 max-w-[1400px]">
      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time pipeline overview and performance metrics</p>
        </div>

        {can(user, 'edit') && (
          <div className="flex gap-2">
            {[['collect','Collect'],['enrich','Enrich'],['score','Score']].map(([s, l]) => (
              <StepBtn key={s} step={s} label={l} running={running} onClick={trigger} />
            ))}
          </div>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {KPI.map(({ key, label, icon: Icon, color, ring, phase2 }, i) => (
          <motion.div key={key}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.25 }}
            className={`bg-white border rounded-xl p-5 transition-shadow
                        ${phase2 ? 'border-dashed border-slate-200' : 'border-slate-100 hover:shadow-card'}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                   style={{ background: phase2 ? '#F8FAFC' : ring }}>
                <Icon size={15} style={{ color: phase2 ? '#CBD5E1' : color }} strokeWidth={2} />
              </div>
              {phase2 && (
                <span className="text-[10px] font-medium text-slate-400 bg-slate-50 border border-slate-200
                                 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  Phase 2
                </span>
              )}
            </div>
            <p className={`text-2xl font-bold tabular-nums ${phase2 ? 'text-slate-300' : 'text-slate-900'}`}>
              {phase2
                ? '—'
                : (data != null ? <Counter to={data[key] ?? 0} /> : <span className="skeleton inline-block w-10 h-7 rounded" />)}
            </p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Pipeline funnel */}
        <div className="col-span-2 bg-white border border-slate-100 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Pipeline Funnel</h2>
              <p className="text-xs text-slate-500 mt-0.5">Live stages — outreach (Sent, Replied) activates in Phase 2</p>
            </div>
            <TrendingUp size={16} className="text-slate-300" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={funnel} barSize={32} barCategoryGap="30%">
              <XAxis dataKey="name" axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: '#94A3B8' }} />
              <YAxis axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: '#94A3B8' }} width={36} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#F8FAFC', radius: 6 }} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                {funnel.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Reply breakdown */}
          <div className="bg-white border border-slate-100 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Reply Breakdown</h2>
            {data?.replies && Object.keys(data.replies).length > 0 ? (() => {
              const total = Object.values(data.replies).reduce((a,b) => a+b, 0)
              const colors = { interested:'#10B981', objection:'#F59E0B', unsubscribe:'#EF4444', ooo:'#94A3B8' }
              return (
                <div className="space-y-3">
                  {Object.entries(data.replies).map(([cls, n]) => (
                    <div key={cls}>
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-slate-600 capitalize">{cls}</span>
                        <span className="font-semibold text-slate-900">{n}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${(n / total) * 100}%` }}
                          transition={{ duration: 0.7, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{ background: colors[cls] || '#3B82F6' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )
            })() : (
              <p className="text-xs text-slate-400 text-center py-5">No replies recorded yet</p>
            )}
          </div>

          {/* Lead sources */}
          <div className="bg-white border border-slate-100 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Lead Sources</h2>
            {data?.by_source && Object.keys(data.by_source).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(data.by_source).map(([src, n]) => (
                  <div key={src} className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 capitalize">{src.replace('_', ' ')}</span>
                    <span className="text-xs font-semibold text-slate-900 bg-slate-50 border
                                     border-slate-100 px-2 py-0.5 rounded-md">
                      {n.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-5">Run collect to see sources</p>
            )}
          </div>
        </div>
      </div>

      {/* Daily area chart */}
      {data?.daily?.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-xl p-6">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-slate-900">Lead Intake — Last 14 Days</h2>
            <p className="text-xs text-slate-500 mt-0.5">Daily new leads collected</p>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={data.daily}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" axisLine={false} tickLine={false}
                tick={{ fontSize: 10, fill: '#94A3B8' }}
                tickFormatter={d => d?.slice(5)} />
              <YAxis axisLine={false} tickLine={false}
                tick={{ fontSize: 10, fill: '#94A3B8' }} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#E2E8F0', strokeWidth: 1 }} />
              <Area type="monotone" dataKey="leads" stroke="#3B82F6" strokeWidth={2}
                fill="url(#areaGrad)" dot={false} activeDot={{ r: 4, fill: '#3B82F6' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  )
}
