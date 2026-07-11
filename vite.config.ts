import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Custom plugin to handle SPA routing
function spaFallbackPlugin(): Plugin {
  return {
    name: 'spa-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // If the request is for a route (not a file), serve index.html
        const url = req.url || '';
        
        // Skip if it's an API call or has a file extension
        if (
          url.startsWith('/@') || // Vite internal
          url.startsWith('/node_modules') || // node_modules
          url.includes('.') && !url.includes('?') // Has file extension
        ) {
          return next();
        }
        
        // For all other routes, let Vite handle it (will serve index.html)
        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
    // Read .env file directly (bypass system env vars that might override)
    let dotEnvVars: Record<string, string> = {};
    try {
      const dotEnvPath = path.resolve('.env');
      if (fs.existsSync(dotEnvPath)) {
        const dotEnvContent = fs.readFileSync(dotEnvPath, 'utf-8');
        for (const line of dotEnvContent.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx === -1) continue;
          dotEnvVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
        }
      }
    } catch { /* ignore */ }

    // Use .env file values (they represent the user's intent), fallback to env/loadEnv
    const backendUrl = dotEnvVars.VITE_BACKEND_URL || dotEnvVars.API_BACKEND_URL || env.VITE_BACKEND_URL || env.API_BACKEND_URL || 'http://localhost:3001';
    const frontendUrl = dotEnvVars.VITE_FRONTEND_URL || env.VITE_FRONTEND_URL || 'https://stealth-assist-ai.vercel.app';
    
    console.log(`Building for ${mode}, backend: ${backendUrl}, frontend: ${frontendUrl}`);
    
    return {
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        spaFallbackPlugin()
      ],
      define: {
        'import.meta.env.DEV': JSON.stringify(mode === 'development'),
        'import.meta.env.PROD': JSON.stringify(mode === 'production'),
        'import.meta.env.VITE_BACKEND_URL': JSON.stringify(backendUrl),
        'import.meta.env.VITE_API_URL': JSON.stringify(backendUrl + '/api'),
        'import.meta.env.VITE_FRONTEND_URL': JSON.stringify(frontendUrl),
        'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(env.VITE_GOOGLE_CLIENT_ID || ''),
        'import.meta.env.VITE_DOWNLOAD_WINDOWS': JSON.stringify(env.VITE_DOWNLOAD_WINDOWS || ''),
        'import.meta.env.VITE_DOWNLOAD_MAC': JSON.stringify(env.VITE_DOWNLOAD_MAC || ''),
        'import.meta.env.VITE_DOWNLOAD_LINUX': JSON.stringify(env.VITE_DOWNLOAD_LINUX || ''),
        'import.meta.env.VITE_APP_NAME': JSON.stringify(env.VITE_APP_NAME || ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      preview: {
        port: 3000,
        host: '0.0.0.0',
      }
    };
});
