import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../shared/ErrorBoundary'
import { App } from './App'
import './styles.css'

const container = document.getElementById('root')
if (container === null) throw new Error('mirror renderer: #root missing from index.html')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary label="mirror">
      <App />
    </ErrorBoundary>
  </StrictMode>
)
