// src/stealth/stealthWindow.ts
// This module provides a thin wrapper around Electron's BrowserWindow to create a transparent,
// always‑on‑top window that is excluded from screen capture on Windows using SetWindowDisplayAffinity.
// The implementation is guarded so that the code can be imported in a non‑Electron environment
// (e.g., during web development) without throwing errors.

export interface StealthWindowOptions {
  width?: number;
  height?: number;
  url: string; // URL to load (typically the Vite dev server or bundled index.html)
}

export function createStealthWindow(options: StealthWindowOptions) {
  // Lazy‑load electron only when running in the Electron main process.
  // This file is intended to be used from the Electron main script.
  // If `require('electron')` fails, we simply return a mock object.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BrowserWindow } = require('electron') as typeof import('electron');
    const win = new BrowserWindow({
      width: options.width ?? 800,
      height: options.height ?? 600,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });
    win.loadURL(options.url);
    // Windows specific API to prevent capture by screen‑sharing apps.
    // SetWindowDisplayAffinity with WDA_MONITOR (0x00000001) makes the window invisible to
    // screen‑capture APIs used by Zoom, Teams, Google Meet, etc.
    try {
      const { nativeImage } = require('electron');
      // @ts-ignore – native call via electron's BrowserWindow.handle
      const hwnd = win.getNativeWindowHandle();
      // Load user32.dll dynamically (only in Electron environment).
      try {
        const ffi = require('ffi-napi');
        const user32 = new ffi.Library('user32', {
          SetWindowDisplayAffinity: ['bool', ['pointer', 'uint32']],
        });
        const WDA_MONITOR = 0x00000001;
        user32.SetWindowDisplayAffinity(hwnd, WDA_MONITOR);
        console.log('✅ Stealth mode activated - window hidden from screen capture');
      } catch (ffiError) {
        console.warn('⚠️  ffi-napi not available - stealth features disabled');
        console.warn('Overlay will still work but may be visible in screen sharing.');
      }
    } catch (e) {
      // If the native call fails (e.g., not Windows), we ignore – the window will still be transparent.
      console.warn('Stealth affinity could not be set:', e);
    }
    return win;
  } catch (e) {
    console.warn('Electron not available – returning mock stealth window');
    return {
      loadURL: () => {},
      show: () => {},
    } as any;
  }
}

export function hideStealthWindow(win: any) {
  if (win && typeof win.hide === 'function') {
    win.hide();
  }
}

export function showStealthWindow(win: any) {
  if (win && typeof win.show === 'function') {
    win.show();
  }
}
