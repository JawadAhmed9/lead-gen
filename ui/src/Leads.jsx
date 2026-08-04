import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, Trash2, ChevronLeft, ChevronRight,
  Download, X, SlidersHorizontal, Mail, Upload,
  FileSpreadsheet, CheckCircle, AlertCircle, Loader, Zap,
  Bookmark, BookmarkPlus, CheckSquare, Square, UserCheck, Phone,
} from 'lucide-react'
import { leadsApi, usersApi, can } from './api'
import { useAuth, pageAnim } from './App'
import { useNavigate, useLocation } from 'react-router-dom'
import LeadDrawer from './LeadDrawer'
import CallConsole from './CallConsole'
import { useToast, useConfirm } from './ui'

const SEG_KEY = 'lp_segments'
const loadSegments = () => { try { return JSON.parse(localStorage.getItem(SEG_KEY)) || [] } catch { return [] } }
const saveSegments = (s) => localStorage.setItem(SEG_KEY, JSON.stringify(s))

// ─── Status & intent style maps ───────────────────────────────────────────────
const STATUS = {
  raw:      'bg-slate-100 text-slate-600',
  enriched: 'bg-blue-50 text-blue-700',
  scored:   'bg-violet-50 text-violet-700',
  queued:   'bg-amber-50 text-amber-700',
  sent:     'bg-emerald-50 text-emerald-700',
  replied:  'bg-rose-50 text-rose-700',
}
const INTENT = {
  high:   'bg-emerald-50 text-emerald-700',
  medium: 'bg-amber-50 text-amber-700',
  low:    'bg-slate-100 text-slate-500',
}

function Badge({ map, value }) {
  return value
    ? <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                        ${map[value] || 'bg-slate-100 text-slate-500'}`}>{value}</span>
    : <span className="text-slate-300 text-sm">—</span>
}

function Score({ v }) {
  if (v == null) return <span className="text-slate-300 text-sm">—</span>
  const color = v >= 70 ? 'text-emerald-600' : v >= 45 ? 'text-blue-600' : 'text-slate-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width: `${v}%`, background: v >= 70 ? '#10B981' : v >= 45 ? '#3B82F6' : '#CBD5E1' }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${color}`}>{v}</span>
    </div>
  )
}

// ─── Import modal ────────────────────────────────────────────────────────────
const TEMPLATE_COLS = [
  { col: 'first_name',    req: false, note: 'Contact first name' },
  { col: 'last_name',     req: false, note: 'Contact last name' },
  { col: 'company',       req: true,  note: 'Company name — only required column' },
  { col: 'title',         req: false, note: 'Job title / designation' },
  { col: 'domain',        req: false, note: 'Company domain — acme.com' },
  { col: 'email',         req: false, note: 'If filled, Hunter step is skipped' },
  { col: 'phone',         req: false, note: 'Mobile or office number' },
  { col: 'industry',      req: false, note: 'e.g. manufacturing, oil & gas' },
  { col: 'country',       req: false, note: 'Location — e.g. SA, Riyadh, US' },
  { col: 'employee_count',req: false, note: 'Number of employees' },
  { col: 'linkedin_url',  req: false, note: 'Full LinkedIn profile URL' },
]

function ImportModal({ onClose, onDone }) {
  const inputRef             = useRef(null)
  const [file, setFile]      = useState(null)
  const [dragging, setDrag]  = useState(false)
  const [status, setStatus]  = useState('idle')   // idle | uploading | done | error
  const [result, setResult]  = useState(null)

  const handleFile = (f) => {
    if (!f) return
    const ok = f.name.endsWith('.xlsx') || f.name.endsWith('.csv')
    if (!ok) { alert('Only .xlsx or .csv files are supported.'); return }
    setFile(f); setStatus('idle'); setResult(null)
  }

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false)
    handleFile(e.dataTransfer.files[0])
  }

  const upload = async () => {
    if (!file) return
    setStatus('uploading')
    const fd = new FormData()
    fd.append('file', file)
    try {
      const token = localStorage.getItem('lp_token')
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setResult(data); setStatus('done')
      onDone()
    } catch (err) {
      setResult({ error: err.message }); setStatus('error')
    }
  }

  const downloadTemplate = () => {
    const token = localStorage.getItem('lp_token')
    const link = document.createElement('a')
    link.href = '/api/leads/template'
    // pass token via query param isn't great for production, but works for local dev
    link.download = 'leads_template.csv'
    link.click()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-[2px]" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="relative bg-white rounded-2xl border border-slate-200 shadow-panel
                   w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-7 pt-7 pb-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Import leads</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Upload an Excel or CSV file — no API keys needed
            </p>
          </div>
          <button onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors mt-0.5">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <div className="px-7 py-6 space-y-6">
          {/* Format guide */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Required column format
              </h3>
              <button onClick={downloadTemplate}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700
                           font-medium transition-colors">
                <Download size={12} /> Download template (.csv)
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Column name</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-slate-600">Required</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {TEMPLATE_COLS.map(({ col, req, note }, i) => (
                    <tr key={col}
                      className={`border-b border-slate-100 last:border-0
                                  ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                      <td className="px-4 py-2.5">
                        <code className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                          {col}
                        </code>
                      </td>
                      <td className="text-center px-3 py-2.5">
                        {req
                          ? <span className="text-red-500 font-bold text-sm">*</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Column order doesn't matter. Headers are case-insensitive.
              <span className="text-emerald-600 font-medium ml-1">
                Leads with an email skip the Hunter enrichment step entirely.
              </span>
            </p>
          </div>

          {/* Drop zone */}
          {status !== 'done' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                          transition-colors
                          ${dragging
                            ? 'border-blue-400 bg-blue-50'
                            : file
                              ? 'border-emerald-300 bg-emerald-50/50'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.csv,.txt"
                className="hidden" onChange={e => handleFile(e.target.files[0])} />

              {file ? (
                <>
                  <FileSpreadsheet size={28} className="mx-auto text-emerald-500 mb-2" />
                  <p className="text-sm font-medium text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {(file.size / 1024).toFixed(1)} KB — click to change
                  </p>
                </>
              ) : (
                <>
                  <Upload size={24} className="mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-medium text-slate-700">
                    Drop your file here or click to browse
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Supports .xlsx and .csv</p>
                </>
              )}
            </div>
          )}

          {/* Result */}
          <AnimatePresence>
            {status === 'done' && result && (
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl"
              >
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={16} className="text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-800">Import complete</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center mb-3">
                  {[
                    { label: 'Imported', value: result.imported, color: 'text-emerald-700' },
                    { label: 'Skipped',  value: result.skipped,  color: 'text-amber-600' },
                    { label: 'Errors',   value: result.errors?.length || 0, color: 'text-red-500' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-white rounded-lg p-3 border border-emerald-100">
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                {result.errors?.length > 0 && (
                  <div className="mt-2 p-3 bg-white rounded-lg border border-amber-100">
                    <p className="text-xs font-medium text-amber-700 mb-1.5">Row warnings:</p>
                    {result.errors.slice(0, 5).map((e, i) => (
                      <p key={i} className="text-xs text-amber-600">{e}</p>
                    ))}
                  </div>
                )}
                <p className="text-xs text-emerald-700 mt-3 font-medium">
                  Next: run Score step to have Claude score your leads.
                </p>
              </motion.div>
            )}

            {status === 'error' && result?.error && (
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-50 border border-red-200 rounded-xl flex gap-3"
              >
                <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700">Upload failed</p>
                  <p className="text-xs text-red-600 mt-0.5">{result.error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            {status === 'done' ? (
              <button onClick={onClose}
                className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-medium
                           rounded-lg hover:bg-brand-700 transition-colors">
                Done
              </button>
            ) : (
              <>
                <button onClick={upload} disabled={!file || status === 'uploading'}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-600
                             text-white text-sm font-medium rounded-lg hover:bg-brand-700
                             transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {status === 'uploading'
                    ? <><Loader size={14} className="animate-spin" /> Importing...</>
                    : <><Upload size={14} /> Import leads</>}
                </button>
                <button onClick={onClose}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm
                             rounded-lg hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Add lead modal ───────────────────────────────────────────────────────────
const FIELDS = [
  { label: 'First name', key: 'first_name', required: true },
  { label: 'Last name',  key: 'last_name',  required: true },
  { label: 'Company',    key: 'company',    required: true },
  { label: 'Title',      key: 'title' },
  { label: 'Domain',     key: 'domain',     placeholder: 'acme.com' },
  { label: 'Email',      key: 'email',      type: 'email' },
  { label: 'Phone',      key: 'phone',      placeholder: '+966 5x xxx xxxx' },
  { label: 'Industry',   key: 'industry',   placeholder: 'e.g. manufacturing' },
  { label: 'Location',   key: 'country',    placeholder: 'e.g. SA, Riyadh, US' },
]

function AddModal({ onClose, onDone }) {
  const blank = { first_name:'', last_name:'', company:'', title:'', domain:'', email:'', phone:'', industry:'', country:'' }
  const [form, setForm]   = useState(blank)
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('')
    try { await leadsApi.add(form); onDone(); onClose() }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-[2px]" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="relative bg-white rounded-2xl border border-slate-200 shadow-panel
                   w-full max-w-lg p-7"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Add lead</h2>
            <p className="text-sm text-slate-500 mt-0.5">Manually add a contact to the pipeline</p>
          </div>
          <button onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-lg
                          text-red-600 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {FIELDS.map(({ label, key, required, type, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {label}{required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <input
                  type={type || 'text'} required={required} placeholder={placeholder}
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-white
                             placeholder:text-slate-400 focus:outline-none focus:ring-2
                             focus:ring-brand-500 focus:border-transparent transition"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-2.5">
            <button type="submit" disabled={busy}
              className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg
                         hover:bg-brand-700 transition-colors disabled:opacity-50">
              {busy ? 'Adding...' : 'Add lead'}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm
                         rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
const STATUSES = ['raw','enriched','scored','queued','sent','replied']
const SOURCES  = ['apollo','import']
const SORTABLE = { 'Contact': 'name', 'Company': 'company', 'Status': 'status', 'ICP Score': 'score' }

export default function Leads() {
  const { user }       = useAuth()
  const navigate       = useNavigate()
  const location       = useLocation()
  const { push }       = useToast()
  const confirm        = useConfirm()
  const [sortBy, setSortBy] = useState('created')
  const [sortDir, setSortDir] = useState('desc')
  const [pageSize, setPageSize] = useState(25)
  const [data, setData]         = useState({ leads: [], total: 0, pages: 1 })
  const [page, setPage]         = useState(1)
  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [loading, setLoading]       = useState(true)
  const [showAdd, setShowAdd]       = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [deleting, setDeleting]     = useState(null)
  const [scoring, setScoring]       = useState(new Set())
  const [drawerId, setDrawerId]     = useState(null)
  const [selected, setSelected]     = useState(new Set())
  const [bulkScoring, setBulkScoring] = useState(false)
  const [segments, setSegments]     = useState(loadSegments)
  const [agents, setAgents]         = useState([])
  const [assignAgent, setAssignAgent] = useState('')
  const [assigning, setAssigning]   = useState(false)
  const [ownerFilter, setOwnerFilter] = useState('')   // '' | 'unassigned' | agentId
  const [drawerAction, setDrawerAction] = useState(null)

  // Load assignable agents (managers/admins only)
  useEffect(() => {
    if (can(user, 'assign')) {
      usersApi.list().then(list => setAgents((list || []).filter(u => u.role === 'agent'))).catch(() => {})
    }
  }, [user])

  const openDrawer = (id, action = null) => { setDrawerAction(action); setDrawerId(id) }
  const [callLead, setCallLead] = useState(null)
  const startCall = (lead) => { setDrawerId(null); setDrawerAction(null); setCallLead(lead) }

  // Inline per-row assign / reassign / unassign
  const assignOne = async (id, agentId) => {
    try {
      await leadsApi.assign(id, agentId || null)
      const name = agents.find(a => a.id === agentId)?.name || null
      setData(d => ({ ...d, leads: d.leads.map(l => l.id === id
        ? { ...l, assigned_to: agentId || null, assigned_to_name: name } : l) }))
      push(agentId ? `Assigned to ${name}` : 'Unassigned', 'success')
    } catch (e) { push(`Assign failed: ${e.message}`, 'error') }
  }

  const bulkAssign = async () => {
    if (!assignAgent) { push('Pick an agent first', 'error'); return }
    let ids = [...selected]
    // Re-assignment guard: don't silently overwrite existing owners
    const owned = ids.filter(id => data.leads.find(l => l.id === id)?.assigned_to)
    if (owned.length) {
      const ok = await confirm({
        title: 'Some leads are already assigned',
        message: `${owned.length} of ${ids.length} selected already have an owner.\nReassign all to the new agent, or assign only the ${ids.length - owned.length} unassigned?`,
        confirmLabel: 'Reassign all', cancelLabel: 'Only unassigned',
      })
      if (!ok) ids = ids.filter(id => !data.leads.find(l => l.id === id)?.assigned_to)
    }
    if (!ids.length) { push('Nothing to assign', 'info'); return }
    setAssigning(true)
    try {
      const r = await leadsApi.bulkAssign(ids, assignAgent)
      const name = agents.find(a => a.id === assignAgent)?.name || 'agent'
      push(`Assigned ${r.assigned} lead${r.assigned === 1 ? '' : 's'} to ${name}`, 'success')
      clearSel(); setAssignAgent(''); fetch()
    } catch (e) { push(`Assign failed: ${e.message}`, 'error') }
    finally { setAssigning(false) }
  }

  // Prefill search when arriving from the command palette
  useEffect(() => {
    if (location.state?.search) {
      setRawSearch(location.state.search)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state])

  const toggleSel = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const clearSel  = () => setSelected(new Set())

  const applySegment = (seg) => {
    setStatusFilter(seg.status || ''); setSourceFilter(seg.source || '')
    setRawSearch(seg.search || ''); setPage(1)
  }
  const saveCurrentSegment = () => {
    const name = prompt('Name this view (e.g. "High-intent Saudi")')
    if (!name) return
    const seg = { id: Date.now(), name, status: statusFilter, source: sourceFilter, search }
    const next = [...segments, seg]; setSegments(next); saveSegments(next)
    push(`Saved view "${name}"`, 'success')
  }
  const deleteSegment = (id) => {
    const next = segments.filter(s => s.id !== id); setSegments(next); saveSegments(next)
  }

  const bulkScore = async () => {
    const ids = [...selected]
    setBulkScoring(true)
    let ok = 0
    for (const id of ids) {
      try { await leadsApi.score(id); ok++ } catch { /* keep going */ }
    }
    setBulkScoring(false); clearSel(); fetch()
    push(`Scored ${ok} of ${ids.length} selected lead${ids.length > 1 ? 's' : ''}`, ok ? 'success' : 'error')
  }

  const fetch = useCallback(async () => {
    setLoading(true)
    const params = { page, limit: pageSize, sort: sortBy, direction: sortDir }
    if (search) params.search = search
    if (statusFilter) params.status = statusFilter
    if (sourceFilter) params.source = sourceFilter
    if (ownerFilter) params.assigned_to = ownerFilter
    const res = await leadsApi.list(params).catch(() => ({ leads: [], total: 0, pages: 1 }))
    setData(res)
    setLoading(false)
  }, [page, search, statusFilter, sourceFilter, ownerFilter, sortBy, sortDir, pageSize])

  // Toggle sort on a column (click header)
  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
    setPage(1)
  }

  useEffect(() => { fetch() }, [fetch])

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(rawSearch); setPage(1) }, 380)
    return () => clearTimeout(t)
  }, [rawSearch])

  const deleteLead = async (id) => {
    if (!(await confirm({ title: 'Remove lead?', message: 'This deletes the lead and its history. This cannot be undone.', confirmLabel: 'Remove', danger: true }))) return
    setDeleting(id)
    await leadsApi.remove(id).catch(console.error)
    fetch()
    setDeleting(null)
  }

  const scoreLead = async (id) => {
    setScoring(s => new Set([...s, id]))
    try {
      const result = await leadsApi.score(id)
      // Update just that lead in local state — no full reload needed
      setData(d => ({
        ...d,
        leads: d.leads.map(l => l.id === id ? {
          ...l,
          icp_score:      result.icp_score,
          scored_intent:  result.intent_level,
          offering_match: result.offering_match,
          score_reason:   result.reason,
          status: result.icp_score >= 45
            ? (l.status === 'queued' ? 'queued' : 'queued')
            : l.status,
        } : l),
      }))
      push(`Scored ${result.icp_score} · ${result.intent_level} intent`, 'success')
    } catch (err) {
      push(`Scoring failed: ${err.message}`, 'error')
    } finally {
      setScoring(s => { const n = new Set(s); n.delete(id); return n })
    }
  }

  const exportCSV = () => {
    const rows = [
      ['First Name','Last Name','Company','Title','Email','Status','ICP Score','Source'],
      ...data.leads.map(l => [
        l.first_name, l.last_name, l.company, l.title,
        l.email || '', l.status, l.icp_score ?? '', l.source,
      ]),
    ]
    const csv  = rows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href  = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    link.download = `leads-${new Date().toISOString().slice(0,10)}.csv`
    link.click()
  }

  const COLS = [
    { label: 'Contact',   w: '' },
    { label: 'Company',   w: 'w-36' },
    { label: 'Title',     w: 'w-40' },
    { label: 'Email',     w: 'w-48' },
    { label: 'Phone',     w: 'w-36' },
    { label: 'Industry',  w: 'w-32' },
    { label: 'Location',  w: 'w-20' },
    { label: 'Source',    w: 'w-24' },
    { label: 'Status',    w: 'w-28' },
    { label: 'ICP Score', w: 'w-32' },
    { label: 'Owner',     w: 'w-32' },
    { label: '',          w: 'w-20' },
  ]

  return (
    <motion.div {...pageAnim} className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Leads</h1>
          <p className="text-sm text-slate-500 mt-1">
            {data.total.toLocaleString()} contacts in pipeline
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white
                       text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors">
            <Download size={14} /> Export CSV
          </button>
          {can(user, 'edit') && (
            <>
              <button onClick={() => setShowImport(true)}
                className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 bg-white
                           text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors">
                <Upload size={14} /> Import Excel
              </button>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-3.5 py-2 bg-brand-600 text-white
                           text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
                <Plus size={14} /> Add lead
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2.5 mb-5">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={rawSearch}
            onChange={e => setRawSearch(e.target.value)}
            placeholder="Search name, company, email..."
            className="pl-9 pr-4 py-2 border border-slate-200 bg-white rounded-lg text-sm w-72
                       focus:outline-none focus:ring-2 focus:ring-brand-500 transition
                       placeholder:text-slate-400"
          />
          {rawSearch && (
            <button onClick={() => setRawSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <SlidersHorizontal size={13} className="text-slate-400 ml-1" />
          <button onClick={() => { setStatusFilter(''); setPage(1) }}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors
                        ${!statusFilter ? 'bg-brand-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            All
          </button>
          {STATUSES.map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors
                          ${statusFilter === s ? 'bg-brand-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400 font-medium ml-1 uppercase tracking-wide">Source</span>
          <button onClick={() => { setSourceFilter(''); setPage(1) }}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors
                        ${!sourceFilter ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            All
          </button>
          {SOURCES.map(s => (
            <button key={s} onClick={() => { setSourceFilter(s); setPage(1) }}
              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors
                          ${sourceFilter === s ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {s}
            </button>
          ))}
        </div>

        {/* Owner filter (managers/admins) */}
        {can(user, 'assign') && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400 font-medium ml-1 uppercase tracking-wide">Owner</span>
            <select value={ownerFilter} onChange={e => { setOwnerFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 bg-white
                         focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">All owners</option>
              <option value="unassigned">Unassigned</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Saved views */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Bookmark size={13} className="text-slate-400" />
        <span className="text-[11px] text-slate-400 uppercase tracking-wide font-medium mr-1">Saved views</span>
        {segments.map(seg => (
          <span key={seg.id}
            className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border border-slate-200 bg-white text-xs text-slate-600 hover:border-slate-300 transition-colors">
            <button onClick={() => applySegment(seg)} className="hover:text-slate-900">{seg.name}</button>
            <button onClick={() => deleteSegment(seg.id)} className="text-slate-300 hover:text-red-500 transition-colors"><X size={11} /></button>
          </span>
        ))}
        {segments.length === 0 && <span className="text-xs text-slate-400">none yet</span>}
        {can(user, 'edit') && (
          <button onClick={saveCurrentSegment}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium ml-1">
            <BookmarkPlus size={12} /> Save current filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {can(user, 'edit') && (
                  <th className="pl-4 pr-1 py-3 w-8">
                    <button onClick={() => {
                      const allSel = data.leads.length > 0 && data.leads.every(l => selected.has(l.id))
                      setSelected(s => {
                        const n = new Set(s)
                        data.leads.forEach(l => allSel ? n.delete(l.id) : n.add(l.id))
                        return n
                      })
                    }} className="text-slate-400 hover:text-slate-700 transition-colors align-middle">
                      {data.leads.length > 0 && data.leads.every(l => selected.has(l.id))
                        ? <CheckSquare size={15} className="text-slate-700" /> : <Square size={15} />}
                    </button>
                  </th>
                )}
                {COLS.map(({ label, w }) => {
                  const skey = SORTABLE[label]
                  return (
                    <th key={label}
                      className={`px-4 py-3 text-left text-[11px] font-semibold text-slate-500
                                  uppercase tracking-wider whitespace-nowrap ${w}`}>
                      {skey ? (
                        <button onClick={() => toggleSort(skey)}
                          className={`inline-flex items-center gap-1 uppercase tracking-wider transition-colors
                                      ${sortBy === skey ? 'text-slate-800' : 'hover:text-slate-700'}`}>
                          {label}
                          <span className="text-[9px]">{sortBy === skey ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
                        </button>
                      ) : label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(8).fill(0).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {can(user, 'edit') && <td className="pl-4 pr-1 py-3.5 w-8"><div className="skeleton h-3.5 w-3.5 rounded" /></td>}
                    {COLS.map((_, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="skeleton h-3 rounded" style={{ width: `${45 + (i + j) * 7 % 45}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.leads.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length + (can(user, 'edit') ? 1 : 0)} className="px-4 py-20 text-center">
                    <p className="text-sm text-slate-400">No leads found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {search || statusFilter || sourceFilter ? 'Try adjusting your filters' : 'Run the collect step or add a lead manually'}
                    </p>
                  </td>
                </tr>
              ) : (
                data.leads.map((lead, i) => {
                  const hasName = lead.first_name || lead.last_name
                  const name    = hasName
                    ? [lead.first_name, lead.last_name].filter(Boolean).join(' ')
                    : lead.company || '—'
                  const initial = (lead.first_name?.[0] || lead.company?.[0] || '?').toUpperCase()
                  return (
                    <motion.tr key={lead.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i, 12) * 0.02 }}
                      onClick={() => openDrawer(lead.id)}
                      className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors group cursor-pointer
                                  ${selected.has(lead.id) ? 'bg-blue-50/40' : ''}`}
                    >
                      {can(user, 'edit') && (
                        <td className="pl-4 pr-1 py-3.5 w-8" onClick={e => e.stopPropagation()}>
                          <button onClick={() => toggleSel(lead.id)}
                            className="text-slate-300 hover:text-slate-600 transition-colors align-middle">
                            {selected.has(lead.id)
                              ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} />}
                          </button>
                        </td>
                      )}
                      {/* Contact */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full border flex items-center justify-center
                                          text-xs font-semibold flex-shrink-0
                                          ${hasName
                                            ? 'bg-brand-600 border-slate-700 text-white'
                                            : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <span className={`text-sm font-medium whitespace-nowrap
                                            ${hasName ? 'text-slate-900' : 'text-slate-400 italic'}`}>
                              {name}
                            </span>
                            {!hasName && (
                              <span className="block text-[10px] text-slate-300 leading-none mt-0.5">
                                no contact name
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-700 whitespace-nowrap">
                        {lead.company || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-500 max-w-[160px] truncate">
                        {lead.title || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-500 whitespace-nowrap">
                        {lead.email || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-500 whitespace-nowrap font-mono text-xs">
                        {lead.phone || <span className="text-slate-300 font-sans text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 capitalize whitespace-nowrap">
                        {lead.industry || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                        {lead.country || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 capitalize">
                          {lead.source || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5"><Badge map={STATUS} value={lead.status} /></td>
                      <td className="px-4 py-3.5"><Score v={lead.icp_score} /></td>
                      <td className="px-4 py-3.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        {can(user, 'assign') ? (
                          <select value={lead.assigned_to || ''} onChange={e => assignOne(lead.id, e.target.value)}
                            className={`text-xs border rounded-lg px-2 py-1 bg-white max-w-[140px] focus:outline-none focus:ring-2 focus:ring-brand-500
                                        ${lead.assigned_to ? 'border-slate-200 text-slate-700' : 'border-dashed border-slate-300 text-slate-400'}`}>
                            <option value="">Unassigned</option>
                            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        ) : (
                          lead.assigned_to_name
                            ? <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                                <span className="w-5 h-5 rounded-full bg-brand-600 text-white text-[10px] flex items-center justify-center font-semibold">
                                  {lead.assigned_to_name[0]?.toUpperCase()}
                                </span>
                                {lead.assigned_to_name}
                              </span>
                            : <span className="text-xs text-slate-300">Unassigned</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {can(user, 'log') && (
                            <button
                              onClick={() => startCall(lead)}
                              title="Start guided call"
                              className="p-1.5 hover:bg-cyan-50 hover:text-cyan-600 rounded-lg
                                         transition-colors text-slate-400">
                              <Phone size={14} />
                            </button>
                          )}
                          {can(user, 'edit') && (
                            <button
                              onClick={() => scoreLead(lead.id)}
                              disabled={scoring.has(lead.id)}
                              title="Score with Groq AI"
                              className="p-1.5 hover:bg-amber-50 hover:text-amber-600 rounded-lg
                                         transition-colors text-slate-400 disabled:opacity-50">
                              {scoring.has(lead.id)
                                ? <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                                : <Zap size={14} />}
                            </button>
                          )}
                          {can(user, 'send') && lead.email && (
                            <button title="Compose email"
                              onClick={() => navigate('/compose', { state: { lead } })}
                              className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg
                                         transition-colors text-slate-400">
                              <Mail size={14} />
                            </button>
                          )}
                          {can(user, 'delete') && (
                            <button onClick={() => deleteLead(lead.id)} disabled={deleting === lead.id}
                              title="Delete lead"
                              className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg
                                         transition-colors text-slate-400 disabled:opacity-50">
                              {deleting === lead.id
                                ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                : <Trash2 size={14} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: total + page size + pager */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 bg-slate-50/40">
          <div className="flex items-center gap-4">
            <p className="text-xs text-slate-500">
              {data.total.toLocaleString()} leads &mdash; page {page} of {data.pages}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Rows</span>
              <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                {[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          {data.pages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50
                           disabled:opacity-40 transition-colors bg-white">
                <ChevronLeft size={14} className="text-slate-600" />
              </button>
              {Array.from({ length: Math.min(5, data.pages) }, (_, i) => {
                const pg = page <= 3 ? i + 1 : page - 2 + i
                if (pg > data.pages) return null
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    className={`w-8 h-8 text-xs rounded-lg transition-colors font-medium
                                ${pg === page
                                  ? 'bg-brand-600 text-white'
                                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white'}`}>
                    {pg}
                  </button>
                )
              })}
              <button onClick={() => setPage(p => Math.min(data.pages, p+1))} disabled={page === data.pages}
                className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50
                           disabled:opacity-40 transition-colors bg-white">
                <ChevronRight size={14} className="text-slate-600" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {can(user, 'edit') && selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="fixed bottom-6 left-1/2 z-40 flex items-center gap-3 bg-brand-600 text-white
                       rounded-xl shadow-panel px-4 py-3">
            <span className="text-sm">{selected.size} selected</span>
            <div className="w-px h-5 bg-white/20" />
            {can(user, 'assign') && (
              <div className="flex items-center gap-1.5">
                <select value={assignAgent} onChange={e => setAssignAgent(e.target.value)}
                  className="bg-slate-800 text-white text-xs rounded-lg px-2 py-1.5 border border-white/10 focus:outline-none">
                  <option value="">Assign to…</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button onClick={bulkAssign} disabled={assigning || !assignAgent}
                  className="flex items-center gap-1.5 text-sm font-medium hover:text-blue-300 transition-colors disabled:opacity-40">
                  {assigning
                    ? <div className="w-3.5 h-3.5 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                    : <UserCheck size={14} />}
                  Assign
                </button>
                <div className="w-px h-5 bg-white/20" />
              </div>
            )}
            <button onClick={bulkScore} disabled={bulkScoring}
              className="flex items-center gap-1.5 text-sm font-medium hover:text-amber-300 transition-colors disabled:opacity-50">
              {bulkScoring
                ? <><div className="w-3.5 h-3.5 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" /> Scoring…</>
                : <><Zap size={14} /> Score selected</>}
            </button>
            <button onClick={clearSel} className="text-slate-400 hover:text-white transition-colors"><X size={15} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawerId && (
          <LeadDrawer leadId={drawerId} user={user} initialAction={drawerAction}
            onClose={() => { setDrawerId(null); setDrawerAction(null) }}
            onChanged={fetch}
            onStartCall={startCall}
            onCompose={(lead) => { setDrawerId(null); navigate('/compose', { state: { lead } }) }} />
        )}
        {callLead && (
          <CallConsole lead={callLead} onClose={() => setCallLead(null)} onLogged={fetch} />
        )}
        {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={fetch} />}
        {showAdd    && <AddModal    onClose={() => setShowAdd(false)}    onDone={fetch} />}
      </AnimatePresence>
    </motion.div>
  )
}
