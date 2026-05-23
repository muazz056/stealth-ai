import React from 'react';
import MainApp from './MainApp';
import OverlayApp from './OverlayApp';

const Router: React.FC = () => {
  // Check if we're in overlay mode (path for dev server, hash for file:// protocol)
  const isOverlayMode = window.location.pathname === '/overlay' || window.location.hash.startsWith('#/overlay');

  if (isOverlayMode) {
    return <OverlayApp />;
  }

  return <MainApp />;
};

export default Router;
