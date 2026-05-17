import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Btn, FilterTabs, SeverityPill } from '../design/AppShell.jsx'
import { Icon } from '../design/icons.jsx'

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0 || Number.isNaN(diff)) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

const TYPE_META = {
  hallucination: { glyph: '⚠', label: 'Hallucination', tone: 'warning' },
  safety: { glyph: '✕', label: 'Safety', tone: 'danger' },
  cost: { glyph: '$', label: 'Cost', tone: 'success' },
  compliance: { glyph: '⊘', label: 'Compliance', tone: 'primary' },
}

function normalizeFindings(flag) {
  const fromVerdict = Array.isArray(flag?.agent_verdict?.findings) ? flag.agent_verdict.findings : []
  if (fromVerdict.length > 0) return fromVerdict
  return [flag?.description || 'Potential policy or behavior risk detected during audit.']
}

function normalizeResolutionSteps(flag) {
  const fromVerdict = Array.isArray(flag?.agent_verdict?.resolution_steps) ? flag.agent_verdict.resolution_steps : []
  if (fromVerdict.length > 0) return fromVerdict
  return [
    'Reproduce the flagged behavior with the same prompt and model.',
    'Update guardrails and system prompt constraints for this flag type.',
    'Re-run the audit and verify the flag no longer appears.',
  ]
}

function toneColor(tone) {
  if (tone === 'danger') return 'var(--danger)'
  if (tone === 'warning') return 'var(--warning)'
  if (tone === 'success') return 'var(--success)'
  return 'var(--primary)'
}

function toneBg(tone) {
  if (tone === 'danger') return 'var(--danger-soft)'
  if (tone === 'warning') return 'var(--warning-soft)'
  if (tone === 'success') return 'var(--success-soft)'
  return 'var(--primary-soft)'
}

function SummaryTile({ color, glyph, label, value, hint }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: 'var(--s-4) var(--s-5)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-4)',
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: `${color}22`,
          color,
          display: 'grid',
          placeItems: 'center',
          fontSize: 16,
          fontWeight: 600,
          border: `1px solid ${color}44`,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {glyph}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="aaa-label-tiny">{label}</span>
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{value}</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{hint}</span>
      </div>
    </div>
  )
}

function FlagCard({ flag, onResolve, onViewSession }) {
  const typeKey = String(flag.flag_type || 'compliance').toLowerCase()
  const meta = TYPE_META[typeKey] || TYPE_META.compliance
  const color = toneColor(meta.tone)
  const bg = toneBg(meta.tone)
  const severity = String(flag.severity || 'medium').toLowerCase()
  const agentName = flag?.agent_verdict?.agent_name || flag?.agent_verdict?.agent || flag?.session_id?.slice(0, 12) || 'unknown'
  const summary = flag?.agent_verdict?.summary || flag?.description || 'Potential issue detected by the audit committee.'
  const findings = normalizeFindings(flag)
  const steps = normalizeResolutionSteps(flag)
  const evidence = flag?.agent_verdict?.evidence || flag?.description || summary
  const riskLevel = flag?.agent_verdict?.risk_level || severity
  const euArticle = flag?.agent_verdict?.eu_ai_act_article || 'Article 9 — Risk management'
  const pad = 'var(--s-5) var(--s-6)'

  return (
    <article
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        opacity: flag.resolved ? 0.72 : 1,
      }}
    >
      <header
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          gap: 'var(--s-4)',
          padding: pad,
          borderBottom: '1px solid var(--border)',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: bg,
            color,
            display: 'grid',
            placeItems: 'center',
            fontSize: 18,
            fontWeight: 600,
            border: `1px solid ${color}33`,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {meta.glyph}
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <SeverityPill severity={severity} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {meta.label} · session <span className="aaa-mono" style={{ color: 'var(--text-soft)' }}>{agentName}</span>
            </span>
            <span className="aaa-mono" style={{ fontSize: 10, color: 'var(--muted-2)' }}>
              {timeAgo(flag.created_at)}
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.005em' }}>{summary}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn kind="ghost" icon="doc" onClick={onViewSession}>
            View session
          </Btn>
          {!flag.resolved ? (
            <Btn kind="primary" icon="check" onClick={() => onResolve(flag.id)}>
              Resolve
            </Btn>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ Resolved</span>
          )}
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 0 }}>
        <div
          style={{
            padding: pad,
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-4)',
          }}
        >
          <div>
            <div className="aaa-label-tiny" style={{ marginBottom: 8 }}>
              FINDINGS
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {findings.map((f, i) => (
                <li
                  key={`${flag.id}-f-${i}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '18px 1fr',
                    gap: 8,
                    fontSize: 12,
                    color: 'var(--text-soft)',
                    lineHeight: 1.55,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      background: 'var(--surface-3)',
                      color: 'var(--muted)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ paddingTop: 1 }}>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="aaa-label-tiny" style={{ marginBottom: 8 }}>
              EVIDENCE
            </div>
            <div
              className="aaa-mono"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: '10px 12px',
                fontSize: 11.5,
                color: 'var(--text-soft)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                borderLeft: `2px solid ${color}`,
              }}
            >
              {evidence}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--s-3)',
              paddingTop: 'var(--s-3)',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div>
              <div className="aaa-label-tiny">RISK</div>
              <span style={{ fontSize: 12, color: 'var(--text-soft)' }}>{String(riskLevel).toUpperCase()}</span>
            </div>
            <div>
              <div className="aaa-label-tiny">EU AI ACT</div>
              <span className="aaa-mono" style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                {euArticle}
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: pad,
            background: 'linear-gradient(180deg, rgba(99,102,241,0.03), transparent 60%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="spark" size={14} color="var(--primary)" />
            <span className="aaa-label-tiny" style={{ color: 'var(--primary)' }}>
              HOW TO FIX THIS
            </span>
            <span style={{ flex: 1 }} />
            <span className="aaa-mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
              {steps.length} steps
            </span>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {steps.map((s, i) => (
              <li
                key={`${flag.id}-s-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: 'var(--primary-soft)',
                    color: 'var(--primary)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    border: '1px solid var(--primary-line)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.55 }}>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </article>
  )
}

export default function FlagsPage({ allFlags, flagsLoading, flagsError, resolveState, onResolve }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionFilter = searchParams.get('session') || ''
  const [tab, setTab] = useState('all')
  const [resolveMessage, setResolveMessage] = useState(null)

  const scopedFlags = useMemo(() => {
    if (!sessionFilter) return allFlags
    return allFlags.filter((f) => f.session_id === sessionFilter)
  }, [allFlags, sessionFilter])

  const isOpenFlag = (f) => f.resolved === false || f.resolved === 0 || !f.resolved
  const isResolvedFlag = (f) => f.resolved === true || f.resolved === 1

  const openFlags = useMemo(() => scopedFlags.filter(isOpenFlag), [scopedFlags])
  const resolvedFlags = useMemo(() => scopedFlags.filter(isResolvedFlag), [scopedFlags])

  const counts = useMemo(
    () => ({
      all: openFlags.length,
      critical: openFlags.filter((f) => String(f.severity).toLowerCase() === 'critical').length,
      high: openFlags.filter((f) => String(f.severity).toLowerCase() === 'high').length,
      compliance: openFlags.filter((f) => String(f.flag_type).toLowerCase() === 'compliance').length,
      resolved: resolvedFlags.length,
    }),
    [openFlags, resolvedFlags],
  )

  const filtered = useMemo(() => {
    if (tab === 'resolved') return resolvedFlags
    const base = tab === 'all' ? openFlags : openFlags
    if (tab === 'critical') return base.filter((f) => String(f.severity).toLowerCase() === 'critical')
    if (tab === 'high') return base.filter((f) => String(f.severity).toLowerCase() === 'high')
    if (tab === 'compliance') return base.filter((f) => String(f.flag_type).toLowerCase() === 'compliance')
    return base
  }, [tab, openFlags, resolvedFlags])

  const resolveFlag = async (flagId) => {
    await onResolve(flagId)
    setResolveMessage('Flag resolved and logged to audit trail')
    setTimeout(() => setResolveMessage(null), 3000)
  }

  const tabs = [
    { id: 'all', label: 'All open' },
    { id: 'critical', label: 'Critical' },
    { id: 'high', label: 'High' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'resolved', label: 'Resolved' },
  ]

  return (
    <div style={{ padding: 'var(--s-6) var(--s-7)', display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }} className="aaa-fade-in">
      {resolveMessage ? (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            background: 'var(--success-soft)',
            border: '1px solid var(--success-line)',
            borderRadius: 'var(--r-md)',
            padding: '12px 20px',
            color: 'var(--success)',
            fontSize: 13,
            zIndex: 1000,
          }}
        >
          {resolveMessage}
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-4)' }}>
        <h1 style={{ margin: 0, fontSize: 'var(--t-xl)', fontWeight: 500, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          Flags
        </h1>
        <span className="aaa-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
          {openFlags.length} open · resolution steps always visible
          {sessionFilter ? ` · session ${sessionFilter.slice(0, 8)}…` : ''}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-3)' }}>
        <SummaryTile color="var(--critical)" glyph="⚠" label="CRITICAL" value={String(counts.critical)} hint="open critical flags" />
        <SummaryTile color="var(--danger)" glyph="✕" label="HIGH" value={String(counts.high)} hint="open high severity" />
        <SummaryTile color="var(--warning)" glyph="$" label="OPEN" value={String(counts.all)} hint="unresolved total" />
        <SummaryTile color="var(--success)" glyph="⊘" label="RESOLVED" value={String(counts.resolved)} hint="in audit trail" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
        <FilterTabs tabs={tabs} value={tab} onChange={setTab} counts={counts} />
        </div>

      {flagsError ? <p style={{ color: 'var(--danger)', fontSize: 13 }}>{flagsError}</p> : null}
      {resolveState.error ? <p style={{ color: 'var(--danger)', fontSize: 13 }}>{resolveState.error}</p> : null}
      {flagsLoading ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading flags…</p> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
        {!flagsLoading && filtered.length === 0 ? (
          <div
            style={{
              padding: 'var(--s-9)',
              textAlign: 'center',
              color: 'var(--muted)',
              background: 'var(--surface)',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--r-lg)',
            }}
          >
            <Icon name="inbox" size={28} color="var(--muted-2)" />
            <p style={{ marginTop: 12, color: 'var(--text-soft)' }}>No flags in this view</p>
          </div>
        ) : null}
        {filtered.map((flag) => (
          <FlagCard
            key={flag.id}
            flag={flag}
            onResolve={resolveFlag}
            onViewSession={() => navigate(`/sessions/${flag.session_id}`)}
          />
        ))}
      </div>
    </div>
  )
}
