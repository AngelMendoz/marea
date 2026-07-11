import { useEffect, useRef, useState } from 'react'
import { useDialog } from '../dialog'

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 4000
}

export function Dialogs(): JSX.Element | null {
  const { prompt, confirm, close } = useDialog()
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (prompt) {
      setValue(prompt.defaultValue ?? '')
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [prompt])

  if (prompt) {
    const submit = (): void => {
      if (!value.trim()) return
      prompt.onConfirm(value.trim())
      close()
    }
    return (
      <div style={overlay} onMouseDown={close}>
        <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
          <h3>{prompt.title}</h3>
          {prompt.label && <label>{prompt.label}</label>}
          <input
            ref={inputRef}
            value={value}
            placeholder={prompt.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') close()
            }}
          />
          <div className="dialog-actions">
            <button className="btn" onClick={close}>
              Cancelar
            </button>
            <button className="btn primary inline" onClick={submit} disabled={!value.trim()}>
              {prompt.confirmText ?? 'Aceptar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (confirm) {
    return (
      <div style={overlay} onMouseDown={close}>
        <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
          <h3>{confirm.title}</h3>
          <p className="dialog-msg">{confirm.message}</p>
          <div className="dialog-actions">
            <button className="btn" onClick={close}>
              Cancelar
            </button>
            <button
              className={confirm.danger ? 'btn danger inline' : 'btn primary inline'}
              onClick={() => {
                confirm.onConfirm()
                close()
              }}
            >
              {confirm.confirmText ?? 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
