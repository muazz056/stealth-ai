import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

// Get backend API URL (can be passed as search param or use Railway)
const getApiUrl = () => {
  // First: check if backend URL is passed in search params
  const params = new URLSearchParams(window.location.search);
  const backendFromUrl = params.get('backend');
  if (backendFromUrl) return decodeURIComponent(backendFromUrl);
  
  // Second: use VITE_BACKEND_URL (Railway env var)
  const railwayUrl = import.meta.env.VITE_BACKEND_URL;
  if (railwayUrl) return railwayUrl;
  
  // Third: in Electron, use VITE_API_BASE_URL
  if (typeof window !== 'undefined' && (window as any).require) {
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  }
  
  // Fallback: derive from current origin (replace Vercel with Railway)
  const origin = window.location.origin;
  return origin.replace('stealth-ai-sand.vercel.app', 'your-app.up.railway.app');
};

const API_BASE_URL = getApiUrl();

const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');
  const verificationStarted = useRef(false);

  useEffect(() => {
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
          // Redirect to login page immediately
          setTimeout(() => {
            navigate('/service');
          }, 1000); // Small delay to show success message
          setStatus('success');
          setMessage('Email verified! Redirecting to login...');
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
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">Email Verified!</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6">{message}</p>
              <button
                onClick={() => navigate('/service')}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all"
              >
                Go to Login
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-6xl mb-4">❌</div>
              <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">Verification Failed</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6">{message}</p>
              <button
                onClick={() => navigate('/')}
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
