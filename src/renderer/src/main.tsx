import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from '@renderer/App'
import '@renderer/styles/index.css'
import { initTauriBridge } from '@renderer/services/tauriBridge'

initTauriBridge()

const rootElement = document.getElementById('root')

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
