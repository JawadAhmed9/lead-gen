import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UserPlus, Trash2, Shield, X, Mail, Users2, RefreshCw } from 'lucide-react'
import { usersApi, can } from './api'
import { useAuth, pageAnim } from './App'
import { useToast, Skeleton } from './ui'

const ROLE_STYLE = {
  admin: 'bg-purple-50 text-purple-700 border-purple-100',
  manager: 'bg-blue-50 text-blue-700 border-blue-100',
  agent: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  viewer: 'bg-slate-100 text-slate-600 border-slate-200',
}

export default function Team() {
  const { user } = useAuth()
  const { push } = useToast()
  const [members, setMembers] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent' })
  const [saving, setSaving] = useState(false)

  const isAdmin = user.role === 'admin'
  const load = () => usersApi.list().then(setMembers).catch(() => setMembers([]))
  useEffect(() => { load() }, [])

  const add = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      // managers always create agents; admins may pick role
      const payload = isAdmin ? form : { ...form, role: 'agent' }
      await usersApi.invite(payload)
      push(`Added ${form.name}`, 'success')
      setForm({ name: '', email: '', password: '', role: 'agent' }); setShowForm(false); load()
    } catch (err) { push(err.message, 'error') }
    finally { setSaving(false) }
  }

  const remove = async (m) => {
    if (!confirm(`Remove ${m.name}?`)) return
    try { await usersApi.remove(m.id); setMembers(list => list.filter(x => x.id !== m.id)); push(`Removed ${m.name}`, 'info') }
    catch (err) { push(err.message, 'error') }
  }

  const changeRole = async (m, role) => {
    try { await usersApi.setRole(m.id, role); setMembers(list => list.map(x => x.id === m.id ? { ...x, role } : x)) }
    catch (err) { push(err.message, 'error') }
  }

  const agents = (members || []).filter(m => m.role === 'agent')
  const others = (members || []).filter(m => m.role !== 'agent')

  return (
    <motion.div {...pageAnim} className="p-8 max-w-[900px]">
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Team</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAdmin ? 'Manage everyone in the workspace' : 'Manage the agents on your team'}
          </p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800">
          <UserPlus size={14} /> Add {isAdmin ? 'member' : 'agent'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form onSubmit={add} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-6">
            <div className="p-5 bg-white border border-slate-200 rounded-xl grid grid-cols-2 gap-3">
              <input required placeholder="Full name" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input required type="email" placeholder="Email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input required type="password" placeholder="Temp password" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {isAdmin ? (
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="agent">Agent</option>
                  <option value="manager">Manager</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <div className="px-3 py-2 text-sm text-slate-400 flex items-center">Role: Agent (your team)</div>
              )}
              <div className="col-span-2 flex gap-2">
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50">
                  {saving ? 'Adding…' : 'Add to team'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {members == null ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Users2 size={14} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Agents ({agents.length})</h2>
          </div>
          <div className="space-y-2 mb-8">
            {agents.length === 0 && <p className="text-sm text-slate-400 px-1">No agents yet — add one above.</p>}
            {agents.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-100 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-slate-900 text-white text-sm flex items-center justify-center font-semibold">{m.name[0]?.toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                  <p className="text-xs text-slate-500 truncate flex items-center gap-1"><Mail size={10} /> {m.email}</p>
                </div>
                <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium border capitalize ${ROLE_STYLE[m.role]}`}>{m.role}</span>
                <button onClick={() => remove(m)} className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg text-slate-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          {others.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Shield size={14} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-700">Managers & staff</h2>
              </div>
              <div className="space-y-2">
                {others.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-100 rounded-xl">
                    <div className="w-9 h-9 rounded-full bg-slate-700 text-white text-sm flex items-center justify-center font-semibold">{m.name[0]?.toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{m.name}</p>
                      <p className="text-xs text-slate-500 truncate">{m.email}</p>
                    </div>
                    {isAdmin && m.id !== user.id ? (
                      <select value={m.role} onChange={e => changeRole(m, e.target.value)}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white capitalize focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {['admin', 'manager', 'agent', 'viewer'].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : (
                      <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium border capitalize ${ROLE_STYLE[m.role]}`}>{m.role}</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </motion.div>
  )
}
