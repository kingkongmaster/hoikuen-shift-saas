import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => {
      const announce = () => { if (registration.waiting && navigator.serviceWorker.controller) window.dispatchEvent(new CustomEvent('enshift:pwa-update', { detail: registration })); };
      announce();
      registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', announce));
    }).catch(() => { /* Online use remains available; retry registration on next launch. */ });
  });
}
