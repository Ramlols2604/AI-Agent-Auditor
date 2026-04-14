export default function ErrorState({ message }) {
  if (!message) return null
  return <p className="error">{message}</p>
}
