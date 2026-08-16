import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../shared/ErrorBoundary'
import { App } from './App'
import './styles.css'

const container = document.getElementById('root')
if (container === null) throw new Error('console renderer: #root missing from index.html')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary label="console">
      <App />
    </ErrorBoundary>
  </StrictMode>
)
