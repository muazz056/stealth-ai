import path from 'path';
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
    
    // Backend URL: Railway for production, localhost for development
    const backendUrl = mode === 'production' 
      ? (env.API_BACKEND_URL || 'https://stealth-ai-production-e686.up.railway.app')
      : 'http://localhost:3001';
    
    console.log(`Building for ${mode}, backend: ${backendUrl}`);
    
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
