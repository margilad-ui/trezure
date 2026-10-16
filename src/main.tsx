import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles/app.css'
import { App } from './App'
import { applyTheme, watchSystemTheme } from './lib/theme'

registerSW({ immediate: true })
applyTheme()
watchSystemTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
