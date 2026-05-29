import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import FeaturesPage from './pages/FeaturesPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import PricingPage from './pages/PricingPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import SuperAdminPage from './pages/SuperAdminPage';
import App from './App';
import AuthPage from './components/AuthPage';
import SignInPage from './pages/SignInPage';
import { authClient } from './src/utils/authClient';
import { messagesClient } from './src/utils/messagesClient';
import { apiClient, setAccessToken, setRefreshToken, clearTokens, getRefreshToken, refreshAccessToken, onTokenExpired } from './src/utils/apiClient';
import { DarkModeProvider } from './src/context/DarkModeContext';
import { APP_CONFIG } from './src/config';

const LS_USER_KEY = 'isa_current_user';
const LS_FIRST_LAUNCH_KEY = 'isa_first_launch_done';
const INACTIVITY_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours

// Inner component that has access to useNavigate
const AppRouterContent: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('Failed to start new session. Please try again.');
  const [sessionKey, setSessionKey] = useState(0);
  const [showSetupLoader, setShowSetupLoader] = useState(false);
  const [setupCountdown, setSetupCountdown] = useState(8);
  const [authChecked, setAuthChecked] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);

  // Detect if running in Electron
  const isElectron = typeof window !== 'undefined' && (window as any).require;

  // Track last activity timestamp for inactivity logout
  const lastActivityRef = React.useRef(Date.now());
  const activityCheckRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Update activity timestamp on user interaction
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Set up activity listeners
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(event => window.addEventListener(event, updateActivity));

    // Check for inactivity every minute
    activityCheckRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed > INACTIVITY_TIMEOUT_MS && isAuthenticated) {
        console.log('🔒 Auto-logout due to inactivity');
        performLogout();
      }
    }, 60000); // Check every minute

    return () => {
      events.forEach(event => window.removeEventListener(event, updateActivity));
      if (activityCheckRef.current) clearInterval(activityCheckRef.current);
    };
  }, [isAuthenticated]);

  // Track online/offline status
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Register token expiry callback
  useEffect(() => {
    onTokenExpired(() => {
      console.log('🔒 Token expired, logging out');
      performLogout();
    });
  }, []);

  // Persist user to localStorage + update state
  const saveUser = (user: any) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
  };

  const clearSavedUser = () => {
    setCurrentUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem(LS_USER_KEY);
  };

  const performLogout = () => {
    if (currentUser) {
      localStorage.removeItem(`isa_providers_sent_context_${currentUser._id}`);
    }
    clearSavedUser();
    clearTokens();
    navigate('/');
  };

  // Check authentication on mount
  useEffect(() => {
    const initAuth = async () => {
      // If offline, skip network calls and just check localStorage
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        // Try to load user from localStorage even when offline
        const savedUser = localStorage.getItem(LS_USER_KEY);
        if (savedUser) {
          try {
            const user = JSON.parse(savedUser);
            saveUser(user);
          } catch (e) {
            localStorage.removeItem(LS_USER_KEY);
          }
        }
        setAuthChecked(true);
        return;
      }

      // Try to restore session from refresh token
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          // Token refreshed, now get user from localStorage
          const savedUser = localStorage.getItem(LS_USER_KEY);
          if (savedUser) {
            try {
              const user = JSON.parse(savedUser);
              saveUser(user);
              // Validate user data in background
              authClient.getUser(user._id).then((result) => {
                if (result && result.user) {
                  const updatedUser = { ...user, ...result.user, _id: user._id };
                  saveUser(updatedUser);
                  localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
                }
              }).catch(() => {});
            } catch (e) {
              clearSavedUser();
              clearTokens();
            }
          }
        }
        // If refresh failed but tokens still exist (network error), try saved user as fallback
        if (!refreshed && getRefreshToken()) {
          const savedUser = localStorage.getItem(LS_USER_KEY);
          if (savedUser) {
            try {
              const user = JSON.parse(savedUser);
              saveUser(user);
            } catch (e) {}
          }
        }
      } else {
        // No refresh token - check if we have a saved user (legacy)
        const savedUser = localStorage.getItem(LS_USER_KEY);
        if (savedUser) {
          // No token, but user exists - legacy session without JWT
          // We'll let them stay logged in but they won't have token auth
          try {
            const user = JSON.parse(savedUser);
            saveUser(user);
          } catch (e) {
            localStorage.removeItem(LS_USER_KEY);
          }
        }
      }

      // First launch setup
      const hasLaunchedBefore = localStorage.getItem(LS_FIRST_LAUNCH_KEY);
      if (isElectron && !hasLaunchedBefore) {
        setShowSetupLoader(true);
        setSetupCountdown(8);
        localStorage.setItem(LS_FIRST_LAUNCH_KEY, 'true');
      }

      setAuthChecked(true);
    };

    initAuth();
  }, []);

  // Listen for auth success from SignInPage (custom event)
  useEffect(() => {
    const handleAuthEvent = (event: any) => {
      const { user, accessToken, refreshToken } = event.detail;
      if (accessToken) setAccessToken(accessToken);
      if (refreshToken) setRefreshToken(refreshToken);
      saveUser(user);
      navigate('/service');
    };

    window.addEventListener('user-auth-success', handleAuthEvent as EventListener);
    return () => {
      window.removeEventListener('user-auth-success', handleAuthEvent as EventListener);
    };
  }, [navigate]);

  // Listen for token/shortcut updates
  useEffect(() => {
    const handleTokenUpdate = (event: any) => {
      const { tokens } = event.detail;
      setCurrentUser((prevUser: any) => {
        if (!prevUser) return prevUser;
        const updatedUser = { ...prevUser, tokens };
        localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
        return updatedUser;
      });
    };

    const handleShortcutUpdate = (event: any) => {
      const { shortcuts } = event.detail;
      setCurrentUser((prevUser: any) => {
        if (!prevUser) return prevUser;
        const updatedUser = { ...prevUser, shortcuts };
        localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
        return updatedUser;
      });
    };

    window.addEventListener('user-tokens-updated', handleTokenUpdate as EventListener);
    window.addEventListener('user-shortcuts-updated', handleShortcutUpdate as EventListener);

    return () => {
      window.removeEventListener('user-tokens-updated', handleTokenUpdate as EventListener);
      window.removeEventListener('user-shortcuts-updated', handleShortcutUpdate as EventListener);
    };
  }, []);

  const handleAuthSuccess = (user: any, accessToken?: string, refreshToken?: string) => {
    if (accessToken) setAccessToken(accessToken);
    if (refreshToken) setRefreshToken(refreshToken);
    saveUser(user);
    navigate('/service');
  };

  const handleLogout = () => {
    performLogout();
  };

  useEffect(() => {
    if (showSetupLoader && setupCountdown > 0) {
      const timer = setTimeout(() => {
        setSetupCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (showSetupLoader && setupCountdown === 0) {
      setTimeout(() => {
        setShowSetupLoader(false);
      }, 500);
    }
  }, [showSetupLoader, setupCountdown]);

  const handleNewSession = async () => {
    if (!currentUser) return;
    setShowConfirmModal(true);
  };

  const confirmNewSession = async () => {
    setShowConfirmModal(false);
    try {
      const result = await messagesClient.clearHistory(currentUser._id);

      // Reset settings (best-effort, don't block on failure)
      const resetSettings = {
        ...(currentUser.settings || {}),
        jobDescription: '',
        companyInfo: '',
        jobDescriptionSummary: '',
        companyInfoSummary: '',
        cvSummary: currentUser.settings?.cvSummary || '',
        basePromptSummary: currentUser.settings?.basePromptSummary || '',
        cvText: currentUser.settings?.cvText || '',
        basePrompt: currentUser.settings?.basePrompt || '',
        responseLanguage: currentUser.settings?.responseLanguage || 'English',
        contextMessages: currentUser.settings?.contextMessages ?? 5,
        apiKeys: currentUser.settings?.apiKeys || {}
      };

      try {
        await authClient.updateSettings(currentUser._id, resetSettings);
      } catch (e) {
        console.warn('⚠️ Failed to reset settings on server:', e);
      }

      try {
        await apiClient('/auth/deepgram-keyterms', {
          method: 'PUT',
          body: JSON.stringify({ userId: currentUser._id, deepgramKeyterms: '' })
        });
      } catch (e) {
        console.warn('⚠️ Failed to clear keyterms on server:', e);
      }

      const updatedUser = { ...currentUser, deepgramKeyterms: '', settings: { ...currentUser.settings, ...resetSettings } };
      setCurrentUser(updatedUser);
      localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
      localStorage.removeItem('isa_chat_history');
      localStorage.setItem('isa_job_description', '');
      localStorage.setItem('isa_company_info', '');
      localStorage.removeItem(`isa_providers_sent_context_${currentUser._id}`);
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        setSessionKey(prev => prev + 1);
      }, 1500);
    } catch (error: any) {
      console.error('❌ New Session error:', error);
      setErrorMessage(error?.message || 'Failed to start new session. Please try again.');
      setShowErrorModal(true);
    }
  };

  // Show loading spinner / offline error while auth check runs
  if (!authChecked && !showSetupLoader) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-slate-950 flex items-center justify-center z-[10000] transition-colors duration-300">
        <div className="flex flex-col items-center gap-6">
          {isOffline ? (
            <>
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07m-4.243 4.243a1 1 0 010-1.414M3 3l18 18" />
                </svg>
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-red-600 dark:text-red-400">No Internet Connection</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">Please check your connection and try again.</p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-500/10 dark:border-blue-500/20 rounded-full absolute"></div>
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-xl font-bold text-black dark:text-white">Loading...</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Initializing application</p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {showSetupLoader && (
        <div className="fixed inset-0 bg-white dark:bg-slate-950 flex items-center justify-center z-[10000] transition-colors duration-300">
          <div className="flex flex-col items-center gap-8">
            <div className="relative">
              <div className="w-32 h-32 border-8 border-blue-500/10 dark:border-blue-500/20 rounded-full absolute"></div>
              <div className="w-32 h-32 border-8 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-6xl animate-pulse">⚡</div>
              </div>
            </div>
            <div className="text-center space-y-3">
              <h3 className="text-3xl font-black text-black dark:text-white tracking-tight">Setting Up Your Workspace</h3>
              <p className="text-slate-600 dark:text-slate-400 text-base">Loading AI assistant, configuring settings...</p>
            </div>
            <div className="w-80 space-y-2">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Initializing...</span>
                <span>{Math.round(((8 - setupCountdown) / 8) * 100)}%</span>
              </div>
              <div className="w-full h-3 bg-slate-200 dark:bg-slate-800/50 rounded-full overflow-hidden border border-slate-300 dark:border-slate-700/50">
                <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-1000 ease-linear shadow-lg shadow-blue-500/50"
                  style={{ width: `${((8 - setupCountdown) / 8) * 100}%` }}
                ></div>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-slate-600 font-mono">
                {setupCountdown > 6 ? '🔧 Loading modules...' :
                 setupCountdown > 4 ? '🤖 Initializing AI engine...' :
                 setupCountdown > 2 ? '⚙️ Configuring settings...' :
                 '✨ Almost ready...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Offline banner */}
      {authChecked && isOffline && (
        <div className="fixed top-0 left-0 right-0 bg-red-500/90 dark:bg-red-600/90 text-white text-center py-2 px-4 text-sm font-medium z-[9999] backdrop-blur-sm">
          No internet connection — some features may be unavailable
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] animate-fadeIn">
          <div className="bg-white/90 dark:bg-slate-900/40 backdrop-blur-xl border-2 border-blue-500/30 dark:border-blue-500/50 rounded-2xl p-8 max-w-md mx-4 shadow-2xl dark:shadow-[0_20px_70px_rgba(59,130,246,0.3)] animate-scaleIn">
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">🔄</div>
              <h3 className="text-2xl font-bold text-black dark:text-white mb-2">Start New Meeting Session?</h3>
            </div>
            <div className="text-slate-700 dark:text-slate-200 mb-6 space-y-2">
              <p className="text-sm font-medium">This will:</p>
              <ul className="text-sm list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300">
                <li>Clear all previous messages</li>
                <li>Reset conversation history</li>
                <li>Clear Job Description & its summary</li>
                <li>Clear Company Information & its summary</li>
                <li>Reset Context Messages to default (10)</li>
                <li><strong>Keep your CV, Base Prompt & their summaries</strong></li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 px-6 py-3 bg-slate-200 dark:bg-slate-700/60 hover:bg-slate-300 dark:hover:bg-slate-600/80 backdrop-blur-sm text-black dark:text-white rounded-lg font-bold transition-all">Cancel</button>
              <button onClick={confirmNewSession} className="flex-1 px-6 py-3 bg-blue-600 dark:bg-blue-600/80 hover:bg-blue-700 dark:hover:bg-blue-600 backdrop-blur-sm text-white rounded-lg font-bold transition-all">Start New Session</button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] animate-fadeIn">
          <div className="bg-white/90 dark:bg-slate-900/40 backdrop-blur-xl border-2 border-green-500/30 dark:border-blue-500/50 rounded-2xl p-8 max-w-md mx-4 shadow-2xl dark:shadow-[0_20px_70px_rgba(34,197,94,0.3)] animate-scaleIn">
            <div className="text-center">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">Session Cleared!</h3>
              <p className="text-slate-700 dark:text-slate-200 text-sm">Starting fresh meeting session...</p>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] animate-fadeIn">
          <div className="bg-white/90 dark:bg-slate-900/40 backdrop-blur-xl border-2 border-red-500/30 dark:border-red-500/50 rounded-2xl p-8 max-w-md mx-4 shadow-2xl dark:shadow-[0_20px_70px_rgba(239,68,68,0.3)] animate-scaleIn">
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">❌</div>
              <h3 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">Error</h3>
              <p className="text-slate-700 dark:text-slate-200 text-sm">{errorMessage}</p>
            </div>
            <button onClick={() => setShowErrorModal(false)} className="w-full px-6 py-3 bg-red-600 dark:bg-red-600/80 hover:bg-red-700 dark:hover:bg-red-600 backdrop-blur-sm text-white rounded-lg font-bold transition-all">Close</button>
          </div>
        </div>
      )}

      <Routes>
        {/* Electron: Skip landing pages, go straight to app */}
        {isElectron ? (
          <>
            <Route
              path="/admin/settings"
              element={
                isAuthenticated ? (
                  <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col transition-colors duration-300">
                    <Navbar user={currentUser} onLogout={handleLogout} showAllLinks={true} />
                    <div className="flex-grow"><SuperAdminPage user={currentUser} /></div>
                    <Footer />
                  </div>
                ) : (
                  <AuthPage onAuthSuccess={handleAuthSuccess} />
                )
              }
            />
            <Route
              path="*"
              element={
                isAuthenticated ? (
                  <div className="min-h-screen bg-white dark:bg-slate-950 transition-colors duration-300">
                    <Navbar user={currentUser} onLogout={handleLogout} onNewSession={handleNewSession} showSessionButton={true} isElectron={true} />
                    <App key={sessionKey} user={currentUser} onLogout={handleLogout} onNewSession={handleNewSession} />
                  </div>
                ) : (
                  <AuthPage onAuthSuccess={handleAuthSuccess} />
                )
              }
            />
          </>
        ) : (
          <>
            {/* Web App Routes */}
            <Route path="/" element={<><Navbar user={currentUser} onLogout={handleLogout} /><LandingPage /></>} />
            <Route path="/features" element={<><Navbar user={currentUser} onLogout={handleLogout} /><FeaturesPage /></>} />
            <Route path="/about" element={<><Navbar user={currentUser} onLogout={handleLogout} /><AboutPage /></>} />
            <Route path="/contact" element={<><Navbar user={currentUser} onLogout={handleLogout} /><ContactPage /></>} />
            <Route path="/pricing" element={<><Navbar user={currentUser} onLogout={handleLogout} /><PricingPage user={currentUser} /></>} />

            {/* Dedicated Sign In / Sign Up page */}
            <Route path="/signin" element={<SignInPage />} />

            {/* Email Verification */}
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            {/* Protected route - Interview App - redirects to /signin if not authenticated */}
            <Route
              path="/service"
              element={
                isAuthenticated ? (
                  <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col transition-colors duration-300">
                    <Navbar user={currentUser} onLogout={handleLogout} onNewSession={handleNewSession} showSessionButton={true} showAllLinks={true} />
                    <div className="flex-grow">
                      <App key={sessionKey} user={currentUser} onLogout={handleLogout} onNewSession={handleNewSession} />
                    </div>
                    <Footer />
                  </div>
                ) : (
                  <Navigate to="/signin" replace />
                )
              }
            />

            {/* Super Admin Settings Route */}
            <Route
              path="/admin/settings"
              element={
                isAuthenticated ? (
                  <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col transition-colors duration-300">
                    <Navbar user={currentUser} onLogout={handleLogout} showAllLinks={true} />
                    <div className="flex-grow"><SuperAdminPage user={currentUser} /></div>
                    <Footer />
                  </div>
                ) : (
                  <Navigate to="/signin" replace />
                )
              }
            />

            {/* Catch-all redirect to landing */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </>
  );
};

const AppRouter: React.FC = () => {
  return (
    <DarkModeProvider>
      <BrowserRouter>
        <AppRouterContent />
      </BrowserRouter>
    </DarkModeProvider>
  );
};

export default AppRouter;
