import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { Sun, Moon } from 'lucide-react'

const KEY = 'elchai_theme'
const ThemeCtx = createContext(null)
export const useTheme = () => useContext(ThemeCtx)

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches
const readMode = () => {
  const t = localStorage.getItem(KEY)
  return t === 'light' || t === 'dark' ? t : 'system'
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readMode)          // 'light' | 'dark' | 'system'
  const resolved = mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode

  const apply = useCallback((res) => {
    const el = document.documentElement
    el.classList.add('theme-anim')
    el.setAttribute('data-theme', res)
    clearTimeout(apply._t)
    apply._t = setTimeout(() => el.classList.remove('theme-anim'), 340)
  }, [])

  useEffect(() => { apply(resolved) }, [resolved, apply])

  // Follow the OS while in "system" mode
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onCh = () => apply(systemDark() ? 'dark' : 'light')
    mq.addEventListener?.('change', onCh)
    return () => mq.removeEventListener?.('change', onCh)
  }, [mode, apply])

  const setMode = useCallback((m) => {
    if (m === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, m)
    setModeState(m)
  }, [])

  const toggle = useCallback(() => setMode(resolved === 'dark' ? 'light' : 'dark'), [resolved, setMode])

  return <ThemeCtx.Provider value={{ mode, resolved, setMode, toggle }}>{children}</ThemeCtx.Provider>
}

export function ThemeToggle({ className = '' }) {
  const { resolved, toggle } = useTheme()
  const dark = resolved === 'dark'
  return (
    <button onClick={toggle} aria-label="Toggle theme" title="Toggle light / dark"
      className={`p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors ${className}`}>
      <span className="relative block w-[18px] h-[18px]">
        <Sun size={18} className={`absolute inset-0 transition-all duration-300 ${dark ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'}`} />
        <Moon size={18} className={`absolute inset-0 transition-all duration-300 ${dark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'}`} />
      </span>
    </button>
  )
}

export function ThemeSegmented() {
  const { mode, setMode } = useTheme()
  const opts = [['light', 'Light'], ['system', 'System'], ['dark', 'Dark']]
  return (
    <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1">
      {opts.map(([v, label]) => (
        <button key={v} onClick={() => setMode(v)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                      ${mode === v ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}
