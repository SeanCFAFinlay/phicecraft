// ============================================================================
// MAIN - Application entry point
// ============================================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './pwa/updateManager';
import { installCrashReporter } from './telemetry/crashReporter';
import './styles/index.css';

// Installed before the first render so a crash while starting up is reported
// too. Production builds only - see crashReporter.ts for what a report holds.
installCrashReporter({ enabled: import.meta.env.PROD });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Offline support. Registered AFTER the first render, so caching never
// competes with getting the rink on screen, and only in a real build - a
// caching worker in development serves stale modules and makes every change
// look as though it did not take effect.
void registerServiceWorker({ enabled: import.meta.env.PROD });
