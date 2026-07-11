import { useStore } from '../store'

export function Toasts(): JSX.Element {
  const { toasts, dismissToast } = useStore()
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => dismissToast(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
