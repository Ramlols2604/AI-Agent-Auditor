export function getRiskScore(session) {
  const flagCount = Number(session?.flag_count ?? session?.flags ?? 0) || 0
  if (flagCount === 0) return 0
  if (flagCount >= 5) return 95
  if (flagCount >= 3) return 75
  if (flagCount >= 1) return 45
  return 0
}

export function getRiskLabel(score) {
  const value = Number(score) || 0
  if (value === 0) return { label: 'Clean', color: '#10b981' }
  if (value < 50) return { label: 'Low', color: '#6366f1' }
  if (value < 75) return { label: 'Medium', color: '#f59e0b' }
  return { label: 'High', color: '#ef4444' }
}

export function formatCost(cost) {
  const n = Number(cost) || 0
  if (!n || n === 0) return '$0.00'
  if (n < 0.0001) return `$${n.toFixed(6)}`
  if (n < 0.01) return `$${n.toFixed(4)}`
  if (n < 1) return `$${n.toFixed(3)}`
  return `$${n.toFixed(2)}`
}
export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0 || Number.isNaN(diff)) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}
