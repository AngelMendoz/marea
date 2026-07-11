import { Minus, Square, X, Waves, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { bridge } from '../bridge'

export function TitleBar(): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (window.api) window.api.window.isMaximized().then(setMaximized)
  }, [])

  const min = () => window.api?.window.minimize()
  const toggle = async () => {
    if (!window.api) return
    setMaximized(await window.api.window.toggleMaximize())
  }
  const close = () => window.api?.window.close()

  return (
    <div className="titlebar">
      <div className="brand">
        <Waves className="logo" strokeWidth={2.4} />
        <span>Marea</span>
      </div>
      <div className="spacer" />
      {bridge.isElectron && (
        <div className="win-controls">
          <button onClick={min} title="Minimizar">
            <Minus size={15} />
          </button>
          <button onClick={toggle} title="Maximizar">
            {maximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button className="close" onClick={close} title="Cerrar">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
