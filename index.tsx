
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AppRouter from './AppRouter';
import OverlayApp from './OverlayApp';

// Check if we're in overlay mode (path for dev server, hash for file:// protocol)
const isOverlayMode = window.location.pathname === '/overlay' || window.location.hash.startsWith('#/overlay');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {isOverlayMode ? <OverlayApp /> : <AppRouter />}
  </React.StrictMode>
);
