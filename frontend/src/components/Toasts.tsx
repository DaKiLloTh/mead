import { useJobs } from '../context/JobsContext'

export default function Toasts() {
  const { toasts, dismissToast } = useJobs()

  if (toasts.length === 0) return null

  return (
    <div className="toast toast-end toast-bottom z-50">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`alert ${t.type === 'success' ? 'alert-success' : t.type === 'error' ? 'alert-error' : 'alert-info'} shadow-lg cursor-pointer`}
          onClick={() => dismissToast(t.id)}
        >
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
