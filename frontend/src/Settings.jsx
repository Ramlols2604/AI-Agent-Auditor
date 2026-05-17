import { useMemo, useState } from 'react'
import { getApiBase } from './api/client'
import { ONBOARDING_KEY } from './pages/OnboardingWizard'
import {
  notificationsEnabled,
  requestNotificationPermission,
  setNotificationsEnabled,
} from './utils/notifications'

const STORAGE_KEYS = {
  apiBase: 'auditor_api_base_url',
  thresholds: 'auditor_thresholds',
  budgetMonthly: 'auditor_budget_monthly',
  budgetSessionAlert: 'auditor_budget_session_alert',
}

const THRESHOLDS = [
  {
    key: 'hallucination',
    label: 'Hallucination',
    icon: '⚠',
    color: '#ef4444',
    default: 70,
    description: 'Flag when factual accuracy score drops below this',
  },
  {
    key: 'safety',
    label: 'Safety',
    icon: '✕',
    color: '#f59e0b',
    default: 80,
    description: 'Flag when policy adherence drops below this',
  },
  {
    key: 'cost',
    label: 'Cost Efficiency',
    icon: '$',
    color: '#3b82f6',
    default: 60,
    description: 'Flag when token efficiency drops below this',
  },
  {
    key: 'compliance',
    label: 'EU AI Act',
    icon: '⊘',
    color: '#6366f1',
    default: 75,
    description: 'Flag when regulatory alignment drops below this',
  },
]

function downloadText(filename, mimeType, text) {
  const blob = new Blob([text], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Settings() {
  const [apiBase] = useState(() => window.localStorage.getItem(STORAGE_KEYS.apiBase) || getApiBase())
  const [connected, setConnected] = useState(true)
  const [notice, setNotice] = useState('')
  const [thresholds, setThresholds] = useState(() => {
    const raw = window.localStorage.getItem(STORAGE_KEYS.thresholds)
    if (raw) {
      try {
        return JSON.parse(raw)
      } catch {
        // ignore parse errors
      }
    }
    return Object.fromEntries(THRESHOLDS.map((t) => [t.key, t.default]))
  })
  const [monthlyBudget, setMonthlyBudget] = useState(() => window.localStorage.getItem(STORAGE_KEYS.budgetMonthly) || '100')
  const [sessionAlert, setSessionAlert] = useState(() => window.localStorage.getItem(STORAGE_KEYS.budgetSessionAlert) || '0.10')
  const [notifyEnabled, setNotifyEnabled] = useState(() => notificationsEnabled())
  const dbPath = useMemo(() => 'backend/db/local.db', [])

  const testConnection = async () => {
    try {
      const res = await fetch(`${apiBase.replace(/\/$/, '')}/health`)
      setConnected(res.ok)
      setNotice(res.ok ? 'Connection successful.' : `Connection failed: HTTP ${res.status}`)
      if (res.ok) window.localStorage.setItem(STORAGE_KEYS.apiBase, apiBase)
    } catch (error) {
      setConnected(false)
      setNotice(`Connection failed: ${error.message}`)
    }
  }

  const saveThresholds = async () => {
    window.localStorage.setItem(STORAGE_KEYS.thresholds, JSON.stringify(thresholds))
    try {
      await fetch(`${getApiBase()}/settings/thresholds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thresholds),
      })
    } catch {
      // local persistence is still valid if backend endpoint is unavailable
    }
    setNotice('Thresholds saved.')
  }

  const saveCostAlerts = () => {
    window.localStorage.setItem(STORAGE_KEYS.budgetMonthly, monthlyBudget)
    window.localStorage.setItem(STORAGE_KEYS.budgetSessionAlert, sessionAlert)
    setNotice('Cost alerts saved.')
  }

  const exportJSON = async () => {
    const [sessionsRes, flagsRes] = await Promise.all([fetch(`${getApiBase()}/sessions`), fetch(`${getApiBase()}/flags`)])
    const sessions = sessionsRes.ok ? await sessionsRes.json() : []
    const flags = flagsRes.ok ? await flagsRes.json() : []
    downloadText(
      `sentinel-export-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
      JSON.stringify({ exported_at: new Date().toISOString(), sessions, flags }, null, 2),
    )
    setNotice('JSON exported.')
  }

  const exportCSV = async () => {
    const flagsRes = await fetch(`${getApiBase()}/flags`)
    const flags = flagsRes.ok ? await flagsRes.json() : []
    const lines = [
      'flag_id,session_id,flag_type,severity,resolved,created_at,description',
      ...flags.map((f) => [
        f.id,
        f.session_id,
        f.flag_type,
        f.severity,
        f.resolved ? 'true' : 'false',
        f.created_at,
        `"${String(f.description || '').replace(/"/g, '""')}"`,
      ].join(',')),
    ]
    downloadText(`audit-history-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv', lines.join('\n'))
    setNotice('CSV exported.')
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 40 }}>
      <div
        style={{
          background: '#111318',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', color: '#64748b', letterSpacing: '1.5px', marginBottom: '8px' }}>
            CONNECTION STATUS
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: connected ? '#10b981' : '#ef4444',
              }}
            />
            <span style={{ color: '#f1f5f9', fontSize: '15px', fontWeight: 500 }}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            {apiBase} · Gemini 2.5 Flash · OpenRouter fallback
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        <button
          onClick={testConnection}
          style={{
            padding: '8px 16px',
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '8px',
            color: '#6366f1',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Test Connection
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={notifyEnabled}
            onChange={async (e) => {
              const on = e.target.checked
              setNotifyEnabled(on)
              setNotificationsEnabled(on)
              if (on) await requestNotificationPermission()
            }}
          />
          Browser alerts for critical flags
        </label>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem(ONBOARDING_KEY)
            setNotice('Setup wizard will show on next refresh.')
          }}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            color: '#94a3b8',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Re-run setup wizard
        </button>
        </div>
      </div>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, color: '#f1f5f9', fontWeight: 500, marginBottom: 6 }}>Detection Thresholds</h2>
        <p className="muted" style={{ marginBottom: 8 }}>Agents raise flags when scores fall below these values</p>
        {THRESHOLDS.map((agent) => (
          <div
            key={agent.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '16px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ color: agent.color, marginRight: '10px', fontSize: '16px' }}>{agent.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: 500 }}>{agent.label}</div>
              <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>{agent.description}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min="0"
                max="100"
                value={thresholds[agent.key]}
                onChange={(e) => {
                  const next = Math.max(0, Math.min(100, Number(e.target.value || 0)))
                  setThresholds((prev) => ({ ...prev, [agent.key]: next }))
                }}
                style={{
                  width: '64px',
                  padding: '6px 10px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px',
                  textAlign: 'center',
                }}
              />
              <span style={{ color: '#64748b', fontSize: '13px' }}>/100</span>
            </div>
          </div>
        ))}
        <button
          onClick={saveThresholds}
          style={{
            marginTop: 12,
            padding: '10px 16px',
            background: 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.35)',
            borderRadius: 8,
            color: '#818cf8',
            cursor: 'pointer',
          }}
        >
          Save Thresholds
        </button>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, color: '#f1f5f9', fontWeight: 500, marginBottom: 10 }}>Cost Alerts</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <label className="metric-label">Monthly budget ($)</label>
            <input className="search-input" type="number" value={monthlyBudget} onChange={(e) => setMonthlyBudget(e.target.value)} />
          </div>
          <div>
            <label className="metric-label">Per-session alert ($)</label>
            <input className="search-input" type="number" value={sessionAlert} onChange={(e) => setSessionAlert(e.target.value)} />
          </div>
          <button className="btn-outline" onClick={saveCostAlerts}>Save</button>
        </div>
      </section>

      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 18, color: '#f1f5f9', fontWeight: 500, marginBottom: 10 }}>Data Management</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            style={{
              padding: '10px 16px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#94a3b8',
              fontSize: '13px',
              cursor: 'pointer',
            }}
            onClick={exportJSON}
          >
            Export JSON
          </button>

          <button
            style={{
              padding: '10px 16px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#94a3b8',
              fontSize: '13px',
              cursor: 'pointer',
            }}
            onClick={exportCSV}
          >
            Export CSV
          </button>
        </div>
        <div style={{ marginTop: 10, color: '#64748b', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          Database: {dbPath}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, color: '#f1f5f9', fontWeight: 500, marginBottom: 10 }}>Instance Info</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: 8, columnGap: 10, fontSize: 13 }}>
          <div className="muted">Version</div><div style={{ color: '#f1f5f9' }}>1.0.0</div>
          <div className="muted">Backend</div><div style={{ color: '#f1f5f9' }}>Python 3.11 + FastAPI</div>
          <div className="muted">Database</div><div style={{ color: '#f1f5f9' }}>SQLite → Snowflake</div>
          <div className="muted">License</div><div style={{ color: '#f1f5f9' }}>MIT Open Source</div>
          <div className="muted">Repository</div>
          <div>
            <a href="https://github.com/ramchandrachawla/AI-Agent-Auditor" target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>
              Sentinel on GitHub
            </a>
          </div>
        </div>
      </section>

      {notice ? <p className="muted" style={{ marginTop: 14 }}>{notice}</p> : null}
    </div>
  )
}
