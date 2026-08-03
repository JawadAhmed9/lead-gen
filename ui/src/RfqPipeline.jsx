import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, DollarSign, TrendingUp, FileCheck, Building2, User } from 'lucide-react'
import { rfqApi } from './api'
import { pageAnim } from './App'
import { useToast, fmtMoney, Skeleton } from './ui'

const STAGE_META = {
  new:    { label: 'New',    color: '#2563EB', ring: '#EFF6FF' },
  quoted: { label: 'Quoted', color: '#7C3AED', ring: '#F5F3FF' },
  won:    { label: 'Won',    color: '#059669', ring: '#ECFDF5' },
  lost:   { label: 'Lost',   color: '#DC2626', ring: '#FEF2F2' },
}

export default function RfqPipeline() {
  const { push } = useToast()
  const [data, setData] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overStage, setOverStage] = useState(null)

  const load = () => rfqApi.list().then(setData).catch(() => setData(null))
  useEffect(() => { load() }, [])

  const move = async (id, stage) => {
    // optimistic: pull the card out and drop it into the new stage
    setData(d => {
      if (!d) return d
      const by = { ...d.by_stage }
      let card
      for (const s of d.stages) {
        const idx = by[s].findIndex(c => c.id === id)
        if (idx > -1) { card = { ...by[s][idx], stage }; by[s] = by[s].filter(c => c.id !== id) }
      }
      if (card) by[stage] = [card, ...by[stage]]
      return { ...d, by_stage: by }
    })
    try { await rfqApi.moveStage(id, stage); load() }
    catch (e) { push(`Move failed: ${e.message}`, 'error'); load() }
  }

  const onDrop = (stage) => { setOverStage(null); if (dragId) { move(dragId, stage); setDragId(null) } }

  if (!data) {
    return (
      <motion.div {...pageAnim} className="p-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">RFQ Pipeline</h1>
        <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)}</div>
      </motion.div>
    )
  }

  return (
    <motion.div {...pageAnim} className="p-8 max-w-[1300px]">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">RFQ Pipeline</h1>
          <p className="text-sm text-slate-500 mt-1">Every RFQ secured on a call lands here — drag cards across stages.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white text-slate-600 text-sm rounded-lg hover:bg-slate-50">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Forecast header */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { icon: TrendingUp, label: 'Weighted forecast', value: fmtMoney(data.forecast), color: '#2563EB', ring: '#EFF6FF' },
          { icon: DollarSign, label: 'Open pipeline', value: fmtMoney(data.open_value), color: '#7C3AED', ring: '#F5F3FF' },
          { icon: FileCheck, label: 'Won value', value: fmtMoney(data.won_value), color: '#059669', ring: '#ECFDF5' },
          { icon: FileCheck, label: 'Total RFQs', value: data.count, color: '#64748B', ring: '#F1F5F9' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-100 rounded-xl p-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: k.ring }}>
              <k.icon size={15} style={{ color: k.color }} />
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{k.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-4 gap-4">
        {data.stages.map(stage => {
          const meta = STAGE_META[stage]
          const cards = data.by_stage[stage] || []
          const colValue = cards.reduce((s, c) => s + (c.value || 0), 0)
          return (
            <div key={stage}
              onDragOver={e => { e.preventDefault(); setOverStage(stage) }}
              onDragLeave={() => setOverStage(s => s === stage ? null : s)}
              onDrop={() => onDrop(stage)}
              className={`rounded-xl border transition-colors min-h-[300px] p-2.5
                          ${overStage === stage ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-slate-50/40'}`}>
              <div className="flex items-center justify-between px-2 py-1.5 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                  <span className="text-sm font-semibold text-slate-700">{meta.label}</span>
                  <span className="text-xs text-slate-400">{cards.length}</span>
                </div>
                <span className="text-[11px] text-slate-400 tabular-nums">{colValue ? fmtMoney(colValue) : ''}</span>
              </div>
              <div className="space-y-2">
                {cards.map(c => (
                  <div key={c.id} draggable
                    onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(null)}
                    className="bg-white border border-slate-200 rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-card transition-shadow">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-900 truncate">{c.value ? fmtMoney(c.value) : '—'}</span>
                      {c.count > 1 && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded-full text-slate-500">×{c.count}</span>}
                    </div>
                    <p className="text-xs text-slate-600 truncate flex items-center gap-1"><Building2 size={10} /> {c.company || 'Lead'}</p>
                    <p className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5"><User size={9} /> {c.agent_name || '—'}</p>
                  </div>
                ))}
                {cards.length === 0 && <p className="text-[11px] text-slate-300 text-center py-6">Drop RFQs here</p>}
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
