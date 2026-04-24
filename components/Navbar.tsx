import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDarkMode } from '../src/context/DarkModeContext';
import { APP_CONFIG } from '../src/config';

interface NavbarProps {
  user?: any;
  onLogout?: () => void;
  onNewSession?: () => void;
  showSessionButton?: boolean;
  showAllLinks?: boolean;
  isElectron?: boolean;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout, onNewSession, showSessionButton = false, showAllLinks = false, isElectron = false }) => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  // Token display logic
  const getTokenDisplay = () => {
    if (!user) return null;
    
    const isAdmin = user.role === 'admin';
    const tokens = user.tokens ?? 0;
    
    if (isAdmin || tokens === -1) {
      return '∞'; // Infinity symbol for unlimited
    }
    return tokens;
  };

  const getTokenColor = () => {
    if (!user) return 'text-slate-400';
    
    const isAdmin = user.role === 'admin';
    const tokens = user.tokens ?? 0;
    
    if (isAdmin || tokens === -1) {
      return 'text-green-400'; // Green for unlimited
    }
    if (tokens >= 5) {
      return 'text-green-400'; // Green for 5+ tokens
    }
    if (tokens >= 2) {
      return 'text-yellow-400'; // Yellow for 2-4 tokens
    }
    return 'text-red-400'; // Red for low tokens
  };

  return (
    <nav className="bg-white dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity">
            <div className="h-8 w-8 sm:h-10 sm:w-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center font-black text-white text-sm sm:text-base">
              IA
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm sm:text-lg font-black text-black dark:text-white uppercase italic">Interview Assist</h1>
              <p className="text-[10px] text-slate-600 dark:text-slate-500">Stealth Engine V1.2</p>
            </div>
            <h1 className="sm:hidden text-sm font-black text-black dark:text-white uppercase italic">IA</h1>
          </Link>

          {/* Desktop Navigation */}
          <div className={isElectron ? "flex items-center gap-4 xl:gap-6" : "hidden lg:flex items-center gap-4 xl:gap-6"}>
            {!isElectron && (
              <>
                <Link to="/" className="text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white text-sm font-medium transition-colors">
                  Home
                </Link>
                {!isElectron && APP_CONFIG.DOWNLOAD_WINDOWS && (
                  <Link 
                    to="/#download"
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-sm font-bold transition-all shadow-md hover:shadow-lg"
                  >
                    Stealth
                  </Link>
                )}
                <Link to="/features" className="text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white text-sm font-medium transition-colors">
                  Features
                </Link>
                <Link to="/pricing" className="text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white text-sm font-medium transition-colors">
                  Pricing
                </Link>
                <Link to="/service" className="text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white text-sm font-medium transition-colors">
                  Service
                </Link>
                <Link to="/about" className="text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white text-sm font-medium transition-colors">
                  About
                </Link>
                <Link to="/contact" className="text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white text-sm font-medium transition-colors">
                  Contact
                </Link>
              </>
            )}
            
            {/* Dark Mode Toggle - Web only */}
            {!isElectron && (
              <button
                onClick={toggleDarkMode}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-all group"
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? (
                  <svg className="w-5 h-5 text-yellow-500 group-hover:text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-slate-600 group-hover:text-slate-800" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                )}
              </button>
            )}
            
            {!user ? (
              <Link 
                to="/service" 
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all"
              >
                Get Started
              </Link>
             ) : (
              <>
                {/* Electron: Only Welcome + Logout */}
                {isElectron ? (
                  <>
                    {/* Tokens Display */}
                    {user && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-200 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700/50 rounded-lg">
                        <span className="text-xl">🪙</span>
                        <span className={`text-sm font-bold ${getTokenColor()}`}>
                          {getTokenDisplay()}
                        </span>
                        <span className="text-xs text-slate-600 dark:text-slate-500">tokens</span>
                      </div>
                    )}
                    
                    {/* Theme Toggle */}
                    <button
                      onClick={toggleDarkMode}
                      className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition-all"
                      title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                      {isDarkMode ? (
                        <span className="text-lg">☀️</span>
                      ) : (
                        <span className="text-lg">🌙</span>
                      )}
                    </button>
                    
                    <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                      Welcome, <span className="text-black dark:text-white font-bold">{user.name}</span>
                    </span>
                    
                    <button
                      onClick={onLogout}
                      className="px-3 sm:px-4 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg text-xs sm:text-sm font-bold transition-all"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    {/* Web: Show all buttons */}
                    {showSessionButton && (
                      <button
                        onClick={onNewSession}
                        className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all"
                      >
                      New Session
                      </button>
                    )}
                    
                    {/* Theme Toggle */}
                    <button
                      onClick={toggleDarkMode}
                      className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 transition-all"
                      title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                      {isDarkMode ? (
                        <span className="text-lg">☀️</span>
                      ) : (
                        <span className="text-lg">🌙</span>
                      )}
                    </button>
                    
                    {/* Tokens Display */}
                    {user && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-200 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700/50 rounded-lg">
                        <span className="text-xl">🪙</span>
                        <span className={`text-sm font-bold ${getTokenColor()}`}>
                          {getTokenDisplay()}
                        </span>
                        <span className="text-xs text-slate-600 dark:text-slate-500 hidden xl:inline">tokens</span>
                      </div>
                    )}
                    
                    <span className="text-xs text-slate-700 dark:text-slate-500">Welcome, {user.name}</span>
                    
                    <button
                      onClick={onLogout}
                      className="px-3 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg text-xs font-bold transition-all"
                    >
                      Logout
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Mobile Menu Button - Hidden in Electron */}
          {!isElectron && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-slate-600 dark:text-slate-400 hover:text-black dark:hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          )}
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-col gap-2">
              {!isElectron && (
                <>
                  <Link to="/" onClick={() => setMobileMenuOpen(false)} className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
                    Home
                  </Link>
                  {!isElectron && APP_CONFIG.DOWNLOAD_WINDOWS && (
                    <Link 
                      to="/#download"
                      onClick={() => setMobileMenuOpen(false)}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-bold transition-all"
                    >
                      Stealth
                    </Link>
                  )}
                  <Link to="/features" onClick={() => setMobileMenuOpen(false)} className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
                    Features
                  </Link>
                  <Link to="/pricing" onClick={() => setMobileMenuOpen(false)} className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
                    Pricing
                  </Link>
                  <Link to="/service" onClick={() => setMobileMenuOpen(false)} className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
                    Service
                  </Link>
                  <Link to="/about" onClick={() => setMobileMenuOpen(false)} className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
                    About
                  </Link>
                  <Link to="/contact" onClick={() => setMobileMenuOpen(false)} className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
                    Contact
                  </Link>
                  
                  {/* Dark Mode Toggle - Mobile */}
                  <button
                    onClick={() => {
                      toggleDarkMode();
                      setMobileMenuOpen(false);
                    }}
                    className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    {isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
                  </button>
                </>
              )}
              
              {!user ? (
                <Link 
                  to="/service" 
                  onClick={() => setMobileMenuOpen(false)}
                  className="mx-4 mt-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all text-center"
                >
                  Get Started
                </Link>
               ) : (
                <>
                  {/* Electron: Only Welcome + Logout in mobile */}
                  {isElectron ? (
                    <>
                      {/* Tokens Display */}
                      {user && (
                        <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 bg-slate-200 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700/50 rounded-lg">
                          <span className="text-xl">🪙</span>
                          <span className={`text-sm font-bold ${getTokenColor()}`}>
                            {getTokenDisplay()}
                          </span>
                          <span className="text-xs text-slate-600 dark:text-slate-500">tokens</span>
                        </div>
                      )}
                      
                      <div className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">
                        Welcome, <span className="text-black dark:text-white font-bold">{user.name}</span>
                      </div>
                      
                      <button
                        onClick={() => {
                          onLogout?.();
                          setMobileMenuOpen(false);
                        }}
                        className="mx-4 px-4 py-3 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg text-sm font-bold transition-all"
                      >
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Web: Show all buttons in mobile */}
                      {/* Tokens Display */}
                      {user && (
                        <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 bg-slate-200 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-700/50 rounded-lg">
                          <span className="text-xl">🪙</span>
                          <span className={`text-sm font-bold ${getTokenColor()}`}>
                            {getTokenDisplay()}
                          </span>
                          <span className="text-xs text-slate-600 dark:text-slate-500">tokens</span>
                        </div>
                      )}
                      
                      <div className="px-4 py-2 text-sm text-slate-700 dark:text-slate-500">Welcome, {user.name}</div>
                      
                      {showSessionButton && (
                        <button
                          onClick={() => {
                            onNewSession?.();
                            setMobileMenuOpen(false);
                          }}
                          className="mx-4 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold transition-all"
                        >
                          🔄 New Session
                        </button>
                      )}
                      
                      <button
                        onClick={() => {
                          onLogout?.();
                          setMobileMenuOpen(false);
                        }}
                        className="mx-4 px-4 py-3 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg text-sm font-bold transition-all"
                      >
                        Logout
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

