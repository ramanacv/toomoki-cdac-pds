import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import './index.css';
import { initializeAuth } from './auth-token.js';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

initializeAuth()
  .then(() => root.render(<React.StrictMode><App /></React.StrictMode>))
  .catch((error: unknown) => root.render(
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Identity service unavailable</h1>
      <p className="mt-3 text-muted-foreground">
        {error instanceof Error ? error.message : 'OIDC sign-in could not be initialized.'}
      </p>
    </main>
  ));
