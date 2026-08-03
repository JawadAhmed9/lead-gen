import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Phone, FileCheck, Flame, Trophy, Target as TargetIcon, CalendarClock, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { performanceApi, tasksApi } from './api'
import { useAuth, pageAnim } from './App'
import { fmtNum, Skeleton } from './ui'

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-panel text-xs">
      <p className="text-slate-500 mb-1">{label}</p>
      {payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: <b>{p.value}</b></p>)}
    </div>
  )
}

// actual bars vs a target line
function TargetChart({ title, data, actualKey, targetKey, color }) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={170}>
        <ComposedChart data={data}>
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8' }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8' }} width={26} allowDecimals={false} />
          <Tooltip content={<ChartTip />} cursor={{ fill: '#F8FAFC' }} />
          <Bar dataKey={actualKey} name="actual" radius={[4, 4, 0, 0]} maxBarSize={34}>
            {data.map((d, i) => (
              <Cell key={i} fill={d[actualKey] >= d[targetKey] ? color : '#CBD5E1'} />
            ))}
          </Bar>
          <Line dataKey={targetKey} name="target" stroke="#0F172A" strokeWidth={2} strokeDasharray="4 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function TodayCard({ icon: Icon, label, value, target, color }) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0
  const hit = target && value >= target
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + '18' }}>
          <Icon size={15} style={{ color }} />
        </div>
        {hit && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Target hit 🎯</span>}
      </div>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}<span className="text-sm font-medium text-slate-400"> / {target}</span></p>
      <p className="text-xs text-slate-500 mt-0.5">{label} today</p>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }}
          className="h-full rounded-full" style={{ background: hit ? '#059669' : color }} />
      </div>
    </div>
  )
}

export default function AgentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [series, setSeries] = useState(null)
  const [me, setMe] = useState(null)
  const [board, setBoard] = useState(null)
  const [taskCounts, setTaskCounts] = useState(null)

  useEffect(() => {
    performanceApi.daily({ days: 7 }).then(r => setSeries(r.series)).catch(() => setSeries([]))
    performanceApi.agent(user.id).then(setMe).catch(() => setMe(null))
    performanceApi.leaderboard().then(setBoard).catch(() => setBoard(null))
    tasksApi.mine().then(r => setTaskCounts(r.counts)).catch(() => {})
  }, [user.id])

  const today = series?.[series.length - 1]
  const m = me?.metrics
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const myRank = board?.agents?.find(a => a.id === user.id)?.rank

  if (!series) {
    return (
      <motion.div {...pageAnim} className="p-8 max-w-[1100px]">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">My Dashboard</h1>
        <div className="grid grid-cols-2 gap-4 mb-5">{[0, 1].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        <div className="grid grid-cols-2 gap-5">{[0, 1].map(i => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>
      </motion.div>
    )
  }

  return (
    <motion.div {...pageAnim} className="p-8 max-w-[1100px]">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{greeting}, {user.name?.split(' ')[0]}</h1>
          <p className="text-sm text-slate-500 mt-1">Your targets, activity, and where you stand on the team.</p>
        </div>
        {myRank && (
          <div className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl">
            <Trophy size={15} className="text-amber-500" />
            <span className="text-sm text-slate-600">Rank <b className="text-slate-900">#{myRank}</b></span>
          </div>
        )}
      </div>

      {/* Tasks due strip */}
      {taskCounts && taskCounts.open > 0 && (
        <button onClick={() => navigate('/myday')}
          className="w-full flex items-center gap-3 mb-6 px-5 py-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors text-left">
          <CalendarClock size={18} className="text-violet-500" />
          <span className="text-sm text-slate-700">
            You have <b>{taskCounts.open}</b> open task{taskCounts.open === 1 ? '' : 's'}
            {taskCounts.overdue > 0 && <span className="text-red-500"> · {taskCounts.overdue} overdue</span>}
            {taskCounts.today > 0 && <span className="text-slate-500"> · {taskCounts.today} due today</span>}
          </span>
          <span className="ml-auto text-xs text-slate-400 flex items-center gap-1">Open My Day <ChevronRight size={13} /></span>
        </button>
      )}

      {/* Today vs target */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <TodayCard icon={Phone} label="Calls" value={today?.calls || 0} target={today?.target_calls || 0} color="#0891B2" />
        <TodayCard icon={FileCheck} label="RFQs" value={today?.rfqs || 0} target={today?.target_rfqs || 0} color="#059669" />
      </div>

      {/* 7-day target vs actual */}
      <div className="grid grid-cols-2 gap-5 mb-6">
        <TargetChart title="Calls — last 7 days vs target" data={series} actualKey="calls" targetKey="target_calls" color="#0891B2" />
        <TargetChart title="RFQs — last 7 days vs target" data={series} actualKey="rfqs" targetKey="target_rfqs" color="#059669" />
      </div>

      {/* My numbers */}
      {m && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Points', value: fmtNum(m.points) },
            { label: 'RFQs secured', value: m.rfqs },
            { label: 'Avg interest', value: m.avg_interest || '—' },
            { label: 'Call time', value: `${m.call_minutes || 0}m` },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-100 rounded-xl p-5">
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Team leaderboard (compact) */}
      {board?.agents?.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={14} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">Team leaderboard</h3>
          </div>
          <div className="space-y-1.5">
            {board.agents.slice(0, 6).map(a => (
              <div key={a.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${a.id === user.id ? 'bg-blue-50' : ''}`}>
                <span className="w-6 text-slate-400 tabular-nums">{a.rank}</span>
                <span className="flex-1 font-medium text-slate-800">{a.name}{a.id === user.id && <span className="text-blue-500 text-xs ml-1">(you)</span>}</span>
                <span className="text-xs text-slate-500">{a.rfqs} RFQ</span>
                <span className="font-bold text-slate-900 tabular-nums w-14 text-right">{fmtNum(a.points)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
