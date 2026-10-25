import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthBoundary } from './components/auth-boundary'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/office/editor' ? <App /> : <AuthBoundary><App /></AuthBoundary>}
  </StrictMode>
)
