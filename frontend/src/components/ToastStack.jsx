export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts?.length) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 380,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          style={{
            pointerEvents: 'auto',
            background: 'var(--surface)',
            border: `1px solid ${toast.tone === 'critical' ? 'var(--danger-line)' : 'var(--border)'}`,
            borderLeft: `3px solid ${toast.tone === 'critical' ? 'var(--danger)' : toast.tone === 'warning' ? 'var(--warning)' : 'var(--primary)'}`,
            borderRadius: 'var(--r-md)',
            padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>{toast.title}</div>
              {toast.message ? (
                <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.45 }}>{toast.message}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss?.(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                padding: 0,
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
