import { NavLink, useLocation } from 'react-router-dom'
import { Icon } from './icons.jsx'

const NAV = [
  { id: 'sessions', to: '/sessions', label: 'Sessions', icon: 'sessions', end: true },
  { id: 'live', to: '/live', label: 'Live Audit', icon: 'live' },
  { id: 'flags', to: '/flags', label: 'Flags', icon: 'flags' },
  { id: 'reports', to: '/audit', label: 'Reports', icon: 'reports' },
  { id: 'about', to: '/about', label: 'About', icon: 'about' },
  { id: 'settings', to: '/settings', label: 'Settings', icon: 'settings' },
]

function routeActive(pathname, item) {
  if (item.id === 'sessions') {
    return pathname === '/' || pathname === '/sessions' || pathname.startsWith('/sessions/')
  }
  return pathname.startsWith(item.to)
}

export function Sidebar({ flagCount = 0, isConnected = true, auditState }) {
  const location = useLocation()

  return (
    <aside
      style={{
        width: 220,
        flex: '0 0 220px',
        background: 'var(--bg-soft)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--s-5) var(--s-3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 18px' }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 4px 12px rgba(99,102,241,0.35)',
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            fontFamily: 'var(--font-mono)',
          }}
        >
          S
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, gap: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Sentinel</span>
          <span style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.25 }}>LLM Behavioral Intelligence</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>v1.0.0</span>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((item) => {
          const active = routeActive(location.pathname, item)
          return (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end}
              className="aaa-focus"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 'var(--r-md)',
                color: active ? 'var(--text)' : 'var(--text-soft)',
                background: active ? 'rgba(255,255,255,0.04)' : 'transparent',
                fontSize: 13,
                fontWeight: active ? 500 : 400,
                textDecoration: 'none',
                position: 'relative',
              }}
            >
              {active ? (
                <span
                  style={{
                    position: 'absolute',
                    left: -12,
                    top: 6,
                    bottom: 6,
                    width: 2,
                    background: 'var(--primary)',
                    borderRadius: 2,
                  }}
                />
              ) : null}
              <Icon name={item.icon} size={16} color={active ? 'var(--text)' : 'var(--muted)'} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.id === 'flags' && flagCount > 0 ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--danger)',
                    background: 'var(--danger-soft)',
                    border: '1px solid var(--danger-line)',
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {flagCount}
                </span>
              ) : null}
              {item.id === 'live' && auditState?.status === 'running' ? (
                <span style={{ fontSize: 10, color: 'var(--primary)' }}>●</span>
              ) : null}
            </NavLink>
          )
        })}
      </nav>

      <div style={{ flex: 1 }} />

      <div
        style={{
          padding: '10px 10px',
          borderTop: '1px solid var(--border)',
          marginTop: 'var(--s-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: isConnected ? 'var(--success)' : 'var(--danger)' }}>
            <span className="aaa-pulse-dot" style={{ background: 'currentColor' }} />
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>{isConnected ? 'Connected' : 'Offline'}</span>
        </div>
        <div className="aaa-mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
          127.0.0.1:8000
        </div>
      </div>
    </aside>
  )
}

export function Topbar({ crumbs = ['Sessions'], right = null }) {
  return (
    <header
      style={{
        height: 52,
        flex: '0 0 52px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--s-6)',
        gap: 'var(--s-4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-soft)', fontSize: 13 }}>
        {crumbs.map((c, i) => (
          <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {i > 0 ? <span style={{ color: 'var(--muted-2)' }}>/</span> : null}
            <span style={{ color: i === crumbs.length - 1 ? 'var(--text)' : 'var(--muted)' }}>{c}</span>
          </span>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      {right}
    </header>
  )
}

export function AppFrame({ crumbs, topbarRight, children, flagCount, isConnected, auditState, rightPanel }) {
  return (
    <div
      className="aaa-root"
      style={{
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        background: 'var(--bg)',
      }}
    >
      <Sidebar flagCount={flagCount} isConnected={isConnected} auditState={auditState} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar crumbs={crumbs} right={topbarRight} />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <div className="aaa-scroll" style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
            {children}
          </div>
          {rightPanel ? (
            <aside
              style={{
                width: 320,
                flex: '0 0 320px',
                borderLeft: '1px solid var(--border)',
                background: 'var(--bg-soft)',
                overflow: 'auto',
              }}
            >
              {rightPanel}
            </aside>
          ) : null}
        </div>
      </main>
    </div>
  )
}

export function SeverityPill({ severity = 'medium' }) {
  const map = {
    critical: { c: 'var(--critical)', bg: 'var(--critical-soft)', label: 'CRITICAL' },
    high: { c: 'var(--danger)', bg: 'var(--danger-soft)', label: 'HIGH' },
    medium: { c: 'var(--warning)', bg: 'var(--warning-soft)', label: 'MEDIUM' },
    low: { c: 'var(--success)', bg: 'var(--success-soft)', label: 'LOW' },
  }
  const v = map[String(severity).toLowerCase()] || map.medium
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 4,
        background: v.bg,
        color: v.c,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        fontFamily: 'var(--font-mono)',
        border: `1px solid ${v.c}33`,
      }}
    >
      {v.label}
    </span>
  )
}

export function StatusDot({ status = 'idle' }) {
  const map = {
    running: { c: 'var(--primary)', pulse: true, label: 'Running' },
    active: { c: 'var(--primary)', pulse: true, label: 'Active' },
    flagged: { c: 'var(--danger)', pulse: true, label: 'Flagged' },
    complete: { c: 'var(--success)', pulse: false, label: 'Complete' },
    idle: { c: 'var(--muted)', pulse: false, label: 'Idle' },
  }
  const v = map[String(status).toLowerCase()] || map.idle
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: v.c, display: 'inline-flex' }}>
        {v.pulse ? (
          <span className="aaa-pulse-dot" style={{ background: 'currentColor' }} />
        ) : (
          <span style={{ width: 8, height: 8, borderRadius: 4, background: 'currentColor', display: 'inline-block' }} />
        )}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>{v.label}</span>
    </span>
  )
}

export function Btn({ kind = 'ghost', icon, children, style, onClick, disabled, ...rest }) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 30,
    padding: '0 12px',
    borderRadius: 'var(--r-md)',
    fontSize: 12,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: '1px solid transparent',
    opacity: disabled ? 0.6 : 1,
  }
  const styles = {
    primary: {
      ...base,
      background: 'var(--primary)',
      color: '#fff',
      boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset, 0 1px 6px rgba(99,102,241,0.45)',
    },
    ghost: { ...base, background: 'transparent', color: 'var(--text-soft)', border: '1px solid var(--border)' },
    soft: { ...base, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' },
    danger: { ...base, background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger-line)' },
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="aaa-focus" style={{ ...styles[kind], ...(style || {}) }} {...rest}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  )
}


export function FilterTabs({ tabs, value, onChange, counts }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            className="aaa-focus"
            onClick={() => onChange?.(t.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 12px',
              borderRadius: 'var(--r-md)',
              background: active ? 'var(--surface-2)' : 'transparent',
              border: '1px solid',
              borderColor: active ? 'var(--border-strong)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-soft)',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: active ? 500 : 400,
            }}
          >
            {t.label}
            <span
              className="aaa-mono"
              style={{
                fontSize: 10,
                color: 'var(--muted)',
                background: 'rgba(255,255,255,0.03)',
                padding: '1px 5px',
                borderRadius: 4,
                border: '1px solid var(--border)',
              }}
            >
              {counts?.[t.id] ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}
