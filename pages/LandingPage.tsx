import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Footer from '../components/Footer';
import { APP_CONFIG } from '../src/config';

const WindowsIcon = () => (
  <svg viewBox="0 0 24 24" className="w-12 h-12 mx-auto" fill="currentColor">
    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.801"/>
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-12 h-12 mx-auto" fill="currentColor">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
  </svg>
);

const LinuxIcon = () => (
  <svg viewBox="0 0 24 24" className="w-12 h-12 mx-auto" fill="currentColor">
    <path d="M12 2C10.5 2 7 4 7 10c0 3.5 2 5.5 2 7.5S10 22 10 22h4s1-1.5 1-4.5 2-4 2-7.5c0-6-3.5-8-5-8zm-1 3c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zm2 0c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zm-2.5 2c.3 0 .5.2.5.5s-.2.5-.5.5-.5-.2-.5-.5.2-.5.5-.5zm3 0c.3 0 .5.2.5.5s-.2.5-.5.5-.5-.2-.5-.5.2-.5.5-.5zM12 7c1 0 1.5.5 1.5 1.5S12.5 10 12 10s-1.5-.5-1.5-1.5S11 7 12 7zm-1.5 4c.3 0 .5.2.5.5s-.2.5-.5.5-.5-.2-.5-.5.2-.5.5-.5zm3 0c.3 0 .5.2.5.5s-.2.5-.5.5-.5-.2-.5-.5.2-.5.5-.5zM12 11c1 0 1.5.5 1.5 1.5S12.5 14 12 14s-1.5-.5-1.5-1.5S11 11 12 11zm-2 3.5c.3 0 .5.2.5.5s-.2.5-.5.5-.5-.2-.5-.5.2-.5.5-.5zm4 0c.3 0 .5.2.5.5s-.2.5-.5.5-.5-.2-.5-.5.2-.5.5-.5z"/>
  </svg>
);

const LS_USER_KEY = 'isa_current_user';

const LandingPage: React.FC = () => {
  const isElectron = typeof window !== 'undefined' && (window as any).require;
  const showDownload = !isElectron && APP_CONFIG.DOWNLOAD_WINDOWS;
  const location = useLocation();
  const navigate = useNavigate();
  
  const isLoggedIn = () => {
    try {
      const user = localStorage.getItem(LS_USER_KEY);
      return !!user && JSON.parse(user)?._id;
    } catch { return false; }
  };
  
  useEffect(() => {
    if (location.hash === '#download') {
      setTimeout(() => {
        document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [location]);
  
  const handleDownloadClick = (e: React.MouseEvent) => {
    if (!isLoggedIn()) {
      e.preventDefault();
      navigate('/service');
    }
  };
  
  return (
    <div className="min-h-screen bg-white dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 transition-colors duration-300">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Enhanced Background Effects - Dark Mode Only */}
        <div className="absolute inset-0 dark:block hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>

        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-32 pb-24 md:pb-32">
          <div className="text-center">
            {/* Logo with Animation */}
            <div className="flex justify-center mb-8 md:mb-12">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl blur-2xl opacity-50 animate-pulse"></div>
                <div className="relative h-24 w-24 md:h-32 md:w-32 bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 rounded-3xl flex items-center justify-center font-black text-white text-4xl md:text-5xl shadow-2xl shadow-blue-500/50 transform hover:scale-110 transition-transform duration-300">
                  IA
                </div>
              </div>
            </div>

            {/* Heading with Gradient */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black text-black dark:text-white mb-6 md:mb-8 uppercase tracking-tight">
              Meeting{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-500 dark:to-purple-500 animate-gradient">
                Assist
              </span>
            </h1>
            
            <p className="text-xl sm:text-2xl md:text-3xl text-slate-800 dark:text-white mb-4 md:mb-6 font-semibold px-4">
              AI-Powered Real-Time {APP_CONFIG.NAME}
            </p>
            
            <p className="text-base md:text-lg text-slate-700 dark:text-gray-100 mb-10 md:mb-14 max-w-3xl mx-auto px-4 leading-relaxed">
               Get instant, intelligent answers during live meetings with our stealth overlay technology.
              <br className="hidden md:block" />
              <span className="text-blue-600 dark:text-blue-300 font-semibold">Invisible to screen sharing.</span> Powered by cutting-edge AI.
            </p>

            {/* CTA Buttons with Enhanced Design */}
            <div className="flex flex-col gap-4 md:gap-5 justify-center items-stretch max-w-md mx-auto mb-16 md:mb-24 px-4">
              <Link
                to="/service"
                className="group relative w-full px-8 md:px-10 py-4 md:py-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white rounded-xl text-base md:text-lg font-bold transition-all shadow-2xl shadow-blue-500/50 hover:shadow-blue-500/70 hover:scale-105 transform overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  🚀 Start Meeting Session
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              </Link>
              
              <Link
                to="/pricing"
                className="w-full px-8 md:px-10 py-4 md:py-5 bg-slate-200 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-slate-300 dark:hover:bg-slate-700/50 border border-slate-300 dark:border-slate-600 hover:border-blue-500/50 text-black dark:text-white rounded-xl text-base md:text-lg font-bold transition-all hover:scale-105 transform"
              >
                💎 View Pricing
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-4 md:gap-8 mb-16 text-slate-700 dark:text-gray-100 text-sm md:text-base max-w-2xl mx-auto px-4">
              <div className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800/30 backdrop-blur-sm rounded-lg px-4 py-2">
                <span className="text-green-500 text-xl">✓</span>
                <span>No Credit Card Required</span>
              </div>
              <div className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800/30 backdrop-blur-sm rounded-lg px-4 py-2">
                <span className="text-green-500 text-xl">✓</span>
                <span>15 Free Credits</span>
              </div>
              <div className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800/30 backdrop-blur-sm rounded-lg px-4 py-2">
                <span className="text-green-500 text-xl">✓</span>
                <span>100% Private</span>
              </div>
            </div>

            {/* Features Grid with Enhanced Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 mt-20 md:mt-24 max-w-6xl mx-auto">
              <FeatureCard
                icon="🎙️"
                title="Real-Time Speech"
                description="Live voice-to-text transcription with Google Speech API. Instant and accurate."
                gradient="from-blue-500/10 to-indigo-500/10"
              />
              <FeatureCard
                icon="🤖"
                title="Multi-AI Support"
                description="Choose from Gemini, OpenAI, Claude, or Groq. Use your own API keys for full control."
                gradient="from-indigo-500/10 to-purple-500/10"
              />
              <FeatureCard
                icon="👻"
                title="Stealth Mode"
                description="Overlay window is invisible to screen sharing. Works on Zoom, Teams, Meet, and more."
                gradient="from-purple-500/10 to-pink-500/10"
              />
              <FeatureCard
                icon="📄"
                title="Resume Integration"
                description="Upload your CV and get personalized answers based on your experience."
                gradient="from-pink-500/10 to-red-500/10"
              />
              <FeatureCard
                icon="⚡"
                title="Lightning Fast"
                description="Streaming responses with optimized context. Get answers in seconds, not minutes."
                gradient="from-red-500/10 to-orange-500/10"
              />
              <FeatureCard
                icon="🔒"
                title="100% Private"
                description="Your data never leaves your device. All AI calls are direct with your API keys."
                gradient="from-orange-500/10 to-yellow-500/10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Download Section - Only show on Vite/Web, not Electron */}
      {showDownload && (
      <div id="download" className="bg-slate-50 dark:bg-slate-900/50 py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-black dark:text-white mb-4 uppercase">
              Download <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-500">Now</span>
            </h2>
            <p className="text-lg md:text-xl text-slate-700 dark:text-gray-100 max-w-2xl mx-auto">
              Get started in minutes. Available for Windows. Electron-powered desktop app with stealth overlay.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-4xl mx-auto">
            <DownloadCard
              platform="Windows"
              icon={<WindowsIcon />}
              color="from-blue-500 to-blue-700"
              version="v1.2.0"
              size="~150 MB"
              comingSoon={false}
            />
            <DownloadCard
              platform="macOS"
              icon={<AppleIcon />}
              color="from-gray-500 to-gray-700"
              version="Coming Soon"
              size="TBD"
              comingSoon={true}
            />
            <DownloadCard
              platform="Linux"
              icon={<LinuxIcon />}
              color="from-orange-500 to-yellow-600"
              version="Coming Soon"
              size="TBD"
              comingSoon={true}
            />
          </div>
        </div>
      </div>
      )}
      
      <Footer />
    </div>
  );
};

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  gradient: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description, gradient }) => (
  <div className={`group relative bg-white dark:bg-slate-800/30 backdrop-blur-sm border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6 md:p-8 hover:border-blue-500/50 transition-all duration-300 hover:scale-105 transform`}>
    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
    <div className="relative z-10">
      <div className="text-4xl md:text-5xl mb-4">{icon}</div>
      <h3 className="text-xl md:text-2xl font-black text-black dark:text-white mb-3">{title}</h3>
      <p className="text-slate-700 dark:text-gray-100 text-sm md:text-base leading-relaxed">{description}</p>
    </div>
  </div>
);

interface DownloadCardProps {
  platform: string;
  icon: React.ReactNode;
  color: string;
  version: string;
  size: string;
  comingSoon: boolean;
}

const DownloadCard: React.FC<DownloadCardProps> = ({ platform, icon, color, version, size, comingSoon }) => {
  const navigate = useNavigate();
  
  const isLoggedIn = () => {
    try {
      const user = localStorage.getItem(LS_USER_KEY);
      return !!user && JSON.parse(user)?._id;
    } catch { return false; }
  };
  
  const getDownloadUrl = () => {
    if (platform.toLowerCase().includes('windows')) {
      return APP_CONFIG.DOWNLOAD_WINDOWS;
    }
    if (platform.toLowerCase().includes('mac')) {
      return APP_CONFIG.DOWNLOAD_MAC;
    }
    if (platform.toLowerCase().includes('linux')) {
      return APP_CONFIG.DOWNLOAD_LINUX;
    }
    return '';
  };
  
  const downloadUrl = getDownloadUrl();
  const isAvailable = !comingSoon && downloadUrl;
  
  const handleDownload = () => {
    if (!isLoggedIn()) {
      navigate('/service');
      return;
    }
    // Use backend proxy to force correct filename via Content-Disposition header
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    const proxyUrl = `${backendUrl}/api/download/windows?url=${encodeURIComponent(downloadUrl)}`;
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = APP_CONFIG.DOWNLOAD_FILENAME || 'Stealth Assist Setup.exe';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  
  return (
    <div className="group bg-white dark:bg-slate-800/30 backdrop-blur-sm border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6 md:p-8 hover:border-blue-500/50 transition-all hover:scale-105 transform relative overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
      <div className="relative z-10">
        <div className={`w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-2xl bg-gradient-to-br ${color} bg-opacity-10 text-white shadow-lg`}>
          {icon}
        </div>
        <h3 className="text-2xl font-black text-black dark:text-white mb-2 text-center">{platform}</h3>
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Version</span>
          <span className="text-slate-700 dark:text-gray-100 text-sm font-semibold">{version}</span>
        </div>
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Size</span>
          <span className="text-slate-600 dark:text-gray-200 text-xs">{size}</span>
        </div>
        
        {!isAvailable ? (
          <button
            disabled
            className="w-full px-6 py-3 bg-slate-200 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 rounded-xl font-bold cursor-not-allowed border border-slate-300 dark:border-slate-600/50"
          >
            Coming Soon
          </button>
        ) : (
          <button
            onClick={handleDownload}
            className={`w-full px-6 py-3 bg-gradient-to-r ${color} hover:brightness-110 text-white rounded-xl font-bold text-center transition-all shadow-lg hover:shadow-xl`}
          >
            Download
          </button>
        )}
      </div>
    </div>
  );
};

export default LandingPage;
