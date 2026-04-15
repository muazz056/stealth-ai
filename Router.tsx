import React from 'react';
import MainApp from './MainApp';
import OverlayApp from './OverlayApp';

const Router: React.FC = () => {
  // Check if we're in overlay mode based on URL hash
  const isOverlayMode = window.location.hash === '#/overlay';

  if (isOverlayMode) {
    return <OverlayApp />;
  }

  return <MainApp />;
};

export default Router;
