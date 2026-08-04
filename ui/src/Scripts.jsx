import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Pencil, X, FileText, Save, GripVertical } from 'lucide-react'
import { scriptsApi } from './api'
import { pageAnim } from './App'
import { useToast, useConfirm, Skeleton } from './ui'

const PHASE_COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#0891B2']
const blankPhase = () => ({ phase: '', points: '' })

// editor modal
function ScriptEditor({ initial, onClose, onSaved }) {
  const { push } = useToast()
  const [name, setName] = useState(initial?.name || '')
  const [category, setCategory] = useState(initial?.category || 'General')
  const [phases, setPhases] = useState(
    initial?.steps?.length
      ? initial.steps.map(s => ({ phase: s.phase, points: (s.points || []).join('\n') }))
      : [{ phase: 'Opening', points: '' }, { phase: 'Discovery', points: '' }, { phase: 'Value & Close', points: '' }]
  )
  const [saving, setSaving] = useState(false)

  const setPhase = (i, field, val) => setPhases(ps => ps.map((p, j) => j === i ? { ...p, [field]: val } : p))
  const addPhase = () => setPhases(ps => [...ps, blankPhase()])
  const removePhase = (i) => setPhases(ps => ps.filter((_, j) => j !== i))

  const save = async () => {
    if (!name.trim()) { push('Give the script a name', 'error'); return }
    const steps = phases.filter(p => p.phase.trim()).map((p, i) => ({
      phase: p.phase.trim(), seconds: 60, color: PHASE_COLORS[i % PHASE_COLORS.length],
      points: p.points.split('\n').map(l => l.trim()).filter(Boolean),
    }))
    setSaving(true)
    try {
      const payload = { name: name.trim(), category: category.trim() || 'General', steps }
      if (initial?.id) await scriptsApi.update(initial.id, payload)
      else await scriptsApi.create(payload)
      push('Script saved', 'success'); onSaved(); onClose()
    } catch (e) { push(e.message, 'error') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        className="relative bg-white rounded-2xl border border-slate-200 shadow-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">{initial?.id ? 'Edit script' : 'New script'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={16} className="text-slate-500" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Script name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Enterprise manufacturers"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Client category</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Manufacturing"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Phases &amp; talking points</p>
            {phases.map((p, i) => (
              <div key={i} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: PHASE_COLORS[i % PHASE_COLORS.length] }} />
                  <input value={p.phase} onChange={e => setPhase(i, 'phase', e.target.value)} placeholder={`Phase ${i + 1} name`}
                    className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  {phases.length > 1 && (
                    <button onClick={() => removePhase(i)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                  )}
                </div>
                <textarea value={p.points} onChange={e => setPhase(i, 'points', e.target.value)} rows={4}
                  placeholder="One talking point per line…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            ))}
            <button onClick={addPhase} className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700">
              <Plus size={13} /> Add phase
            </button>
          </div>

          <div className="flex gap-2.5 pt-2">
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              <Save size={14} /> {saving ? 'Saving…' : 'Save script'}
            </button>
            <button onClick={onClose} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default function Scripts() {
  const { push } = useToast()
  const confirm = useConfirm()
  const [scripts, setScripts] = useState(null)
  const [editing, setEditing] = useState(null)   // {} for new, script for edit, null closed

  const load = () => scriptsApi.list().then(r => setScripts(r.scripts || [])).catch(() => setScripts([]))
  useEffect(() => { load() }, [])

  const remove = async (s) => {
    if (!(await confirm({ title: `Delete "${s.name}"?`, message: 'Agents will no longer see this script.', confirmLabel: 'Delete', danger: true }))) return
    await scriptsApi.remove(s.id).catch(() => {}); push('Script deleted', 'info'); load()
  }

  const categories = [...new Set((scripts || []).map(s => s.category || 'General'))]

  return (
    <motion.div {...pageAnim} className="p-8 max-w-[900px]">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Call scripts</h1>
          <p className="text-sm text-slate-500 mt-1">Talk-tracks agents pick from during calls — organized by client category.</p>
        </div>
        <button onClick={() => setEditing({})}
          className="flex items-center gap-2 px-3.5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
          <Plus size={14} /> New script
        </button>
      </div>

      {scripts === null ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : scripts.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-xl py-16 text-center">
          <FileText size={22} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">No scripts yet — create one for agents to use on calls.</p>
        </div>
      ) : categories.map(cat => (
        <div key={cat} className="mb-6">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{cat}</h2>
          <div className="space-y-2">
            {scripts.filter(s => (s.category || 'General') === cat).map(s => (
              <div key={s.id} className="bg-white border border-slate-100 rounded-xl p-4 flex items-start gap-3">
                <FileText size={16} className="text-slate-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{s.name}{s.is_default ? <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">default</span> : null}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.steps?.length || 0} phases · {(s.steps || []).reduce((n, p) => n + (p.points?.length || 0), 0)} talking points</p>
                </div>
                <button onClick={() => setEditing(s)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><Pencil size={14} /></button>
                <button onClick={() => remove(s)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <AnimatePresence>
        {editing !== null && <ScriptEditor initial={editing} onClose={() => setEditing(null)} onSaved={load} />}
      </AnimatePresence>
    </motion.div>
  )
}
