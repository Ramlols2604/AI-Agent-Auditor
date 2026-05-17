import { useLocation } from 'react-router-dom'
import { AppFrame } from '../design/AppShell.jsx'

function crumbsForPath(pathname) {
  if (pathname.startsWith('/sessions/') && pathname !== '/sessions') return ['Production', 'Sessions', 'Detail']
  if (pathname === '/' || pathname === '/sessions' || pathname === '/session') return ['Production', 'Sessions']
  if (pathname.startsWith('/live')) return ['Production', 'Live Audit']
  if (pathname.startsWith('/flags')) return ['Production', 'Flags']
  if (pathname.startsWith('/audit')) return ['Production', 'Reports']
  if (pathname.startsWith('/about')) return ['Product', 'About']
  if (pathname.startsWith('/settings')) return ['System', 'Settings']
  return ['Production']
}

export default function Layout({
  children,
  rightPanel,
  showRightPanel,
  isConnected,
  flagCount,
  auditState,
  topbarRight,
}) {
  const location = useLocation()

  return (
    <AppFrame
      crumbs={crumbsForPath(location.pathname)}
      topbarRight={topbarRight}
      flagCount={flagCount}
      isConnected={isConnected}
      auditState={auditState}
      rightPanel={showRightPanel ? rightPanel : null}
    >
      {children}
    </AppFrame>
  )
}
