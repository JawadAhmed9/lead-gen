import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import {
  Search, Sparkles, Send, User, Building2,
  Mail, Target, ChevronDown, CheckCircle, X, MessageCircle,
} from 'lucide-react'
import { leadsApi, emailApi, whatsappApi, can } from './api'
import { useAuth, pageAnim } from './App'

// ─── Lead detail sidebar ──────────────────────────────────────────────────────
function LeadCard({ lead }) {
  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-center px-6">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
          <User size={20} className="text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">No lead selected</p>
        <p className="text-xs text-slate-400 mt-1">Search and select a contact to get started</p>
      </div>
    )
  }

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'
  const initial = (lead.first_name?.[0] || lead.company?.[0] || '?').toUpperCase()

  const score = lead.icp_score
  const scoreColor = score >= 70 ? '#10B981' : score >= 45 ? '#3B82F6' : '#CBD5E1'

  const rows = [
    { icon: Building2, label: 'Company', value: lead.company || '—' },
    { icon: Target,    label: 'Title',   value: lead.title   || '—' },
    { icon: Mail,      label: 'Email',   value: lead.email   || 'Not enriched yet' },
  ]

  return (
    <div className="p-5">
      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-full bg-brand-600 flex items-center justify-center
                        text-white font-semibold text-base flex-shrink-0">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
          <p className="text-xs text-slate-500 mt-0.5 capitalize">{lead.source?.replace('_',' ')} lead</p>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-3 mb-5">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center
                            justify-center flex-shrink-0 mt-0.5">
              <Icon size={12} className="text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
              <p className="text-sm text-slate-800 mt-0.5 break-all">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ICP Score */}
      {score != null && (
        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-500">ICP Score</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: scoreColor }}>{score}</p>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${score}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: scoreColor }}
            />
          </div>
        </div>
      )}

      {/* Pain point */}
      {lead.pain_point && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">Pain Point</p>
          <p className="text-xs text-slate-600 leading-relaxed">{lead.pain_point}</p>
        </div>
      )}

      {/* No email warning */}
      {!lead.email && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
          <p className="text-xs text-amber-700 font-medium">No verified email</p>
          <p className="text-xs text-amber-600 mt-0.5">Run the Enrich step to find this contact's email.</p>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Compose() {
  const { user }       = useAuth()
  const location       = useLocation()
  const passedLead     = location.state?.lead ?? null

  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [showDropdown, setShow]   = useState(false)
  const [lead, setLead]           = useState(passedLead)
  const [subject, setSubject]     = useState('')
  const [body, setBody]           = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending]     = useState(false)
  const [sent, setSent]           = useState(false)
  const [error, setError]         = useState('')
  const [emailStatus, setEmailStatus] = useState(null)
  const [channel, setChannel]     = useState('email')   // email | whatsapp
  const [waStatus, setWaStatus]   = useState(null)

  useEffect(() => { emailApi.status().then(setEmailStatus).catch(() => {}) }, [])
  useEffect(() => { whatsappApi.status().then(setWaStatus).catch(() => {}) }, [])

  const canSend = can(user, 'send')

  // Lead search dropdown
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(() => {
      leadsApi.list({ search: query, limit: 7 })
        .then(r => { setResults(r.leads); setShow(true) })
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const selectLead = (l) => {
    setLead(l); setQuery(''); setResults([]); setShow(false)
    setSubject(''); setBody(''); setSent(false); setError('')
  }

  const generate = async () => {
    if (!lead) return
    setGenerating(true); setError('')
    try {
      const draft = await emailApi.generate(lead.id)
      setSubject(draft.subject || '')
      setBody(draft.body || '')
    } catch (err) {
      setError('Draft generation failed — compose manually or try again.')
    } finally {
      setGenerating(false)
    }
  }

  const sendEmail = async () => {
    if (!lead?.email || !subject || !body) return
    setSending(true); setError('')
    try {
      await emailApi.send({ lead_id: lead.id, to_email: lead.email, subject, body })
      setSent(true)
      setTimeout(() => {
        setLead(null); setSubject(''); setBody(''); setSent(false)
      }, 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const sendWhatsapp = async () => {
    if (!lead?.phone || !body.trim()) return
    setSending(true); setError('')
    try {
      await whatsappApi.send({ lead_id: lead.id, to: lead.phone, message: body })
      setSent(true)
      setTimeout(() => { setLead(null); setBody(''); setSent(false) }, 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const name = lead ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.company : ''

  return (
    <motion.div {...pageAnim} className="p-4 sm:p-6 lg:p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Compose</h1>
        <p className="text-sm text-slate-500 mt-1">Send personalized emails with AI-generated drafts</p>
      </div>

      {/* Channel toggle */}
      <div className="flex items-center gap-1 mb-4 bg-slate-100 rounded-lg p-1 w-fit">
        {[['email', 'Email', Mail], ['whatsapp', 'WhatsApp', MessageCircle]].map(([ch, label, Icon]) => (
          <button key={ch} onClick={() => setChannel(ch)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors
                        ${channel === ch ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {channel === 'email' && emailStatus && (
        <div className={`mb-5 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs border max-w-[1100px]
                        ${emailStatus.configured ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
          <span className={`w-2 h-2 rounded-full ${emailStatus.configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {emailStatus.configured
            ? <span>Email sending is <b>live</b> — sending as <b>{emailStatus.sender}</b> via Brevo.</span>
            : <span>Email sending is <b>not configured</b>. Drafting works; add your Brevo API key &amp; sender to enable delivery.</span>}
        </div>
      )}
      {channel === 'whatsapp' && (
        <div className={`mb-5 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs border max-w-[1100px]
                        ${waStatus?.configured ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
          <span className={`w-2 h-2 rounded-full ${waStatus?.configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {waStatus?.configured
            ? <span>WhatsApp is <b>connected</b> — messages send from your WhatsApp Business number.</span>
            : <span>WhatsApp is <b>not connected</b>. Add a Meta WhatsApp Business number to enable sending (see Roadmap). You can still draft.</span>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 max-w-[1100px]">
        {/* Left: editor */}
        <div className="col-span-3 space-y-4">

          {/* Recipient selector */}
          <div className="bg-white border border-slate-100 rounded-xl p-5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Recipient
            </p>

            {lead ? (
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200
                              rounded-xl">
                <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center
                                text-white text-sm font-semibold flex-shrink-0">
                  {(lead.first_name?.[0] || lead.company?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
                  <p className="text-xs text-slate-500 truncate">{lead.email || 'No verified email'}</p>
                </div>
                <button onClick={() => setLead(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors
                             flex items-center gap-1">
                  <X size={12} /> Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query} onChange={e => setQuery(e.target.value)}
                  onFocus={() => results.length && setShow(true)}
                  placeholder="Search leads by name, company, or email..."
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-500 transition
                             placeholder:text-slate-400"
                />
                <AnimatePresence>
                  {showDropdown && results.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.12 }}
                      className="absolute top-full left-0 right-0 mt-1.5 bg-white border
                                 border-slate-200 rounded-xl shadow-panel overflow-hidden z-20"
                    >
                      {results.map(l => {
                        const n = [l.first_name, l.last_name].filter(Boolean).join(' ') || l.company
                        return (
                          <button key={l.id} onClick={() => selectLead(l)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50
                                       transition-colors text-left border-b border-slate-50 last:border-0">
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center
                                            justify-center text-slate-600 text-xs font-semibold flex-shrink-0">
                              {(l.first_name?.[0] || l.company?.[0] || '?').toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-900 truncate">{n}</p>
                              <p className="text-xs text-slate-400 truncate">{l.email || l.company}</p>
                            </div>
                            {l.icp_score != null && (
                              <span className="text-xs font-semibold text-slate-500 flex-shrink-0">
                                {l.icp_score}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Email editor */}
          <div className="bg-white border border-slate-100 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                Email
              </p>
              {lead && canSend && (
                <button onClick={generate} disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-slate-50
                             text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-100
                             transition-colors disabled:opacity-50">
                  <Sparkles size={12} className={generating ? 'animate-pulse text-blue-500' : 'text-violet-500'} />
                  {generating ? 'Generating draft...' : 'Generate with AI'}
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Subject line</label>
                <input
                  value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder={channel === 'whatsapp' ? 'Not used for WhatsApp' : 'e.g. Solving downtime at Acme — 15 min?'}
                  disabled={!canSend || !lead || channel === 'whatsapp'}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-500 transition
                             placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Body</label>
                <textarea
                  value={body} onChange={e => setBody(e.target.value)} rows={9}
                  placeholder="Write your email or click Generate with AI..."
                  disabled={!canSend || !lead}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-500 transition
                             placeholder:text-slate-400 resize-none disabled:bg-slate-50
                             disabled:text-slate-400 leading-relaxed"
                />
                <div className="flex justify-between mt-1.5">
                  <span className="text-xs text-slate-400">
                    {body.split(/\s+/).filter(Boolean).length} words
                  </span>
                  <span className="text-xs text-slate-400">{body.length} chars</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs">
                {error}
              </div>
            )}

            {canSend ? (<>
              <button
                onClick={channel === 'email' ? sendEmail : sendWhatsapp}
                disabled={(channel === 'email' ? (!lead?.email || !subject.trim()) : !lead?.phone) || !body.trim() || sending || sent}
                className={`mt-4 w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg
                            text-sm font-medium transition-all
                            ${sent
                              ? 'bg-emerald-500 text-white'
                              : 'bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 disabled:cursor-not-allowed'}`}
              >
                {sent ? (
                  <><CheckCircle size={15} /> Sent successfully</>
                ) : sending ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending...</>
                ) : channel === 'email' ? (
                  <><Send size={14} /> Send email</>
                ) : (
                  <><MessageCircle size={14} /> Send WhatsApp</>
                )}
              </button>
              {channel === 'whatsapp' && lead && !lead.phone && (
                <p className="mt-2 text-xs text-amber-600">No phone number on this lead — enrich it or pick another to message on WhatsApp.</p>
              )}
            </>) : (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                <p className="text-xs text-slate-500">Viewer access — contact your admin to send emails</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: lead details */}
        <div className="col-span-2">
          <div className="bg-white border border-slate-100 rounded-xl sticky top-8 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                Lead details
              </p>
            </div>
            <LeadCard lead={lead} />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
