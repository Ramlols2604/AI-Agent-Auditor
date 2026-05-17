function firstNumber(...candidates) {
  for (const value of candidates) {
    if (value === null || value === undefined || value === '') continue
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

/**
 * Normalize report API payload (and live-audit fallbacks) for the Reports UI.
 */
export function extractReportMetrics(report, { latestAuditResult, liveAuditState, loading } = {}) {
  if (loading) {
    return {
      flagsTotal: 'Loading...',
      flagsResolved: 'Loading...',
      eventsTotal: 'Loading...',
      complianceScore: 'Loading...',
      verdict: null,
      loading: true,
    }
  }

  const summary = report?.summary ?? report

  const flagsTotal = firstNumber(
    summary?.total_flags,
    summary?.flags_total,
    report?.flags_total,
    report?.flag_count,
    latestAuditResult?.flags_total,
    liveAuditState?.flagsRaised?.length,
  )

  const flagsResolved = firstNumber(
    summary?.resolved_flags,
    summary?.flags_resolved,
    report?.flags_resolved,
    latestAuditResult?.flags_resolved,
  )

  const eventsTotal = firstNumber(
    summary?.total_events,
    summary?.events_total,
    report?.events_total,
    report?.event_count,
    latestAuditResult?.event_count,
    liveAuditState?.eventCount,
  )

  const complianceScore = firstNumber(
    summary?.overall_score,
    summary?.compliance_score,
    report?.overall_score,
    report?.compliance_score,
    latestAuditResult?.overall_score,
    liveAuditState?.overallScore,
  )

  const verdict =
    summary?.verdict ?? report?.verdict ?? latestAuditResult?.verdict ?? liveAuditState?.verdict ?? 'UNKNOWN'

  return {
    flagsTotal,
    flagsResolved,
    eventsTotal,
    complianceScore,
    verdict,
    loading: false,
  }
}

export function formatReportMetric(value) {
  if (value === 'Loading...') return 'Loading...'
  const n = Number(value)
  return Number.isFinite(n) ? String(n) : '0'
}
