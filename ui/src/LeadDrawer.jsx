import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Building2, Briefcase, Mail, Phone, MapPin, Users2, Globe, Linkedin,
  Zap, Sparkles, CheckCircle2, Clock, Layers, ShieldCheck, TrendingUp,
  MessageSquare, StickyNote, Award, DollarSign, Plus,
} from 'lucide-react'
import { leadsApi, can } from './api'
import { useToast, Skeleton } from './ui'

const STATUS_STYLE = {
  raw: 'bg-slate-100 text-slate-600', enriched: 'bg-blue-50 text-blue-700',
  scored: 'bg-violet-50 text-violet-700', queued: 'bg-amber-50 text-amber-700',
  sent: 'bg-emerald-50 text-emerald-700', replied: 'bg-rose-50 text-rose-700',
}

function scoreColor(v) {
  if (v == null) return '#CBD5E1'
  return v >= 70 ? '#10B981' : v >= 45 ? '#3B82F6' : '#94A3B8'
}

// horizontal factor bar
function Factor({ label, score, weight }) {
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#3B82F6' : '#94A3B8'
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-600">{label}</span>
        <span className="text-[11px] text-slate-400">
          <span className="font-semibold text-slate-700 tabular-nums">{score}</span>
          <span className="mx-1">·</span>weight {weight}%
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full" style={{ background: color }} />
      </div>
    </div>
  )
}

function Row({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={12} className="text-slate-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
        <p className={`text-sm text-slate-800 mt-0.5 break-words ${mono ? 'font-mono text-xs' : ''}`}>
          {value || <span className="text-slate-300">—</span>}
        </p>
      </div>
    </div>
  )
}

export default function LeadDrawer({ leadId, user, onClose, onCompose, onChanged }) {
  const { push } = useToast()
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [acts, setActs] = useState([])
  const [logType, setLogType] = useState(null)          // call | reply | note | deal
  const [logForm, setLogForm] = useState({ outcome: '', notes: '', value: '' })
  const [logging, setLogging] = useState(false)

  const load = () => {
    setLoading(true)
    leadsApi.detail(leadId).then(setD).catch(() => push('Could not load lead', 'error')).finally(() => setLoading(false))
    leadsApi.activities(leadId).then(r => setActs(r.activities || [])).catch(() => {})
  }
  useEffect(() => { if (leadId) load() }, [leadId])

  const startLog = (type) => {
    setLogType(type)
    setLogForm({ outcome: type === 'deal' ? 'won' : '', notes: '', value: '' })
  }
  const submitLog = async () => {
    setLogging(true)
    try {
      const payload = { type: logType, outcome: logForm.outcome, notes: logForm.notes }
      if (logType === 'deal') payload.value = parseFloat(logForm.value) || 0
      await leadsApi.logActivity(leadId, payload)
      push(`${logType[0].toUpperCase() + logType.slice(1)} logged`, 'success')
      setLogType(null); load(); onChanged?.()
    } catch (e) { push(`Could not log: ${e.message}`, 'error') }
    finally { setLogging(false) }
  }

  const rescore = async () => {
    setScoring(true)
    try {
      await leadsApi.score(leadId)
      push('Lead re-scored with Groq AI', 'success')
      load(); onChanged?.()
    } catch (e) { push(`Scoring failed: ${e.message}`, 'error') }
    finally { setScoring(false) }
  }

  const name = d ? ([d.first_name, d.last_name].filter(Boolean).join(' ') || d.company || 'Lead') : ''
  const initial = d ? (d.first_name?.[0] || d.company?.[0] || '?').toUpperCase() : '?'
  const model = d?.icp_score
  const fit = d?.explain?.fit_score

  return (
    <div className="fixed inset-0 z-50 flex">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <motion.aside
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="absolute right-0 top-0 bottom-0 w-[460px] bg-white shadow-panel flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-slate-900 flex items-center justify-center text-white font-semibold flex-shrink-0">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-slate-900 truncate">{loading ? 'Loading…' : name}</p>
              {d && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_STYLE[d.status] || 'bg-slate-100 text-slate-500'}`}>{d.status}</span>
                  <span className="text-[11px] text-slate-400 capitalize">{d.source?.replace('_', ' ')} lead</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading || !d ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
            </div>
          ) : (
            <>
              {/* Score summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles size={12} className="text-violet-500" />
                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Model score</p>
                  </div>
                  <p className="text-3xl font-bold tabular-nums" style={{ color: scoreColor(model) }}>
                    {model ?? '—'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 capitalize">{d.scored_intent || 'not scored'} intent</p>
                </div>
                <div className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ShieldCheck size={12} className="text-blue-500" />
                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">ICP fit</p>
                  </div>
                  <p className="text-3xl font-bold tabular-nums" style={{ color: scoreColor(fit) }}>{fit ?? '—'}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">rules-based check</p>
                </div>
              </div>

              {/* Why this lead — explainability */}
              <div className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={14} className="text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-800">Why this lead?</h3>
                </div>
                <div className="space-y-3">
                  {d.explain?.factors?.map(f => (
                    <Factor key={f.label} label={f.label} score={f.score} weight={f.weight} />
                  ))}
                </div>
                {d.score_reason && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1">Model reasoning</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{d.score_reason}</p>
                    {d.offering_match && (
                      <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                        match: {d.offering_match}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Activity logging */}
              {can(user, 'log') && (
                <div className="rounded-xl border border-slate-100 p-4">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Log activity</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {[['call', Phone, '#0891B2'], ['reply', MessageSquare, '#7C3AED'], ['note', StickyNote, '#64748B'], ['deal', Award, '#059669']].map(([t, Icon, c]) => (
                      <button key={t} onClick={() => startLog(t)}
                        className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs capitalize transition-colors
                                    ${logType === t ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <Icon size={15} style={{ color: c }} />{t}
                      </button>
                    ))}
                  </div>
                  <AnimatePresence>
                    {logType && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="mt-3 space-y-2">
                          {logType === 'call' && (
                            <select value={logForm.outcome} onChange={e => setLogForm(f => ({ ...f, outcome: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <option value="">Call outcome…</option>
                              <option value="connected">Connected</option>
                              <option value="voicemail">Voicemail</option>
                              <option value="no answer">No answer</option>
                            </select>
                          )}
                          {logType === 'deal' && (
                            <div className="flex gap-2">
                              <select value={logForm.outcome} onChange={e => setLogForm(f => ({ ...f, outcome: e.target.value }))}
                                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="won">Won</option>
                                <option value="lost">Lost</option>
                              </select>
                              <div className="relative flex-1">
                                <DollarSign size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="number" placeholder="Deal value" value={logForm.value}
                                  onChange={e => setLogForm(f => ({ ...f, value: e.target.value }))}
                                  className="w-full pl-7 pr-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              </div>
                            </div>
                          )}
                          <textarea rows={2} placeholder="Notes (optional)" value={logForm.notes}
                            onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <div className="flex gap-2">
                            <button onClick={submitLog} disabled={logging}
                              className="flex-1 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50">
                              {logging ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={() => setLogType(null)}
                              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {acts.length > 0 && (
                    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                      {acts.slice(0, 8).map(a => {
                        const meta = { call: Phone, reply: MessageSquare, note: StickyNote, deal: Award, email: Mail }[a.type] || StickyNote
                        const Icon = meta
                        return (
                          <div key={a.id} className="flex items-center gap-2.5 text-xs">
                            <Icon size={13} className="text-slate-400 flex-shrink-0" />
                            <span className="capitalize text-slate-700">{a.type}</span>
                            {a.outcome && <span className="text-slate-400">· {a.outcome}</span>}
                            {a.value ? <span className="text-emerald-600 font-medium">${Number(a.value).toLocaleString()}</span> : null}
                            <span className="text-slate-400 truncate flex-1 text-right">{a.agent_name || ''}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Profile */}
              <div className="space-y-3">
                <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Contact & company</h3>
                <Row icon={Briefcase} label="Title" value={d.title} />
                <Row icon={Building2} label="Company" value={d.company} />
                <Row icon={Mail} label="Email" value={d.email} mono
                     />
                <Row icon={Phone} label="Phone" value={d.phone} mono />
                <Row icon={MapPin} label="Location" value={d.normalized_country !== 'Unspecified' ? d.normalized_country : d.country} />
                <Row icon={Layers} label="Industry" value={d.normalized_industry !== 'Unspecified' ? d.normalized_industry : null} />
                <Row icon={Users2} label="Company size" value={d.size_band !== 'Unknown' ? `${d.size_band} employees` : null} />
                <Row icon={Globe} label="Domain" value={d.domain} mono />
                {d.email && (
                  <div className="flex items-center gap-1.5 pl-10 -mt-1">
                    {d.email_verified
                      ? <><CheckCircle2 size={12} className="text-emerald-500" /><span className="text-[11px] text-emerald-600">Verified email</span></>
                      : <span className="text-[11px] text-amber-500">Unverified email</span>}
                  </div>
                )}
              </div>

              {/* Tech stack */}
              {d.tech_stack?.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Tech stack</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {d.tech_stack.map((t, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md text-[11px] bg-slate-100 text-slate-600">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              {d.timeline?.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Pipeline timeline</h3>
                  <div className="space-y-0">
                    {d.timeline.map((t, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1" />
                          {i < d.timeline.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1" />}
                        </div>
                        <div className="pb-4 min-w-0">
                          <p className="text-sm font-medium text-slate-800">{t.event}</p>
                          <p className="text-xs text-slate-500">{t.detail}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <Clock size={9} /> {new Date(t.at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {d && (can(user, 'edit') || (can(user, 'send') && d.email)) && (
          <div className="border-t border-slate-100 px-6 py-4 flex gap-2.5">
            {can(user, 'edit') && (
              <button onClick={rescore} disabled={scoring}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">
                {scoring
                  ? <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  : <Zap size={14} className="text-amber-500" />}
                {scoring ? 'Scoring…' : 'Re-score'}
              </button>
            )}
            {can(user, 'send') && d.email && (
              <button onClick={() => onCompose?.(d)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
                <Mail size={14} /> Compose
              </button>
            )}
          </div>
        )}
      </motion.aside>
    </div>
  )
}
