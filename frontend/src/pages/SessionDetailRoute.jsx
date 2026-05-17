import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import SessionDetail from '../SessionDetail'

/** Syncs URL session id with App state and renders the full detail page. */
export default function SessionDetailRoute({ onSelectSession, onGenerateAudit }) {
  const { sessionId } = useParams()

  useEffect(() => {
    if (sessionId) onSelectSession(sessionId)
  }, [sessionId, onSelectSession])

  return <SessionDetail onGenerateAudit={onGenerateAudit} />
}
