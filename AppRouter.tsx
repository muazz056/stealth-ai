import React, { useState, useEffect } from 'react';
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
import { DarkModeProvider } from './src/context/DarkModeContext';
import { API_CONFIG } from './src/config';

const LS_USER_KEY = 'isa_current_user';
const LS_FIRST_LAUNCH_KEY = 'isa_first_launch_done';
const API_BASE_URL = API_CONFIG.BASE_URL;

// Inner component that has access to useNavigate
const AppRouterContent: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [showSetupLoader, setShowSetupLoader] = useState(false);
  const [setupCountdown, setSetupCountdown] = useState(8);
  
  // Detect if running in Electron
  const isElectron = typeof window !== 'undefined' && (window as any).require;

  // Check authentication
  useEffect(() => {
    const loadUser = async () => {
      const savedUser = localStorage.getItem(LS_USER_KEY);
      const hasLaunchedBefore = localStorage.getItem(LS_FIRST_LAUNCH_KEY);
      
      if (isElectron && !hasLaunchedBefore) {
        setShowSetupLoader(true);
        setSetupCountdown(8);
        localStorage.setItem(LS_FIRST_LAUNCH_KEY, 'true');
      }
      
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setCurrentUser(user);
          setIsAuthenticated(true);
          
          authClient.getUser(user._id).then((result) => {
            if (result && result.user) {
              const currentSaved = localStorage.getItem(LS_USER_KEY);
              if (currentSaved) {
                const current = JSON.parse(currentSaved);
                if (current.deepgramLanguage !== user.deepgramLanguage || current.deepgramKeyterms !== user.deepgramKeyterms) {
                  return;
                }
              }
              const updatedUser = { ...user, ...result.user, _id: user._id };
              setCurrentUser(updatedUser);
              localStorage.setItem(LS_USER_KEY, JSON.stringify(updatedUser));
            }
          }).catch((e) => {
            console.error('Background validation error:', e);
          });
        } catch (e) {
          console.error('Error loading user:', e);
          localStorage.removeItem(LS_USER_KEY);
        }
      }
    };
    
    loadUser();
    
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

  // Listen for auth success from SignInPage (custom event)
  useEffect(() => {
    const handleAuthEvent = (event: any) => {
      const { user } = event.detail;
      setCurrentUser(user);
      setIsAuthenticated(true);
      navigate('/service');
    };
    
    window.addEventListener('user-auth-success', handleAuthEvent as EventListener);
    return () => {
      window.removeEventListener('user-auth-success', handleAuthEvent as EventListener);
    };
  }, [navigate]);

  const handleAuthSuccess = (user: any) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    localStorage.setItem(LS_USER_KEY, JSON.stringify(user));
    // Redirect to /service after successful auth
    navigate('/service');
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

  const handleLogout = () => {
    if (currentUser) {
      localStorage.removeItem(`isa_providers_sent_context_${currentUser._id}`);
    }
    setCurrentUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem(LS_USER_KEY);
    navigate('/');
  };

  const handleNewSession = async () => {
    if (!currentUser) return;
    setShowConfirmModal(true);
  };

  const confirmNewSession = async () => {
    setShowConfirmModal(false);
    try {
      const result = await messagesClient.clearHistory(currentUser._id);
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
      
      await authClient.updateSettings(currentUser._id, resetSettings);
      
      try {
        await fetch(`${API_BASE_URL}/api/auth/deepgram-keyterms`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser._id, deepgramKeyterms: '' })
        });
      } catch (e) {}

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
    } catch (error) {
      setShowErrorModal(true);
    }
  };

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

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] animate-fadeIn">
          <div className="bg-white/90 dark:bg-slate-900/40 backdrop-blur-xl border-2 border-blue-500/30 dark:border-blue-500/50 rounded-2xl p-8 max-w-md mx-4 shadow-2xl dark:shadow-[0_20px_70px_rgba(59,130,246,0.3)] animate-scaleIn">
            <div className="text-center mb-6">
              <div className="text-5xl mb-4">🔄</div>
              <h3 className="text-2xl font-bold text-black dark:text-white mb-2">Start New Interview Session?</h3>
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
              <p className="text-slate-700 dark:text-slate-200 text-sm">Starting fresh interview session...</p>
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
              <p className="text-slate-700 dark:text-slate-200 text-sm">Failed to start new session. Please try again.</p>
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
            <Route path="/pricing" element={<><Navbar user={currentUser} onLogout={handleLogout} /><PricingPage /><Footer /></>} />

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