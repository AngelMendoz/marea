import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import { useStore } from './store'

// Aplicar tema guardado antes del primer render.
document.documentElement.dataset.theme = useStore.getState().theme

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
