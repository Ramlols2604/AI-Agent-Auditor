import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', icon: '◈', label: 'Sessions' },
  { to: '/live', icon: '⬡', label: 'Live Audit' },
  { to: '/flags', icon: '⚑', label: 'Flags' },
  { to: '/audit', icon: '☰', label: 'Reports' },
  { to: '/about', icon: 'ⓘ', label: 'About' },
  { to: '/settings', icon: '◎', label: 'Settings' },
]

export default function Layout({
  children,
  rightPanel,
  showRightPanel,
  isConnected,
  flagCount,
  hasActiveSession,
  auditState,
}) {
  return (
    <div className={showRightPanel ? 'app-grid app-grid-with-right' : 'app-grid'}>
      <aside className="sidebar">
        <div>
          <div className="logo">⬡ AUDITOR</div>
          <p className="sublogo">AI Agent Monitor</p>
          <nav className="nav-list">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => (isActive ? 'nav-item nav-item-active' : 'nav-item')}
              >
                {item.to === '/live' ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span className="nav-icon">{item.icon}</span>
                      <span>{item.label}</span>
                    </span>
                    {auditState?.status === 'running' ? (
                      <span style={{ fontSize: '10px', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#6366f1',
                            animation: 'ping 1s infinite',
                          }}
                        />
                        Running
                      </span>
                    ) : null}
                    {auditState?.status === 'complete' ? (
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: auditState?.verdict === 'SAFE' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: auditState?.verdict === 'SAFE' ? '#10b981' : '#ef4444',
                        }}
                      >
                        {auditState?.verdict || 'DONE'}
                      </span>
                    ) : null}
                    {auditState?.status === 'error' ? (
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(239,68,68,0.15)',
                          color: '#ef4444',
                        }}
                      >
                        Error
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <span className="nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </>
                )}
                {item.label === 'Flags' && flagCount > 0 ? <span className="nav-badge">{flagCount}</span> : null}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="connection-row">
            <span className={isConnected ? 'dot dot-success' : 'dot dot-danger'} />
            <span>{isConnected ? 'Connected' : 'Offline'}</span>
          </div>
          <div className="connection-row">
            <span className={hasActiveSession ? 'dot dot-pulse' : 'dot dot-muted'} />
            <span>{hasActiveSession ? 'Active Session' : 'Idle'}</span>
          </div>
        </div>
      </aside>

      <main className="main-content">{children}</main>

      {showRightPanel ? <aside className="right-panel">{rightPanel}</aside> : null}
    </div>
  )
}
