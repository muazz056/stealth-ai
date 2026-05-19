import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

// Helper: clean redirect using React Router's navigate (BrowserRouter)
const redirectTo = (path: string) => {
  window.location.href = window.location.origin + path;
};

// Get backend API URL from search params (both main URL and hash-based)
const getApiUrl = () => {
  // Check main URL search params
  const mainParams = new URLSearchParams(window.location.search);
  const fromMain = mainParams.get('backend');
  if (fromMain) return decodeURIComponent(fromMain);
  
  // Check hash-based search params (HashRouter: /path?key=val)
  const hash = window.location.hash;
  const hashQueryIndex = hash.indexOf('?');
  if (hashQueryIndex !== -1) {
    const hashParams = new URLSearchParams(hash.substring(hashQueryIndex));
    const fromHash = hashParams.get('backend');
    if (fromHash) return decodeURIComponent(fromHash);
  }
  
  // Then: use VITE_BACKEND_URL (Railway env var)
  const railwayUrl = import.meta.env.VITE_BACKEND_URL;
  if (railwayUrl) return railwayUrl;
  
  // In Electron, use VITE_API_BASE_URL
  if (typeof window !== 'undefined' && (window as any).require) {
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  }
  
  // Fallback: derive from current origin (replace Vercel with Railway)
  const origin = window.location.origin;
  return origin.replace('stealth-ai-sand.vercel.app', 'stealth-ai-production-e686.up.railway.app');
};

const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');
  const verificationStarted = useRef(false);

  useEffect(() => {
    const API_BASE_URL = getApiUrl();
    const token = searchParams.get('token');
    
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }

    // Prevent double-verification (React StrictMode runs effect twice)
    if (verificationStarted.current) {
      console.log('⚠️ Verification already started, skipping duplicate request...');
      return;
    }

    verificationStarted.current = true;

    const verify = async () => {
      try {
        console.log('🔍 Verifying email with token...');
        const response = await fetch(`${API_BASE_URL}/api/auth/verify-email?token=${token}`);
        const data = await response.json();

        console.log('📧 Verification response:', data);

        if (data.success) {
          console.log('✅ Email verified! Redirecting to login...');
          setStatus('success');
          setMessage('Email verified! Redirecting to login...');
          // Redirect to /service after a short delay
          setTimeout(() => {
            redirectTo('/service');
          }, 1500);
        } else {
          setStatus('error');
          setMessage(data.message);
        }
      } catch (error: any) {
        console.error('❌ Verification error:', error);
        setStatus('error');
        setMessage('Verification failed: ' + error.message);
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center transition-colors duration-300">
      <div className="max-w-md w-full mx-4">
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl text-center">
          {status === 'verifying' && (
            <>
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <h2 className="text-2xl font-bold text-black dark:text-white mb-2">Verifying your email...</h2>
              <p className="text-slate-600 dark:text-slate-400">Please wait while we verify your account.</p>
              <div className="mt-6 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
                  <span>Verifying your email address</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-300"></div>
                  <span>Auto-redirecting to app</span>
                </div>
              </div>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">Email Verified!</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6">{message}</p>
              <button
                onClick={() => redirectTo('/service')}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all"
              >
                Go to App
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-6xl mb-4">❌</div>
              <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">Verification Failed</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6">{message}</p>
              <button
                onClick={() => redirectTo('/')}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all"
              >
                Go to Home
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
