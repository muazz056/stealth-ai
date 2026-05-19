import React from 'react';
import MainApp from './MainApp';
import OverlayApp from './OverlayApp';

const Router: React.FC = () => {
  // Check if we're in overlay mode based on URL pathname
  const isOverlayMode = window.location.pathname === '/overlay';

  if (isOverlayMode) {
    return <OverlayApp />;
  }

  return <MainApp />;
};

export default Router;
