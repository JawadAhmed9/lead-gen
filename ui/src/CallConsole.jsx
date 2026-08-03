import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Phone, PhoneOff, Clock, X, Check, FileText, ChevronRight,
  FileCheck, DollarSign, Building2, Sparkles,
} from 'lucide-react'
import { callApi, scriptsApi } from './api'
import { useToast } from './ui'

const DEFAULT_SCRIPT = [
  { phase: 'Opening', seconds: 30, color: '#2563EB', points: [
    'Introduce yourself and Stemronic in one line.',
    "Confirm you're speaking with the right person.",
    'State the reason for the call — no pitch yet.',
    'Ask permission: “Do you have two minutes?”',
  ]},
  { phase: 'Discovery', seconds: 120, color: '#7C3AED', points: [
    'Ask about their current automation / manual processes.',
    'Probe pain: downtime, quality, lack of visibility.',
    'Qualify: projects, budget, timeline, decision maker.',
    'Listen more than you talk — take notes below.',
  ]},
  { phase: 'Value & Close', seconds: 90, color: '#059669', points: [
    'Connect one pain to one Stemronic solution.',
    'Propose a next step: info, demo, or an RFQ.',
    'Ask directly: “Can we prepare an RFQ for you?”',
    'Confirm follow-up date before hanging up.',
  ]},
]

const DISPOSITIONS = ['connected', 'voicemail', 'no answer', 'callback', 'not interested']
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function CallConsole({ lead, onClose, onLogged }) {
  const { push } = useToast()
  const [scripts, setScripts] = useState([])          // available scripts (by category)
  const [scriptId, setScriptId] = useState('')
  const [script, setScript] = useState(DEFAULT_SCRIPT) // active steps
  const [phase, setPhase] = useState('live')          // live | wrap
  const [elapsed, setElapsed] = useState(0)
  const [activeIdx, setActiveIdx] = useState(0)
  const pickedRef = useRef(false)
  const [liveNotes, setLiveNotes] = useState('')
  // wrap-up
  const [outcome, setOutcome] = useState('connected')
  const [rfqSecured, setRfqSecured] = useState(false)
  const [rfqCount, setRfqCount] = useState(1)
  const [rfqValue, setRfqValue] = useState('')
  const [interest, setInterest] = useState(null)   // 1–10
  const [wrapNotes, setWrapNotes] = useState('')
  const [followUp, setFollowUp] = useState(0)      // days; 0 = none
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    scriptsApi.list().then(r => {
      const list = r?.scripts || []
      setScripts(list)
      const def = list.find(s => s.is_default) || list[0]
      if (def) { setScriptId(def.id); if (def.steps?.length) setScript(def.steps) }
    }).catch(() => {})
  }, [])

  const pickScript = (id) => {
    const s = scripts.find(x => x.id === id)
    if (!s) return
    setScriptId(id); if (s.steps?.length) setScript(s.steps)
    pickedRef.current = false; setActiveIdx(0)
  }

  // live timer
  useEffect(() => {
    if (phase !== 'live') return
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [phase])

  // suggest the phase based on elapsed time (until the agent manually picks one)
  useEffect(() => {
    if (pickedRef.current) return
    let cum = 0, idx = 0
    for (let i = 0; i < script.length; i++) { cum += script[i].seconds; if (elapsed < cum) { idx = i; break } idx = i }
    setActiveIdx(idx)
  }, [elapsed, script])

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.company || 'Lead'
  const active = script[activeIdx] || script[0]

  const endCall = () => setPhase('wrap')

  const save = async () => {
    setSaving(true)
    try {
      await callApi.log(lead.id, {
        duration: elapsed, outcome, live_notes: liveNotes, wrap_notes: wrapNotes,
        rfq_secured: rfqSecured, rfq_count: rfqSecured ? Number(rfqCount) || 0 : 0,
        rfq_value: rfqSecured && rfqValue ? Number(rfqValue) : null,
        interest: interest || null,
        follow_up_days: followUp || 0,
      })
      push(`Call logged — ${mmss(elapsed)}${rfqSecured ? ` · ${rfqCount} RFQ` : ''}${interest ? ` · interest ${interest}/10` : ''}`, 'success')
      onLogged?.(); onClose()
    } catch (e) { push(`Could not save call: ${e.message}`, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative w-full max-w-3xl bg-white rounded-2xl shadow-panel overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header — live call bar */}
        <div className="bg-navy-900 text-white px-6 py-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center font-semibold flex-shrink-0">
            {(lead.first_name?.[0] || lead.company?.[0] || '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{name}</p>
            <p className="text-xs text-slate-300 truncate flex items-center gap-1.5">
              <Building2 size={11} /> {lead.company || '—'}
              {lead.phone && <span className="ml-2 font-mono">{lead.phone}</span>}
            </p>
          </div>
          {/* timer */}
          <div className="flex items-center gap-2">
            {phase === 'live' && (
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}
                className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            )}
            <span className="text-2xl font-bold tabular-nums tracking-tight">{mmss(elapsed)}</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg ml-1"><X size={16} /></button>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'live' ? (
            <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto">
              {/* script selector — pick by client category */}
              {scripts.length > 0 && (
                <div className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-100 bg-slate-50/50">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wide">Script</span>
                  <select value={scriptId} onChange={e => pickScript(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {scripts.map(s => <option key={s.id} value={s.id}>{s.category} — {s.name}</option>)}
                  </select>
                  <span className="text-[11px] text-slate-400">choose by client type</span>
                </div>
              )}
              {/* phase stepper */}
              <div className="flex border-b border-slate-100">
                {script.map((s, i) => (
                  <button key={s.phase} onClick={() => { pickedRef.current = true; setActiveIdx(i) }}
                    className={`flex-1 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors
                                ${i === activeIdx ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                      {s.phase}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-0">
                {/* talking points */}
                <div className="p-5 border-r border-slate-100">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Sparkles size={13} style={{ color: active.color }} />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{active.phase} — what to say</p>
                  </div>
                  <motion.ul key={activeIdx} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="space-y-2.5">
                    {active.points.map((p, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-700 leading-snug">
                        <ChevronRight size={15} className="flex-shrink-0 mt-0.5" style={{ color: active.color }} />
                        {p}
                      </li>
                    ))}
                  </motion.ul>
                </div>

                {/* live notes */}
                <div className="p-5">
                  <div className="flex items-center gap-1.5 mb-3">
                    <FileText size={13} className="text-slate-400" />
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Live notes</p>
                  </div>
                  <textarea value={liveNotes} onChange={e => setLiveNotes(e.target.value)}
                    placeholder="Jot down what they say as you go…"
                    className="w-full h-44 px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none
                               focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="px-5 pb-5 pt-1">
                <button onClick={endCall}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 text-white
                             font-semibold rounded-xl transition-colors">
                  <PhoneOff size={16} /> End Call
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="wrap" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 flex items-center gap-2 text-sm text-slate-600">
                <Clock size={14} className="text-slate-400" /> Call lasted <b className="text-slate-900">{mmss(elapsed)}</b>. Wrap it up below.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Outcome</label>
                <div className="flex flex-wrap gap-2">
                  {DISPOSITIONS.map(d => (
                    <button key={d} onClick={() => setOutcome(d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors
                                  ${outcome === d ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interest rating */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Lead interest after this call (1–10)</label>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <button key={n} onClick={() => setInterest(n)}
                      className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors
                                  ${interest === n ? 'text-white shadow' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      style={interest === n ? { background: n >= 8 ? '#059669' : n >= 5 ? '#D97706' : '#DC2626' } : {}}>
                      {n}
                    </button>
                  ))}
                </div>
                {interest && (
                  <p className="text-[11px] mt-1.5 font-medium"
                     style={{ color: interest >= 8 ? '#059669' : interest >= 5 ? '#D97706' : '#DC2626' }}>
                    {interest >= 8 ? '🔥 Hot lead' : interest >= 5 ? 'Warm lead' : 'Cold lead'}
                  </p>
                )}
              </div>

              {/* RFQ capture */}
              <div className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCheck size={15} className="text-emerald-600" />
                    <span className="text-sm font-medium text-slate-800">RFQ secured?</span>
                  </div>
                  <button onClick={() => setRfqSecured(v => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${rfqSecured ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${rfqSecured ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
                <AnimatePresence>
                  {rfqSecured && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden">
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1"># of RFQs</label>
                          <input type="number" min="1" value={rfqCount} onChange={e => setRfqCount(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-1">Est. value (optional)</label>
                          <div className="relative">
                            <DollarSign size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="number" value={rfqValue} onChange={e => setRfqValue(e.target.value)} placeholder="0"
                              className="w-full pl-7 pr-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Call summary</label>
                <textarea value={wrapNotes} onChange={e => setWrapNotes(e.target.value)} rows={3}
                  placeholder="How did it go? Next steps, objections, who to follow up with…"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {liveNotes && <p className="text-[11px] text-slate-400 mt-1.5">Your live notes are saved with this call too.</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Schedule a follow-up</label>
                <div className="flex flex-wrap gap-2">
                  {[[0, 'None'], [1, 'Tomorrow'], [2, 'In 2 days'], [3, 'In 3 days'], [7, 'In a week']].map(([d, l]) => (
                    <button key={d} onClick={() => setFollowUp(d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                                  ${followUp === d ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                {followUp > 0 && <p className="text-[11px] text-slate-400 mt-1.5">A follow-up task will appear in your My Day.</p>}
              </div>

              <div className="flex gap-2.5">
                <button onClick={save} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors disabled:opacity-50">
                  {saving ? 'Saving…' : <><Check size={16} /> Save call</>}
                </button>
                <button onClick={() => setPhase('live')} className="px-5 py-3 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Back</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
