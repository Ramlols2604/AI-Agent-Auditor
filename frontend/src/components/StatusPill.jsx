const CLASS_BY_KIND = {
  success: 'pill pill-success',
  warning: 'pill pill-warning',
  danger: 'pill pill-danger',
  neutral: 'pill pill-neutral',
}

export default function StatusPill({ label, kind = 'neutral' }) {
  return <span className={CLASS_BY_KIND[kind] || CLASS_BY_KIND.neutral}>{label}</span>
}
