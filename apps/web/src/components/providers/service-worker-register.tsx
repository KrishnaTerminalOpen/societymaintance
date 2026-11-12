'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('[ColonyDeposit PWA] Service worker registered:', reg.scope);
          })
          .catch((err) => {
            console.warn('[ColonyDeposit PWA] Service worker registration failed:', err);
          });
      });
    }
  }, []);

  return null;
}
