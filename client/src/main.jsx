import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import DialogProvider from './components/DialogProvider.jsx'
import { installGlobalErrorHandlers } from './globalErrors'

installGlobalErrorHandlers()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <DialogProvider>
        <App />
      </DialogProvider>
    </ErrorBoundary>
  </StrictMode>,
)
