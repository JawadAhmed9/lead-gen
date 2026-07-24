import React, { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  DollarSign, Target, Users, Coins, MailCheck, Flame, TrendingUp,
  RefreshCw, FileDown, Save, MapPin, Layers, Building2, BarChart3, Sliders,
} from 'lucide-react'
import { analyticsApi, can } from './api'
import { useAuth, pageAnim } from './App'
import { useToast, fmtMoney, fmtNum, Skeleton } from './ui'

// ─── Small building blocks ────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color, ring, delay = 0, big }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      className="bg-white border border-slate-100 rounded-xl p-5 hover:shadow-card transition-shadow">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: ring }}>
        <Icon size={15} style={{ color }} strokeWidth={2} />
      </div>
      <p className={`font-bold text-slate-900 tabular-nums ${big ? 'text-3xl' : 'text-2xl'}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </motion.div>
  )
}

// horizontal ranked bar list
function BarList({ title, icon: Icon, items, colorFn, valueFmt = fmtNum, footnote }) {
  const max = Math.max(1, ...items.map(i => i.count))
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        {Icon && <Icon size={14} className="text-slate-400" />}
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="space-y-2.5">
        {items.length === 0 && <p className="text-xs text-slate-400 py-3">No data</p>}
        {items.map((it, i) => (
          <div key={it.key + i}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600 truncate pr-2">{it.key}</span>
              <span className="font-semibold text-slate-900 tabular-nums flex-shrink-0">{valueFmt(it.count)}</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${(it.count / max) * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.03 }}
                className="h-full rounded-full" style={{ background: colorFn ? colorFn(it, i) : '#3B82F6' }} />
            </div>
          </div>
        ))}
      </div>
      {footnote && <p className="text-[11px] text-slate-400 mt-3">{footnote}</p>}
    </div>
  )
}

// funnel with conversion rates
function Funnel({ funnel }) {
  const top = funnel[0]?.count || 1
  const colors = ['#94A3B8', '#3B82F6', '#8B5CF6', '#10B981']
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Conversion Funnel</h2>
          <p className="text-xs text-slate-500 mt-0.5">Stage-to-stage conversion on live data</p>
        </div>
        <TrendingUp size={16} className="text-slate-300" />
      </div>
      <div className="space-y-3">
        {funnel.map((s, i) => (
          <div key={s.stage}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-700">{s.stage}</span>
              <span className="text-xs text-slate-500 tabular-nums">
                {fmtNum(s.count)}
                {i > 0 && <span className="ml-2 text-slate-400">{s.rate_from_prev}% of prev</span>}
              </span>
            </div>
            <div className="h-7 bg-slate-50 rounded-lg overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${(s.count / top) * 100}%` }}
                transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.06 }}
                className="h-full rounded-lg flex items-center justify-end pr-2"
                style={{ background: colors[i % colors.length], minWidth: 28 }}>
              </motion.div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PDF / print report ───────────────────────────────────────────────────────
function exportReport(ov, seg, econ) {
  const now = new Date().toLocaleString()
  const row = (a, b) => `<tr><td>${a}</td><td style="text-align:right;font-weight:600">${b}</td></tr>`
  const barRows = (arr) => arr.map(x => row(x.key, fmtNum(x.count))).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Lead Pipeline — Executive Summary</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#0F172A;max-width:820px;margin:32px auto;padding:0 24px}
    h1{font-size:22px;margin:0 0 2px} .sub{color:#64748B;font-size:13px;margin-bottom:24px}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#475569;margin:26px 0 10px;border-bottom:1px solid #E2E8F0;padding-bottom:6px}
    .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .kpi{border:1px solid #E2E8F0;border-radius:10px;padding:14px}
    .kpi .v{font-size:22px;font-weight:700} .kpi .l{font-size:11px;color:#64748B;margin-top:2px}
    table{width:100%;border-collapse:collapse;font-size:13px} td{padding:5px 0;border-bottom:1px solid #F1F5F9}
    .foot{margin-top:30px;font-size:11px;color:#94A3B8}
    @media print{body{margin:0}}
  </style></head><body>
    <h1>Lead Pipeline — Executive Summary</h1>
    <div class="sub">Industrial automation · GCC · generated ${now}</div>
    <h2>Business outcomes</h2>
    <div class="kpis">
      <div class="kpi"><div class="v">${fmtMoney(econ.weighted_value)}</div><div class="l">Weighted pipeline value</div></div>
      <div class="kpi"><div class="v">${fmtMoney(econ.pipeline_value)}</div><div class="l">Total pipeline value</div></div>
      <div class="kpi"><div class="v">${fmtNum(ov.totals.qualified)}</div><div class="l">Qualified leads</div></div>
      <div class="kpi"><div class="v">${econ.cost_per_qualified != null ? '$' + econ.cost_per_qualified : '—'}</div><div class="l">Cost / qualified lead</div></div>
      <div class="kpi"><div class="v">${ov.data_quality.contactable_rate}%</div><div class="l">Contactable rate</div></div>
      <div class="kpi"><div class="v">${fmtNum(ov.totals.high_intent)}</div><div class="l">High-intent leads</div></div>
    </div>
    <h2>Conversion funnel</h2>
    <table>${ov.funnel.map((s, i) => row(s.stage + (i ? ` (${s.rate_from_prev}% of prev)` : ''), fmtNum(s.count))).join('')}</table>
    <h2>Market coverage — by country</h2><table>${barRows(seg.by_country)}</table>
    <h2>Top target industries</h2><table>${barRows(seg.by_industry.slice(0, 8))}</table>
    <h2>Highest-scoring companies</h2>
    <table>${seg.top_companies.map(c => row(c.company, 'avg ' + c.avg_score)).join('')}</table>
    <div class="foot">Assumptions: avg deal size ${fmtMoney(econ.avg_deal_size, { compact: false })}, win rate ${Math.round(econ.win_rate * 100)}%, monthly tooling cost ${fmtMoney(econ.monthly_cost, { compact: false })}. Figures computed live from the lead database.</div>
  </body></html>`
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(html); w.document.close()
  setTimeout(() => w.print(), 350)
  return true
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Analytics() {
  const { user } = useAuth()
  const { push } = useToast()
  const [ov, setOv] = useState(null)
  const [seg, setSeg] = useState(null)
  const [loading, setLoading] = useState(true)
  // live economics assumptions (client-side recompute; persisted on Save)
  const [deal, setDeal] = useState(25000)
  const [win, setWin] = useState(0.20)
  const [cost, setCost] = useState(130)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const [o, s] = await Promise.all([
      analyticsApi.overview().catch(() => null),
      analyticsApi.segments().catch(() => null),
    ])
    if (o) {
      setOv(o)
      setDeal(o.economics.avg_deal_size || 25000)
      setWin(o.economics.win_rate || 0.20)
      setCost(o.economics.monthly_cost || 130)
    }
    if (s) setSeg(s)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // live recompute of outcome numbers from the sliders
  const econ = useMemo(() => {
    const qualified = ov?.totals?.qualified || 0
    const pipeline_value = qualified * deal
    return {
      avg_deal_size: deal, win_rate: win, monthly_cost: cost,
      pipeline_value, weighted_value: pipeline_value * win,
      cost_per_qualified: qualified ? +(cost / qualified).toFixed(2) : null,
    }
  }, [ov, deal, win, cost])

  const saveEcon = async () => {
    setSaving(true)
    try {
      await analyticsApi.saveEconomics({ avg_deal_size: deal, win_rate: win, monthly_cost: cost })
      push('Assumptions saved', 'success')
    } catch (e) { push(`Save failed: ${e.message}`, 'error') }
    finally { setSaving(false) }
  }

  if (loading || !ov || !seg) {
    return (
      <motion.div {...pageAnim} className="p-8 max-w-[1400px]">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mb-6">Analytics</h1>
        <div className="grid grid-cols-3 gap-4 mb-6">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        <div className="grid grid-cols-2 gap-5">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>
      </motion.div>
    )
  }

  const dq = ov.data_quality
  const editable = can(user, 'edit')

  // Empty state — nothing collected yet
  if ((ov.totals?.total_leads || 0) === 0) {
    return (
      <motion.div {...pageAnim} className="p-8 max-w-[1400px]">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mb-1">Analytics</h1>
        <p className="text-sm text-slate-500 mb-8">Business outcomes and market coverage</p>
        <div className="bg-white border border-slate-100 rounded-xl py-20 text-center">
          <BarChart3 size={26} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600">No leads yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Collect leads from Apollo on the Pipeline page, or import a spreadsheet from the Leads page —
            analytics populate automatically.
          </p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div {...pageAnim} className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Business outcomes and market coverage — computed live from the pipeline</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load}
            className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => { if (!exportReport(ov, seg, econ)) push('Allow pop-ups to export the report', 'error') }}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors">
            <FileDown size={14} /> Export report
          </button>
        </div>
      </div>

      {/* Outcome KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard icon={DollarSign} label="Weighted pipeline value" big delay={0}
          value={fmtMoney(econ.weighted_value)} sub={`at ${Math.round(win * 100)}% win rate`}
          color="#059669" ring="#ECFDF5" />
        <KpiCard icon={Target} label="Total pipeline value" delay={0.05}
          value={fmtMoney(econ.pipeline_value)} sub={`${fmtNum(ov.totals.qualified)} qualified × ${fmtMoney(deal)}`}
          color="#2563EB" ring="#EFF6FF" />
        <KpiCard icon={Coins} label="Cost per qualified lead" delay={0.1}
          value={econ.cost_per_qualified != null ? `$${econ.cost_per_qualified}` : '—'}
          sub={`${fmtMoney(cost, { compact: false })}/mo tooling`} color="#D97706" ring="#FFFBEB" />
        <KpiCard icon={Users} label="Qualified leads" delay={0.15}
          value={fmtNum(ov.totals.qualified)} sub={`${ov.conversion.overall_qualify_rate}% of all collected`}
          color="#7C3AED" ring="#F5F3FF" />
        <KpiCard icon={MailCheck} label="Contactable rate" delay={0.2}
          value={`${dq.contactable_rate}%`} sub={`${fmtNum(dq.verified_email)} verified emails`}
          color="#0891B2" ring="#ECFEFF" />
        <KpiCard icon={Flame} label="High-intent leads" delay={0.25}
          value={fmtNum(ov.totals.high_intent)} sub={`${fmtNum(ov.totals.unique_companies)} unique companies`}
          color="#DC2626" ring="#FEF2F2" />
      </div>

      {/* Assumptions editor */}
      <div className="bg-white border border-slate-100 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sliders size={14} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">Value assumptions</h3>
            <span className="text-[11px] text-slate-400">— adjust to model your own economics</span>
          </div>
          {editable && (
            <button onClick={saveEcon} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
              <Save size={12} /> {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-600">Avg deal size</span>
              <span className="font-semibold text-slate-900">{fmtMoney(deal, { compact: false })}</span>
            </div>
            <input type="range" min="5000" max="200000" step="5000" value={deal} disabled={!editable}
              onChange={e => setDeal(+e.target.value)} className="w-full accent-slate-900" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-600">Win rate</span>
              <span className="font-semibold text-slate-900">{Math.round(win * 100)}%</span>
            </div>
            <input type="range" min="0.05" max="0.6" step="0.01" value={win} disabled={!editable}
              onChange={e => setWin(+e.target.value)} className="w-full accent-slate-900" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-600">Monthly tooling cost</span>
              <span className="font-semibold text-slate-900">{fmtMoney(cost, { compact: false })}</span>
            </div>
            <input type="range" min="0" max="1000" step="10" value={cost} disabled={!editable}
              onChange={e => setCost(+e.target.value)} className="w-full accent-slate-900" />
          </div>
        </div>
      </div>

      {/* Funnel + score histogram */}
      <div className="grid grid-cols-2 gap-5 mb-6">
        <Funnel funnel={ov.funnel} />
        <BarList title="ICP score distribution" icon={BarChart3}
          items={seg.score_histogram}
          colorFn={(it) => it.qualified ? '#10B981' : '#CBD5E1'}
          footnote={`Green = at or above the qualification threshold (${seg.min_icp_score}). Sent & Replied stages are Phase 2.`} />
      </div>

      {/* Market intelligence */}
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Market intelligence</h2>
      <div className="grid grid-cols-3 gap-5 mb-6">
        <BarList title="By country" icon={MapPin} items={seg.by_country}
          colorFn={(it) => seg.gcc_countries.includes(it.key) ? '#3B82F6' : '#CBD5E1'}
          footnote="Blue = GCC target market" />
        <BarList title="By industry" icon={Layers} items={seg.by_industry} colorFn={() => '#8B5CF6'} />
        <BarList title="By company size" icon={Building2} items={seg.by_size} colorFn={() => '#0891B2'} />
      </div>

      {/* Top companies */}
      <div className="bg-white border border-slate-100 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={14} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">Highest-scoring companies</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <th className="py-2 pr-4">Company</th>
                <th className="py-2 px-4 text-center">Contacts</th>
                <th className="py-2 px-4 text-center">Avg score</th>
                <th className="py-2 pl-4 text-center">Best</th>
              </tr>
            </thead>
            <tbody>
              {seg.top_companies.map((c, i) => (
                <tr key={c.company + i} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 pr-4 text-slate-800 font-medium">{c.company}</td>
                  <td className="py-2.5 px-4 text-center text-slate-500 tabular-nums">{c.contacts}</td>
                  <td className="py-2.5 px-4 text-center">
                    <span className="inline-flex items-center justify-center min-w-[36px] px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums"
                      style={{ background: c.avg_score >= 70 ? '#ECFDF5' : '#EFF6FF', color: c.avg_score >= 70 ? '#059669' : '#2563EB' }}>
                      {c.avg_score}
                    </span>
                  </td>
                  <td className="py-2.5 pl-4 text-center text-slate-500 tabular-nums">{c.best_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}
