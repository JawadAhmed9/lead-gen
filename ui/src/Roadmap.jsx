import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Phone, Landmark, Cpu, ChevronDown, CheckCircle, Bell, MessageCircle } from 'lucide-react'
import { pageAnim } from './App'
import { whatsappApi } from './api'

const PHASE3 = [
  {
    icon: Phone, title: 'Click-to-call', tag: 'Twilio · pay-as-you-go',
    desc: 'Dial leads straight from the app; calls auto-log and record against the lead.',
    blueprint: [
      'Twilio Programmable Voice + a rented number (≈ cents/min).',
      'Browser WebRTC dialer inside the Call Console.',
      'Call auto-logs as an activity with duration + recording link.',
      'No manual "log call" — the transcript can auto-fill notes.',
    ],
  },
  {
    icon: Landmark, title: 'Tender / RFP monitoring', tag: 'GCC procurement portals',
    desc: 'Watch government & industrial procurement portals (e.g. Etimad) for relevant tenders and turn them into leads automatically.',
    blueprint: [
      'Connectors that poll the portals on a schedule.',
      'AI match against your ICP (industry, keywords, region).',
      'De-dupe + surface as leads with source = "tender".',
      'Notify the right rep the moment a fitting tender appears.',
    ],
  },
  {
    icon: Cpu, title: 'Post-sale / IoT bridge', tag: 'Lifecycle + Stemronic IoT',
    desc: 'Won customers flow into onboarding and connect to the IoT monitoring Stemronic actually delivers — turning lead-gen into a full lifecycle platform.',
    blueprint: [
      'On RFQ "won" → auto-create a customer + onboarding checklist.',
      'Link the customer to their device / IoT dashboards.',
      'Predictive-maintenance alerts flow back in as expansion signals.',
      'Renewal & upsell tracking closes the loop.',
    ],
  },
]

function Card({ item }) {
  const [open, setOpen] = useState(false)
  const Icon = item.icon
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <Icon size={18} className="text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Scheduled for Phase 3</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">{item.tag}</p>
          <p className="text-sm text-slate-500 mt-2">{item.desc}</p>
          <button onClick={() => setOpen(o => !o)}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
            {open ? 'Hide' : 'View'} blueprint <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
              {item.blueprint.map((b, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-600">
                  <span className="text-brand-400 mt-0.5">›</span><span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Roadmap() {
  const [waReady, setWaReady] = useState(null)
  useEffect(() => { whatsappApi.status().then(r => setWaReady(r.configured)).catch(() => setWaReady(false)) }, [])

  return (
    <motion.div {...pageAnim} className="p-4 sm:p-6 lg:p-8 max-w-[1000px]">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Channels &amp; Roadmap</h1>
        <p className="text-sm text-slate-500 mt-1">What's live now, and what's coming next.</p>
      </div>

      {/* Now available */}
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Now available</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><Bell size={18} className="text-emerald-600" /></div>
          <div>
            <div className="flex items-center gap-2"><h3 className="text-base font-semibold text-slate-900">Notifications</h3><CheckCircle size={14} className="text-emerald-500" /></div>
            <p className="text-sm text-slate-500 mt-1">Task, follow-up, and Copilot alerts in the top-bar bell.</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><MessageCircle size={18} className="text-emerald-600" /></div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900">WhatsApp outreach</h3>
              {waReady === true
                ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">Connected</span>
                : <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Connect to activate</span>}
            </div>
            <p className="text-sm text-slate-500 mt-1">Message leads on WhatsApp from Compose. Add a Meta WhatsApp Business number to switch it on.</p>
          </div>
        </div>
      </div>

      {/* Phase 3 */}
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Coming in Phase 3</h2>
      <div className="grid grid-cols-1 gap-3">
        {PHASE3.map(item => <Card key={item.title} item={item} />)}
      </div>
    </motion.div>
  )
}
