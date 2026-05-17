export function StatusHero({ stats }) {
  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--s-4)',
        marginBottom: 'var(--s-6)',
      }}
    >
      {stats.map((s) => (
        <div
          key={s.label}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--s-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-3)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div className="aaa-label-tiny">{s.label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span
              style={{
                fontSize: 'var(--t-2xl)',
                fontWeight: 600,
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              {s.value}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: `var(--${s.tone === 'primary' ? 'primary' : s.tone})` }}>
              <span className="aaa-pulse-dot" style={{ background: 'currentColor', display: 'inline-block' }} />
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{s.delta}</span>
          </div>
          {s.footer ?? null}
        </div>
      ))}
    </section>
  )
}
