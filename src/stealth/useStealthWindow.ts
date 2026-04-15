// src/stealth/useStealthWindow.ts
// React hook that creates a transparent, always‑on‑top stealth window when running under Electron.
// It is safe to import in a web‑only environment – it will simply do nothing.

import { useEffect, useRef } from 'react';

/**
 * useStealthWindow
 * @param url URL to load in the stealth overlay (usually the Vite dev server URL or file path).
 * @param active Whether the stealth window should be shown.
 */
export function useStealthWindow(url: string, active: boolean) {
    const winRef = useRef<any>(null);

    useEffect(() => {
        // This hook is now a no-op since stealth windows are handled by the main process
        // The actual stealth overlay is created in main.cjs
        console.log('useStealthWindow called with:', { url, active });
        
        // In a real implementation, this would communicate with the main process
        // via IPC to control the stealth overlay window
    }, [url, active]);
}
