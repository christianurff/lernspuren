import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initMatheforscherProtocol } from './services/matheforscherProtocol'

// Matheforscher-Protokoll: Embedding-Erkennung + hello/discover-Handshake.
// Läuft standalone (nicht eingebettet) unauffällig mit. Siehe
// src/services/matheforscherProtocol.ts.
initMatheforscherProtocol()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
