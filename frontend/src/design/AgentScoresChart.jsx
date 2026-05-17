const DEFAULT_AGENTS = [
  { key: 'hallucination', label: 'Hallucination', color: '#ef4444' },
  { key: 'safety', label: 'Safety', color: '#f59e0b' },
  { key: 'cost', label: 'Cost', color: '#3b82f6' },
  { key: 'compliance', label: 'Compliance', color: '#6366f1' },
]

/**
 * SVG bar chart for four agent scores (0–100).
 */
export function AgentScoresChart({ agentResults = {}, agents = DEFAULT_AGENTS, height = 200 }) {
  const width = 360
  const pad = { top: 24, right: 16, bottom: 36, left: 36 }
  const chartW = width - pad.left - pad.right
  const chartH = height - pad.top - pad.bottom
  const barGap = 14
  const barW = (chartW - barGap * (agents.length - 1)) / agents.length

  const scores = agents.map((a) => {
    const raw = agentResults?.[a.key]?.score
    const n = Number(raw)
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null
  })

  const hasAny = scores.some((s) => s !== null)

  return (
    <div style={{ marginTop: 16 }}>
      <p className="aaa-label-tiny" style={{ marginBottom: 8 }}>
        AGENT SCORES
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Agent score bar chart"
        style={{ display: 'block', maxWidth: width }}
      >
        {[25, 50, 75, 100].map((tick) => {
          const y = pad.top + chartH - (tick / 100) * chartH
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fill="var(--muted)" fontSize="10" fontFamily="var(--font-mono)">
                {tick}
              </text>
            </g>
          )
        })}
        {agents.map((agent, i) => {
          const score = scores[i]
          const x = pad.left + i * (barW + barGap)
          const barH = score !== null ? (score / 100) * chartH : 0
          const y = pad.top + chartH - barH
          return (
            <g key={agent.key}>
              <rect
                x={x}
                y={pad.top + chartH - 2}
                width={barW}
                height={2}
                fill="rgba(255,255,255,0.08)"
                rx={2}
              />
              {score !== null ? (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  fill={agent.color}
                  rx={4}
                  opacity={0.9}
                />
              ) : (
                <rect
                  x={x}
                  y={pad.top + chartH - 8}
                  width={barW}
                  height={8}
                  fill="rgba(255,255,255,0.06)"
                  rx={2}
                />
              )}
              <text
                x={x + barW / 2}
                y={height - 10}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize="9"
                fontFamily="var(--font-sans, system-ui)"
              >
                {agent.label.split(' ')[0]}
              </text>
              {score !== null ? (
                <text
                  x={x + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fill={agent.color}
                  fontSize="11"
                  fontFamily="var(--font-mono)"
                >
                  {Math.round(score)}
                </text>
              ) : null}
            </g>
          )
        })}
        {!hasAny ? (
          <text x={width / 2} y={pad.top + chartH / 2} textAnchor="middle" fill="var(--muted)" fontSize="12">
            Run an audit to see scores
          </text>
        ) : null}
      </svg>
    </div>
  )
}

