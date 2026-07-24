import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy, Phone, Mail, MessageSquare, Award, DollarSign, Users,
  RefreshCw, Sliders, Save, X, Medal, TrendingUp, Target,
} from 'lucide-react'
import { performanceApi, can } from './api'
import { useAuth, pageAnim } from './App'
import { useToast, fmtMoney, fmtNum, Skeleton } from './ui'

const MEDAL = ['#F59E0B', '#94A3B8', '#B45309'] // gold / silver / bronze

function StatCell({ icon: Icon, value, color }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" style={{ color }}>
      <Icon size={12} className="opacity-70" /> {value}
    </span>
  )
}

// ─── Per-agent detail drawer ──────────────────────────────────────────────────
function AgentDrawer({ agentId, onClose }) {
  const [data, setData] = useState(null)
  useEffect(() => { performanceApi.agent(agentId).then(setData).catch(() => setData(null)) }, [agentId])
  const m = data?.metrics

  const typeMeta = {
    call: { icon: Phone, c: '#0891B2' }, email: { icon: Mail, c: '#2563EB' },
    reply: { icon: MessageSquare, c: '#7C3AED' }, deal: { icon: Award, c: '#059669' },
    note: { icon: Target, c: '#94A3B8' },
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="absolute right-0 top-0 bottom-0 w-[440px] bg-white shadow-panel flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold">
              {data?.agent?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{data?.agent?.name || 'Agent'}</p>
              <p className="text-xs text-slate-500">{data?.agent?.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16} className="text-slate-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {!data ? [...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-100 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Points</p>
                  <p className="text-3xl font-bold text-slate-900">{fmtNum(m.points)}</p>
                </div>
                <div className="rounded-xl border border-slate-100 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Revenue won</p>
                  <p className="text-3xl font-bold text-emerald-600">{fmtMoney(m.revenue)}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['Calls', m.calls], ['Emails', m.emails], ['Replies', m.replies], ['Deals', m.deals_won]].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-slate-50 py-3">
                    <p className="text-lg font-bold text-slate-800">{fmtNum(v)}</p>
                    <p className="text-[10px] text-slate-500">{l}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm px-1">
                <span className="text-slate-500">Leads assigned</span><span className="font-semibold">{m.leads_assigned}</span>
              </div>
              <div className="flex items-center justify-between text-sm px-1">
                <span className="text-slate-500">Win conversion</span><span className="font-semibold">{m.conversion}%</span>
              </div>
              <div>
                <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Recent activity</h3>
                {data.recent.length === 0 && <p className="text-xs text-slate-400">No activity yet</p>}
                <div className="space-y-2">
                  {data.recent.map(a => {
                    const meta = typeMeta[a.type] || typeMeta.note
                    const Icon = meta.icon
                    const who = [a.first_name, a.last_name].filter(Boolean).join(' ') || a.company || 'lead'
                    return (
                      <div key={a.id} className="flex items-center gap-2.5 text-sm">
                        <Icon size={13} style={{ color: meta.c }} />
                        <span className="capitalize text-slate-700">{a.type}</span>
                        <span className="text-slate-400 truncate flex-1">{a.outcome ? `· ${a.outcome} ` : ''}· {who}</span>
                        {a.value ? <span className="text-emerald-600 font-medium">{fmtMoney(a.value)}</span> : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </motion.aside>
    </div>
  )
}

// ─── Weights editor ───────────────────────────────────────────────────────────
function WeightsEditor({ weights, onSaved }) {
  const { push } = useToast()
  const [w, setW] = useState(weights)
  const [saving, setSaving] = useState(false)
  useEffect(() => setW(weights), [weights])
  const fields = [
    ['deal_won', 'Deal won'], ['revenue_per_1k', 'Per $1k revenue'],
    ['reply', 'Reply'], ['call', 'Call'], ['email', 'Email'],
  ]
  const save = async () => {
    setSaving(true)
    try { const saved = await performanceApi.saveWeights(w); push('Scoring weights saved', 'success'); onSaved?.(saved) }
    catch (e) { push(`Save failed: ${e.message}`, 'error') }
    finally { setSaving(false) }
  }
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sliders size={14} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">Scoring weights</h3>
          <span className="text-[11px] text-slate-400">— points awarded per action</span>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <Save size={12} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="grid grid-cols-5 gap-4">
        {fields.map(([k, label]) => (
          <div key={k}>
            <label className="block text-[11px] text-slate-500 mb-1">{label}</label>
            <input type="number" value={w[k] ?? 0}
              onChange={e => setW(s => ({ ...s, [k]: Number(e.target.value) }))}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm tabular-nums
                         focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Performance() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [drawerId, setDrawerId] = useState(null)
  const [range, setRange] = useState('all')  // all | 30 | 7

  const load = async () => {
    setLoading(true)
    const params = {}
    if (range !== 'all') {
      const d = new Date(); d.setDate(d.getDate() - Number(range))
      params.frm = d.toISOString().slice(0, 10)
    }
    const res = await performanceApi.leaderboard(params).catch(() => null)
    setData(res); setLoading(false)
  }
  useEffect(() => { load() }, [range])

  const agents = data?.agents || []
  const top3 = agents.slice(0, 3)

  return (
    <motion.div {...pageAnim} className="p-8 max-w-[1200px]">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Leaderboard</h1>
          <p className="text-sm text-slate-500 mt-1">Effort- and outcome-based performance across the team</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {[['all', 'All time'], ['30', '30d'], ['7', '7d']].map(([v, l]) => (
              <button key={v} onClick={() => setRange(v)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${range === v ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={load} className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white text-slate-600 text-sm rounded-lg hover:bg-slate-50">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {can(user, 'manage') && data?.weights && <WeightsEditor weights={data.weights} onSaved={() => load()} />}

      {/* Podium */}
      {!loading && top3.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {top3.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
              onClick={() => setDrawerId(a.id)}
              className="bg-white border border-slate-100 rounded-xl p-5 cursor-pointer hover:shadow-card transition-shadow relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: MEDAL[i] }} />
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold" style={{ background: MEDAL[i] }}>
                  {a.name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Medal size={14} style={{ color: MEDAL[i] }} />
                    <p className="font-semibold text-slate-900 truncate">{a.name}</p>
                  </div>
                  <p className="text-xs text-slate-500">Rank #{a.rank}</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">{fmtNum(a.points)}<span className="text-sm font-medium text-slate-400 ml-1">pts</span></p>
              <div className="flex gap-3 mt-2 text-xs text-slate-500">
                <StatCell icon={Award} value={a.deals_won} color="#059669" />
                <StatCell icon={DollarSign} value={fmtMoney(a.revenue)} color="#059669" />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Zero-activity hint */}
      {!loading && agents.length > 0 && data?.totals &&
        (data.totals.calls + data.totals.emails + data.totals.replies + data.totals.deals_won) === 0 && (
        <div className="mb-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-500">
          No activity logged yet — the leaderboard fills in as agents log calls, emails, replies, and deals from their leads.
        </div>
      )}

      {/* Full table */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50/60">
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3 text-right">Points</th>
                <th className="px-4 py-3 text-center">Calls</th>
                <th className="px-4 py-3 text-center">Emails</th>
                <th className="px-4 py-3 text-center">Replies</th>
                <th className="px-4 py-3 text-center">Deals</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-center">Assigned</th>
                <th className="px-4 py-3 text-right">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? [...Array(4)].map((_, i) => (
                <tr key={i} className="border-b border-slate-50"><td colSpan={10} className="px-4 py-4"><Skeleton className="h-4 rounded" /></td></tr>
              )) : agents.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-16 text-center text-sm text-slate-400">
                  No agents yet. Add agents in Team, assign them leads, and activity will appear here.
                </td></tr>
              ) : agents.map(a => (
                <tr key={a.id} onClick={() => setDrawerId(a.id)}
                  className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors cursor-pointer">
                  <td className="px-4 py-3">
                    {a.rank <= 3
                      ? <Medal size={15} style={{ color: MEDAL[a.rank - 1] }} />
                      : <span className="text-slate-400 tabular-nums">{a.rank}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-semibold">{a.name[0]?.toUpperCase()}</div>
                      <span className="font-medium text-slate-800">{a.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">{fmtNum(a.points)}</td>
                  <td className="px-4 py-3 text-center text-slate-600 tabular-nums">{a.calls}</td>
                  <td className="px-4 py-3 text-center text-slate-600 tabular-nums">{a.emails}</td>
                  <td className="px-4 py-3 text-center text-slate-600 tabular-nums">{a.replies}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ background: a.deals_won ? '#ECFDF5' : '#F8FAFC', color: a.deals_won ? '#059669' : '#94A3B8' }}>{a.deals_won}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-600 font-medium tabular-nums">{a.revenue ? fmtMoney(a.revenue) : '—'}</td>
                  <td className="px-4 py-3 text-center text-slate-500 tabular-nums">{a.leads_assigned}</td>
                  <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{a.conversion}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {drawerId && <AgentDrawer agentId={drawerId} onClose={() => setDrawerId(null)} />}
      </AnimatePresence>
    </motion.div>
  )
}
