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
    
    // Determine backend URL based on mode
    // For production build, use Railway URL; for dev use localhost
    const isProductionBuild = process.env.NODE_ENV === 'production' || mode === 'production';
    const backendUrl = isProductionBuild && env.API_BACKEND_URL 
      ? env.API_BACKEND_URL 
      : (env.VITE_BACKEND_URL || env.API_BACKEND_URL || 'http://localhost:3001');
    
    console.log(`Building for ${mode} mode, backend: ${backendUrl}`);
    
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
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'import.meta.env.VITE_DOWNLOAD_WINDOWS': JSON.stringify(env.VITE_DOWNLOAD_WINDOWS || ''),
        'import.meta.env.VITE_DOWNLOAD_MAC': JSON.stringify(env.VITE_DOWNLOAD_MAC || ''),
        'import.meta.env.VITE_DOWNLOAD_LINUX': JSON.stringify(env.VITE_DOWNLOAD_LINUX || ''),
        'import.meta.env.VITE_BACKEND_URL': JSON.stringify(backendUrl),
        'import.meta.env.VITE_API_URL': JSON.stringify(backendUrl + '/api'),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // Handle SPA routing for production preview
      preview: {
        port: 3000,
        host: '0.0.0.0',
      }
    };
});
