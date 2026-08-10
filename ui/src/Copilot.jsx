import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { agentApi, emailApi, leadsApi, rfqApi, statsApi } from './api'
import { fmtMoney } from './ui'

const SUGGESTIONS = [
  { short: 'Top leads (ICP > 80)', q: 'Show me my top 10 uncontacted leads with an ICP score above 80' },
  { short: 'RFQ forecast', q: "How many RFQs are in the pipeline and what's the weighted forecast?" },
  { short: 'Best industry', q: 'Which industry has the highest average interest score?' },
  { short: 'Draft an email', q: 'Draft an intro email to my top uncontacted lead' },
]

const CSS = `
@keyframes cp-pulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.55);opacity:0}}
@keyframes cp-spin{to{transform:rotate(360deg)}}
@keyframes cp-in{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
.cp-stream::-webkit-scrollbar{width:5px}.cp-stream::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:10px}
`

function LeadCard({ lead, onOpen }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 12, padding: '10px 12px' }}>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12.8, fontWeight: 600, color: '#eef4fc' }} className="truncate">{lead.company || 'Lead'}</span>
        {lead.icp_score != null && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#0b1524', background: 'linear-gradient(135deg,#63e0a8,#25b07a)', padding: '2px 8px', borderRadius: 20 }}>{lead.icp_score}</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#9fb2ca', marginTop: 2 }} className="truncate">
        {[lead.title, lead.industry, lead.country].filter(Boolean).join(' · ') || lead.name}
      </div>
      <div className="flex gap-1.5 mt-2">
        <button onClick={() => onOpen(lead)}
          style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, border: 'none', color: '#fff', cursor: 'pointer', background: 'linear-gradient(135deg,#2B84FF,#1a6ae6)' }}>Open</button>
        <button disabled title="Coming in the next release"
          style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', color: '#cfe0f5', background: 'rgba(255,255,255,.05)', opacity: .5, cursor: 'not-allowed' }}>
          Draft email <span style={{ fontSize: 8.5, background: 'rgba(255,255,255,.12)', borderRadius: 6, padding: '1px 5px', marginLeft: 4 }}>soon</span>
        </button>
      </div>
    </div>
  )
}

// Approval card for a proposed write action (L2). Executes the REAL endpoint
// only when the user clicks approve — the endpoint re-checks permissions.
function ApprovalCard({ prop }) {
  const [status, setStatus] = useState('idle')   // idle | busy | done | error
  const [err, setErr] = useState('')
  const [subject, setSubject] = useState(prop.subject || '')
  const [body, setBody] = useState(prop.body || '')

  const run = async () => {
    setStatus('busy'); setErr('')
    try {
      if (prop.type === 'send_email') await emailApi.send({ to_email: prop.to_email, subject, body, lead_id: prop.lead_id })
      else if (prop.type === 'assign') await leadsApi.assign(prop.lead_id, prop.agent_id)
      else if (prop.type === 'create_rfq') await rfqApi.create({ lead_id: prop.lead_id, title: prop.title, value: prop.value })
      setStatus('done')
    } catch (e) { setErr(e.message || 'Failed'); setStatus('error') }
  }

  const label = prop.type === 'send_email' ? 'Send email'
    : prop.type === 'assign' ? 'Approve assignment' : 'Log RFQ'
  const doneLabel = prop.type === 'send_email' ? 'Sent ✓'
    : prop.type === 'assign' ? 'Assigned ✓' : 'RFQ logged ✓'

  return (
    <div style={{ background: 'rgba(79,158,255,.07)', border: '1px solid rgba(79,158,255,.28)', borderRadius: 12, padding: '11px 12px', width: '95%', alignSelf: 'flex-start' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: '#9ec2ff', fontWeight: 700, marginBottom: 6 }}>
        {prop.type === 'send_email' ? '✉ Email — needs approval' : prop.type === 'assign' ? '➜ Assign — needs approval' : '＋ RFQ — needs approval'}
      </div>

      {prop.type === 'send_email' && (
        <>
          <div style={{ fontSize: 11, color: '#9fb2ca', marginBottom: 6 }}>To: {prop.company} &lt;{prop.to_email}&gt;</div>
          <input value={subject} onChange={e => setSubject(e.target.value)} disabled={status === 'done'}
            style={inp} />
          <textarea value={body} onChange={e => setBody(e.target.value)} disabled={status === 'done'} rows={5}
            style={{ ...inp, marginTop: 6, resize: 'vertical', lineHeight: 1.5 }} />
        </>
      )}
      {prop.type === 'assign' && <div style={{ fontSize: 12.6, color: '#dbe7f7' }}>Assign <b>{prop.company}</b> → <b>{prop.agent_name}</b></div>}
      {prop.type === 'create_rfq' && <div style={{ fontSize: 12.6, color: '#dbe7f7' }}>Log RFQ for <b>{prop.company}</b> — <b>${Number(prop.value || 0).toLocaleString()}</b></div>}

      {status === 'error' && <div style={{ fontSize: 11, color: '#ff9b9b', marginTop: 6 }}>{err}</div>}

      <div className="flex gap-1.5" style={{ marginTop: 9 }}>
        {status === 'done'
          ? <span style={{ fontSize: 12, color: '#63e0a8', fontWeight: 600 }}>{doneLabel}</span>
          : <>
              <button onClick={run} disabled={status === 'busy'}
                style={{ fontSize: 11.5, padding: '6px 12px', borderRadius: 8, border: 'none', color: '#fff', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#2B84FF,#1a6ae6)', opacity: status === 'busy' ? .6 : 1 }}>
                {status === 'busy' ? 'Working…' : label}
              </button>
              <button onClick={() => setStatus('done')} disabled={status === 'busy'}
                style={{ fontSize: 11.5, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', color: '#cfe0f5',
                  border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.05)' }}>Dismiss</button>
            </>}
      </div>
    </div>
  )
}

export default function Copilot() {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [msgs, setMsgs] = useState([])   // {role, content, leads?, tools?, navigate?}
  const streamRef = useRef(null)
  const inputRef = useRef(null)
  const seeded = useRef(false)
  const [tab, setTab] = useState('chat')
  const [inbox, setInbox] = useState([])
  const [jobsBusy, setJobsBusy] = useState(false)

  const refreshInbox = () => agentApi.inbox().then(r => setInbox(r.items || [])).catch(() => {})
  useEffect(() => { refreshInbox() }, [])
  const runJobs = async () => {
    setJobsBusy(true)
    try { await agentApi.runJobs(); await refreshInbox() } catch (e) { /* noop */ } finally { setJobsBusy(false) }
  }
  const resolveItem = async (id, approve) => {
    try { approve ? await agentApi.inboxApprove(id) : await agentApi.inboxDismiss(id); setInbox(x => x.filter(i => i.id !== id)) }
    catch (e) { alert(e.message || 'Action failed') }
  }

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen(o => !o) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // On first open, pre-seed a short demo transcript from LIVE data so the panel
  // isn't empty and there's something real to show.
  useEffect(() => {
    if (!open) return
    setTimeout(() => inputRef.current?.focus(), 60)
    if (seeded.current || msgs.length) return
    seeded.current = true
    ;(async () => {
      const [st, rfq] = await Promise.all([
        statsApi.get().catch(() => null),
        rfqApi.list().catch(() => null),
      ])
      const demo = [{ role: 'assistant', content: "Hi 👋 I can find leads and answer questions about your pipeline. Here are a couple of quick reads from your live data — or ask me anything:" }]
      if (rfq) {
        demo.push({ role: 'user', content: "How many RFQs are in the pipeline and what's the weighted forecast?" })
        demo.push({ role: 'assistant', tools: ['list_rfqs'],
          content: `You have ${rfq.count} RFQ${rfq.count === 1 ? '' : 's'} in the pipeline — weighted forecast ${fmtMoney(rfq.forecast)}, with ${fmtMoney(rfq.won_value)} already won and ${fmtMoney(rfq.open_value)} still open.` })
      }
      if (st) {
        const ready = st.queued || 0
        demo.push({ role: 'user', content: 'How many leads are sales-ready right now?' })
        demo.push({ role: 'assistant', tools: ['pipeline_stats'],
          content: `${ready.toLocaleString()} lead${ready === 1 ? '' : 's'} are sales-ready (scored & queued). Pipeline: ${(st.raw || 0).toLocaleString()} raw → ${(st.enriched || 0).toLocaleString()} enriched → ${(st.scored || 0).toLocaleString()} scored → ${ready.toLocaleString()} queued.` })
      }
      if (demo.length > 1) setMsgs(demo)
    })()
  }, [open])
  useEffect(() => { streamRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }) }, [msgs, busy])

  const send = async (text) => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    setInput('')
    const next = [...msgs, { role: 'user', content: q }]
    setMsgs(next); setBusy(true)
    try {
      const history = next.map(m => ({ role: m.role, content: m.content }))
      const r = await agentApi.chat(history)
      setMsgs(m => [...m, { role: 'assistant', content: r.reply || '…', leads: r.leads, tools: r.tools, navigate: r.navigate, proposals: r.proposals }])
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: `Sorry — ${e.message}` }])
    } finally { setBusy(false) }
  }

  const goto = (route) => { setOpen(false); nav(route) }

  return (
    <>
      <style>{CSS}</style>

      {/* Collapsed orb */}
      {!open && (
        <button onClick={() => setOpen(true)} title="Copilot — ⌘J" aria-label="Open Copilot"
          style={{ position: 'fixed', right: 26, bottom: 26, width: 56, height: 56, borderRadius: '50%', zIndex: 60,
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(120% 120% at 30% 25%, #63a8ff, #2B84FF 55%, #0d55cc)',
            boxShadow: '0 8px 26px rgba(43,132,255,.5), 0 0 0 6px rgba(43,132,255,.12)' }}>
          <span style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '2px solid rgba(43,132,255,.35)', animation: 'cp-pulse 2.2s ease-out infinite' }} />
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none"><g stroke="#fff" strokeLinejoin="round"><polygon points="50,8 86,29 86,71 50,92 14,71 14,29" strokeWidth="4" /><polygon points="50,30 67,40 67,60 50,70 33,60 33,40" strokeWidth="2.5" opacity=".9" /></g><circle cx="50" cy="50" r="4.5" fill="#fff" /></svg>
          {inbox.length > 0 && (
            <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, background: '#ff4d4f', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0b1524' }}>{inbox.length}</span>
          )}
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div style={{ position: 'fixed', right: 26, bottom: 26, width: 384, maxWidth: 'calc(100vw - 32px)', height: 560, maxHeight: 'calc(100vh - 52px)', zIndex: 70,
          borderRadius: 22, overflow: 'hidden', display: 'flex', flexDirection: 'column', color: '#e8eef6',
          background: 'linear-gradient(180deg, rgba(17,30,51,.97), rgba(11,21,36,.99))', backdropFilter: 'blur(18px)',
          boxShadow: '0 24px 60px rgba(4,12,28,.55), 0 0 0 1px rgba(79,158,255,.25)', animation: 'cp-in .18s ease-out' }}>

          {/* Header */}
          <div className="flex items-center gap-2.5" style={{ padding: '15px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
            <svg width="22" height="22" viewBox="0 0 100 100" fill="none"><g stroke="#4F9EFF" strokeLinejoin="round"><polygon points="50,8 86,29 86,71 50,92 14,71 14,29" strokeWidth="4" /></g><circle cx="50" cy="50" r="5" fill="#4F9EFF" /></svg>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Copilot</div>
              <div style={{ fontSize: 10.5, color: '#93a7c4', marginTop: 1 }}>Ask about your leads &amp; pipeline</div>
            </div>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#31d07f', boxShadow: '0 0 8px #31d07f', marginLeft: 6 }} />
            <button onClick={() => { setTab(t => t === 'inbox' ? 'chat' : 'inbox'); refreshInbox() }} aria-label="Inbox"
              style={{ marginLeft: 'auto', position: 'relative', color: tab === 'inbox' ? '#4F9EFF' : '#7f93b0', cursor: 'pointer', background: 'none', border: 'none', display: 'flex', alignItems: 'center', padding: 4 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
              {inbox.length > 0 && <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 15, height: 15, borderRadius: 8, background: '#ff4d4f', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inbox.length}</span>}
            </button>
            <button onClick={() => setOpen(false)} aria-label="Close"
              style={{ color: '#7f93b0', cursor: 'pointer', background: 'none', border: 'none', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>

          {tab === 'chat' ? (<>
          {/* Stream */}
          <div ref={streamRef} className="cp-stream" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {msgs.length === 0 && (
              <>
                <div style={bubbleAi}>Hi 👋 I can find leads, answer questions about your pipeline, and take you where you need to go. Try one of these:</div>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map(s => <button key={s.q} onClick={() => send(s.q)} style={chip}>{s.q}</button>)}
                </div>
              </>
            )}
            {msgs.map((m, i) => (
              <React.Fragment key={i}>
                {m.role === 'user'
                  ? <div style={bubbleMe}>{m.content}</div>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'flex-start', width: '100%' }}>
                      {m.tools?.length > 0 && (
                        <div style={toolChip}>{`used: ${[...new Set(m.tools)].join(', ')}`}</div>
                      )}
                      <div style={bubbleAi}>{m.content}</div>
                      {m.leads?.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '95%' }}>
                          {m.leads.slice(0, 6).map(l => <LeadCard key={l.id} lead={l} onOpen={() => goto('/leads')} />)}
                        </div>
                      )}
                      {m.proposals?.map(p => <ApprovalCard key={p.id} prop={p} />)}
                      {m.navigate && (
                        <button onClick={() => goto(m.navigate)} style={{ ...chip, alignSelf: 'flex-start' }}>Go there →</button>
                      )}
                    </div>
                  )}
              </React.Fragment>
            ))}
            {busy && <div style={toolChip}><span style={spin} /> Thinking…</div>}
          </div>

          {/* Persistent quick-asks — sample demo queries always visible */}
          <div className="flex gap-1.5" style={{ padding: '10px 14px 0', flexWrap: 'wrap' }}>
            {SUGGESTIONS.map(s => (
              <button key={s.q} onClick={() => send(s.q)} disabled={busy} style={miniChip} title={s.q}>{s.short}</button>
            ))}
          </div>

          {/* Composer */}
          <div className="flex items-center gap-2" style={{ padding: '12px 14px', borderTop: 'none' }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder="Ask anything about your leads…"
              style={{ flex: 1, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 13px', color: '#e8eef6', fontSize: 12.5, outline: 'none' }} />
            <button onClick={() => send()} disabled={busy || !input.trim()} aria-label="Send"
              style={{ width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg,#2B84FF,#0d55cc)', boxShadow: '0 4px 14px rgba(43,132,255,.5)', opacity: busy || !input.trim() ? .5 : 1 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 12l16-8-6 8 6 8-16-8z" fill="#fff" /></svg>
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 9.5, color: '#6f849f', padding: '0 0 9px' }}>Reads are instant · actions always ask first</div>
          </>) : (
            <div className="cp-stream" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 12, color: '#9fb2ca' }}>{inbox.length} pending suggestion{inbox.length === 1 ? '' : 's'}</span>
                <button onClick={runJobs} disabled={jobsBusy} style={{ ...chip, opacity: jobsBusy ? .6 : 1 }}>{jobsBusy ? 'Scanning…' : 'Run agent now'}</button>
              </div>
              {inbox.length === 0 && <div style={bubbleAi}>No pending suggestions yet. Click “Run agent now” — I'll scan for hot untouched leads and stale RFQs, draft the outreach, and drop it here for your approval.</div>}
              {inbox.map(it => (
                <div key={it.id} style={{ background: 'rgba(79,158,255,.07)', border: '1px solid rgba(79,158,255,.25)', borderRadius: 12, padding: '11px 12px' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: '#9ec2ff', fontWeight: 700, marginBottom: 4 }}>{it.kind === 'prospect_email' ? '✉ Suggested email' : '⏰ Follow-up'}</div>
                  <div style={{ fontSize: 12.8, fontWeight: 600, color: '#eef4fc' }}>{it.title}</div>
                  <div style={{ fontSize: 11, color: '#9fb2ca', marginTop: 2 }}>{it.summary}</div>
                  <div className="flex gap-1.5" style={{ marginTop: 9 }}>
                    <button onClick={() => resolveItem(it.id, true)} style={{ fontSize: 11.5, padding: '6px 12px', borderRadius: 8, border: 'none', color: '#fff', cursor: 'pointer', background: 'linear-gradient(135deg,#2B84FF,#1a6ae6)' }}>{it.kind === 'prospect_email' ? 'Send' : 'Approve'}</button>
                    <button onClick={() => resolveItem(it.id, false)} style={{ fontSize: 11.5, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', color: '#cfe0f5', border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.05)' }}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

const bubbleAi = { maxWidth: '90%', padding: '10px 13px', borderRadius: 14, borderBottomLeftRadius: 5, fontSize: 12.6, lineHeight: 1.55, whiteSpace: 'pre-wrap', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.07)', alignSelf: 'flex-start' }
const bubbleMe = { maxWidth: '85%', padding: '10px 13px', borderRadius: 14, borderBottomRightRadius: 5, fontSize: 12.6, lineHeight: 1.55, color: '#fff', alignSelf: 'flex-end', background: 'linear-gradient(135deg,#2B84FF,#1a6ae6)' }
const chip = { fontSize: 11.5, color: '#bcd4f5', background: 'rgba(79,158,255,.1)', border: '1px solid rgba(79,158,255,.28)', padding: '6px 11px', borderRadius: 20, cursor: 'pointer', textAlign: 'left' }
const toolChip = { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#9ec2ff', background: 'rgba(79,158,255,.08)', border: '1px solid rgba(79,158,255,.2)', padding: '5px 10px', borderRadius: 8, alignSelf: 'flex-start' }
const spin = { width: 9, height: 9, border: '2px solid rgba(158,194,255,.4)', borderTopColor: '#9ec2ff', borderRadius: '50%', display: 'inline-block', animation: 'cp-spin .7s linear infinite' }
const inp = { width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '8px 10px', color: '#e8eef6', fontSize: 12, outline: 'none', fontFamily: 'inherit' }
const miniChip = { fontSize: 10.5, color: '#bcd4f5', background: 'rgba(79,158,255,.1)', border: '1px solid rgba(79,158,255,.25)', padding: '4px 9px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap' }
