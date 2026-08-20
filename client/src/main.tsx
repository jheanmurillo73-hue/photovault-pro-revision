import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Guard against uncaught third-party / Google Maps authentication rejection
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason?.name === 'ApiProjectMapError' ||
    String(event.reason).includes('gm_authFailure') ||
    String(event.reason).includes('Google Maps')
  ) {
    event.preventDefault();
    console.warn('Caught and silenced external map script rejection:', event.reason);
  }
});

window.addEventListener('error', (event) => {
  if (
    event.message?.includes('gm_authFailure') ||
    event.message?.includes('Google Maps') ||
    event.filename?.includes('maps.googleapis.com')
  ) {
    event.preventDefault();
    console.warn('Caught and silenced external map script error:', event.message);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

