import React from 'react'

// Stemronic AI hexagon-node mark — crisp, scalable, transparent.
// Works on light and dark surfaces. Pass `glow` for the login hero.
export function Logo({ size = 32, className = '', glow = false, id = 'stem' }) {
  const cx = 50, cy = 50, outerR = 46, innerR = 21, node = 3.8
  const ang = (i) => (Math.PI / 180) * (-90 + i * 60)
  const pt = (r, i) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))]
  const hex = (r) => [0, 1, 2, 3, 4, 5].map(i => pt(r, i).map(n => n.toFixed(2)).join(',')).join(' ')
  const inner = [0, 1, 2, 3, 4, 5].map(i => pt(innerR, i))
  const gid = `${id}-grad`, fid = `${id}-glow`

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}
         fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6BB8FF" />
          <stop offset="52%" stopColor="#2B84FF" />
          <stop offset="100%" stopColor="#0B57D0" />
        </linearGradient>
        {glow && (
          <filter id={fid} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>
      <g filter={glow ? `url(#${fid})` : undefined}>
        <g stroke={`url(#${gid})`} strokeLinejoin="round" strokeLinecap="round">
          <polygon points={hex(outerR)} strokeWidth="3.4" />
          <polygon points={hex(innerR)} strokeWidth="1.7" opacity="0.9" />
          {inner.map(([x, y], i) => (
            <line key={i} x1={cx} y1={cy} x2={x.toFixed(2)} y2={y.toFixed(2)} strokeWidth="1.7" opacity="0.9" />
          ))}
        </g>
        <g fill={`url(#${gid})`}>
          <circle cx={cx} cy={cy} r={node} />
          {inner.map(([x, y], i) => <circle key={i} cx={x.toFixed(2)} cy={y.toFixed(2)} r={node} />)}
        </g>
      </g>
    </svg>
  )
}

// Full lockup: mark + wordmark (+ optional product subtitle).
export function Wordmark({ size = 30, subtitle = false, dark = false, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Logo size={size} />
      <div className="leading-none">
        <div className={`font-bold tracking-tight ${dark ? 'text-white' : 'text-navy-900'}`}
             style={{ fontSize: size * 0.62 }}>
          Stemronic <span className="text-brand-500">AI</span>
        </div>
        {subtitle && (
          <div className={`uppercase tracking-[0.18em] mt-1 ${dark ? 'text-slate-400' : 'text-slate-400'}`}
               style={{ fontSize: size * 0.3 }}>
            Lead Gen Platform
          </div>
        )}
      </div>
    </div>
  )
}

export default Logo
