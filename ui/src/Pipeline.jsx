import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, RefreshCw, Settings2, Plus, X, ChevronDown, ChevronUp, Zap, Users, CheckCircle, Clock, Rss } from 'lucide-react'
import { pipelineApi } from './api'

const pageAnim = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25 },
}

const STAGE_ORDER = ['raw', 'enriched', 'scored', 'queued', 'sent', 'replied']
const STAGE_COLOR = {
  raw:      'bg-slate-200',
  enriched: 'bg-blue-400',
  scored:   'bg-indigo-400',
  queued:   'bg-amber-400',
  sent:     'bg-emerald-400',
  replied:  'bg-emerald-600',
}

// ─── Tag input ────────────────────────────────────────────────────────────────
function TagInput({ label, values, onChange, placeholder }) {
  const [input, setInput] = useState('')

  const add = () => {
    const v = input.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setInput('')
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-full text-xs font-medium">
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))}
              className="text-blue-400 hover:text-blue-700 transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button onClick={add}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors">
          <Plus size={12} />
        </button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Pipeline({ user }) {
  const [stats, setStats]           = useState(null)
  const [running, setRunning]       = useState(false)
  const [lastRun, setLastRun]       = useState(null)
  const [socialRunning, setSocialRunning] = useState(false)
  const [socialRun, setSocialRun]   = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [settings, setSettings]     = useState(null)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [rotation, setRotation]     = useState(null)
  const pollRef                     = useRef(null)

  const fetchStats = async () => {
    const s = await pipelineApi.status().catch(() => null)
    if (s) setStats(s)
  }

  const fetchSettings = async () => {
    const s = await pipelineApi.getSettings().catch(() => null)
    if (s) setSettings(s)
  }

  const fetchRotation = async () => {
    const r = await pipelineApi.rotation().catch(() => null)
    if (r) setRotation(r)
  }

  const regenerateProfiles = async () => {
    await pipelineApi.regenerate().catch(console.error)
    fetchRotation()
  }

  const toggleReveal = () => {
    const next = { ...settings, reveal_contacts: !settings.reveal_contacts }
    setSettings(next)
    pipelineApi.saveSettings({ reveal_contacts: next.reveal_contacts }).catch(console.error)
  }

  useEffect(() => {
    fetchStats()
    fetchSettings()
    fetchRotation()
  }, [])

  const startPoll = () => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      await fetchStats()
    }, 3000)
    // Stop after 3 minutes
    setTimeout(() => stopPoll(), 3 * 60 * 1000)
  }

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setRunning(false)
  }

  useEffect(() => () => stopPoll(), [])

  const collectLeads = async () => {
    setRunning(true)
    setLastRun(new Date())
    // Always save current settings (incl. pages) before triggering
    // so the backend uses the UI values, not stale JSON on disk
    if (settings) {
      await pipelineApi.saveSettings(settings).catch(console.error)
    }
    await pipelineApi.trigger('apollo-only').catch(console.error)
    // Refresh settings so page_offset reflects the advance done by the server
    fetchSettings()
    fetchRotation()
    startPoll()
  }

  const collectSocial = async () => {
    setSocialRunning(true)
    setSocialRun(new Date())
    await pipelineApi.trigger('social').catch(console.error)
    startPoll()
    // Social runs take a little while (scrape + AI extraction); relax the button after a bit.
    setTimeout(() => setSocialRunning(false), 8000)
  }

  const saveSettings = async () => {
    setSaving(true)
    await pipelineApi.saveSettings(settings).catch(console.error)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const totalLeads = stats ? STAGE_ORDER.reduce((s, k) => s + (stats[k] || 0), 0) : 0
  const canCollect = user?.role === 'admin' || user?.role === 'manager'

  return (
    <motion.div {...pageAnim} className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Pipeline</h1>
        <p className="text-sm text-slate-500 mt-1">Collect leads from Apollo and run the scoring pipeline</p>
      </div>

      {/* Collect card */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 mb-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap size={16} className="text-amber-500" />
              <h2 className="text-base font-semibold text-slate-900">Collect Leads from Apollo</h2>
            </div>
            <p className="text-sm text-slate-500">
              Pulls leads matching your ICP filters, enriches org data, scores with AI, and gates by contact info.
            </p>
            {lastRun && (
              <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                <Clock size={11} /> Last triggered {lastRun.toLocaleTimeString()}
                {running && <span className="ml-2 text-blue-500 font-medium animate-pulse">— running…</span>}
              </p>
            )}
          </div>
          {canCollect && (
            <button onClick={collectLeads} disabled={running}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm
                          ${running
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-brand-600 hover:bg-brand-700 text-white'}`}>
              {running
                ? <><RefreshCw size={14} className="animate-spin" /> Running…</>
                : <><Play size={14} /> Collect Leads</>}
            </button>
          )}
        </div>

        {/* Pages selector + offset indicator */}
        {settings && canCollect && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-slate-500 font-medium">Pages to pull:</span>
              {[1, 2, 5, 10].map(n => (
                <button key={n}
                  onClick={() => setSettings(s => ({ ...s, pages: n }))}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors
                              ${settings.pages === n
                                ? 'bg-brand-600 text-white'
                                : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {n} <span className="text-[10px] opacity-70">({n * 25} leads)</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>
                Next run will fetch Apollo pages{' '}
                <span className="font-semibold text-slate-600">
                  {settings.page_offset || 1}–{(settings.page_offset || 1) + (settings.pages || 2) - 1}
                </span>
                {' '}(avoids re-fetching pages you already have)
              </span>
              {(settings.page_offset || 1) > 1 && (
                <button
                  onClick={() => setSettings(s => ({ ...s, page_offset: 1 }))}
                  className="text-blue-500 hover:text-blue-700 underline transition-colors">
                  reset to page 1
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Social sources card (free: Reddit + forums) */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 mb-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Rss size={16} className="text-orange-500" />
              <h2 className="text-base font-semibold text-slate-900">Collect Intent Leads (Free)</h2>
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-full font-medium">no cost</span>
            </div>
            <p className="text-sm text-slate-500">
              Scans Reddit (r/PLC, r/SCADA, r/manufacturing…) and industrial forums for people
              describing automation problems, then uses AI to pull out the company, pain point, and intent.
              Only medium/high-intent posts are saved.
            </p>
            {socialRun && (
              <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                <Clock size={11} /> Last triggered {socialRun.toLocaleTimeString()}
                {socialRunning && <span className="ml-2 text-orange-500 font-medium animate-pulse">— running…</span>}
              </p>
            )}
          </div>
          {canCollect && (
            <button onClick={collectSocial} disabled={socialRunning}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm shrink-0
                          ${socialRunning
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-brand-600 hover:bg-brand-700 text-white'}`}>
              {socialRunning
                ? <><RefreshCw size={14} className="animate-spin" /> Running…</>
                : <><Play size={14} /> Collect Social</>}
            </button>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
          <span className="font-medium text-slate-600">Setup:</span> Forums work out of the box.
          Reddit needs free API keys — create a “script” app at
          {' '}<span className="font-mono text-slate-600">reddit.com/prefs/apps</span>{' '}
          and set <span className="font-mono text-slate-600">REDDIT_CLIENT_ID</span> /
          <span className="font-mono text-slate-600"> REDDIT_CLIENT_SECRET</span> in your environment.
          Until then, Reddit is skipped automatically and forums still run.
          Collected leads flow through the same Enrich → Score steps as Apollo.
        </div>
      </div>

      {/* Pipeline funnel */}
      {stats && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 mb-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users size={15} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Pipeline Status</h2>
            <span className="ml-auto text-xs text-slate-400">{totalLeads.toLocaleString()} total leads</span>
            <button onClick={fetchStats} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="space-y-2.5">
            {STAGE_ORDER.map(stage => {
              const count = stats[stage] || 0
              const pct   = totalLeads > 0 ? (count / totalLeads) * 100 : 0
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-500 w-16 capitalize">{stage}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${STAGE_COLOR[stage]}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums w-10 text-right">
                    {count.toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filter rotation */}
      {rotation && rotation.enabled && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 mb-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw size={15} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Filter Rotation</h2>
            <span className="ml-auto text-xs text-slate-400">{rotation.profiles.length} profiles</span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Each Collect run auto-rotates to the next filter combination (location × company size), so you keep surfacing new leads instead of re-pulling the same ones.
          </p>

          {rotation.next && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-800 mb-3">
              Next run targets <b>{rotation.next.name}</b> — starting Apollo page {rotation.next.offset}
            </div>
          )}

          {canCollect && (
            <div className="flex items-center justify-between py-2.5 border-t border-slate-100">
              <div>
                <p className="text-xs font-medium text-slate-700">Reveal emails &amp; phone numbers</p>
                <p className="text-[11px] text-slate-400">Unlocks contacts via Apollo credits — off by default</p>
              </div>
              <button onClick={toggleReveal}
                className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0
                            ${settings?.reveal_contacts ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform
                                  ${settings?.reveal_contacts ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          )}

          {settings?.industries?.length > 0 && (
            <div className="py-2.5 border-t border-slate-100">
              <p className="text-[11px] text-slate-400 mb-1.5 uppercase tracking-wide">Industry keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {settings.industries.map(i => (
                  <span key={i} className="px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-600">{i}</span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 max-h-44 overflow-y-auto">
            {rotation.profiles.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-slate-600">{p.name}</span>
                <span className="text-slate-400 tabular-nums">page {p.offset} · {p.runs} run{p.runs === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>

          {canCollect && (
            <button onClick={regenerateProfiles}
              className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium">
              Regenerate profiles from current filters
            </button>
          )}
        </div>
      )}

      {/* Apollo filter editor */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowFilters(f => !f)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2">
            <Settings2 size={15} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Apollo Search Filters</span>
            <span className="text-xs text-slate-400 font-normal ml-1">— edit without touching Python</span>
          </div>
          {showFilters ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
        </button>

        <AnimatePresence>
          {showFilters && settings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden">
              <div className="px-6 pb-6 border-t border-slate-100 space-y-5 pt-5">

                <TagInput
                  label="Target Job Titles"
                  values={settings.person_titles || []}
                  onChange={v => setSettings(s => ({ ...s, person_titles: v }))}
                  placeholder="e.g. Plant Manager"
                />

                <TagInput
                  label="Target Locations (countries or cities)"
                  values={settings.person_locations || []}
                  onChange={v => setSettings(s => ({ ...s, person_locations: v }))}
                  placeholder="e.g. Saudi Arabia"
                />

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Employee Count Ranges
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(settings.organization_num_employees_ranges || []).map(r => (
                      <span key={r} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-600 rounded-full text-xs font-medium">
                        {r} employees
                        <button onClick={() => setSettings(s => ({
                          ...s,
                          organization_num_employees_ranges: s.organization_num_employees_ranges.filter(x => x !== r)
                        }))} className="text-slate-400 hover:text-slate-700 transition-colors">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {['1,10','11,50','51,200','201,1000','1001,5000','5001,10000'].map(range => {
                      const active = (settings.organization_num_employees_ranges || []).includes(range)
                      return (
                        <button key={range}
                          onClick={() => setSettings(s => {
                            const ranges = s.organization_num_employees_ranges || []
                            return { ...s, organization_num_employees_ranges: active ? ranges.filter(r => r !== range) : [...ranges, range] }
                          })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                                      ${active ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          {range}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {canCollect && (
                  <div className="flex items-center gap-3 pt-2">
                    <button onClick={saveSettings} disabled={saving}
                      className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save Filters'}
                    </button>
                    <AnimatePresence>
                      {saved && (
                        <motion.span
                          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                          <CheckCircle size={14} /> Saved — takes effect on next collect run
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
