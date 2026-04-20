import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APP_CONFIG } from '../src/config';

const LS_USER_KEY = 'isa_current_user';

const Footer: React.FC = () => {
  const navigate = useNavigate();
  const isElectron = typeof window !== 'undefined' && (window as any).require;
  const showDownload = !isElectron && APP_CONFIG.DOWNLOAD_WINDOWS;
  
  const isLoggedIn = () => {
    try {
      const user = localStorage.getItem(LS_USER_KEY);
      return !!user && JSON.parse(user)?._id;
    } catch { return false; }
  };
  
  const handleDownloadClick = () => {
    if (!isLoggedIn()) {
      navigate('/service');
      return;
    }
    window.location.href = APP_CONFIG.DOWNLOAD_WINDOWS;
  };
  
  return (
    <footer className="bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 py-8 sm:py-12 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-6 sm:mb-8">
          <div>
            <h3 className="text-black dark:text-white font-bold mb-3 sm:mb-4 text-sm sm:text-base">Product</h3>
            <ul className="space-y-2">
              <li><Link to="/features" className="text-slate-600 dark:text-slate-500 hover:text-black dark:hover:text-white text-xs sm:text-sm transition-colors">Features</Link></li>
              <li><Link to="/service" className="text-slate-600 dark:text-slate-500 hover:text-black dark:hover:text-white text-xs sm:text-sm transition-colors">Try Web App</Link></li>
              <li><a href="#download" className="text-slate-600 dark:text-slate-500 hover:text-black dark:hover:text-white text-xs sm:text-sm transition-colors">Download</a></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-black dark:text-white font-bold mb-3 sm:mb-4 text-sm sm:text-base">Company</h3>
            <ul className="space-y-2">
              <li><Link to="/about" className="text-slate-600 dark:text-slate-500 hover:text-black dark:hover:text-white text-xs sm:text-sm transition-colors">About Us</Link></li>
              <li><Link to="/contact" className="text-slate-600 dark:text-slate-500 hover:text-black dark:hover:text-white text-xs sm:text-sm transition-colors">Contact</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-black dark:text-white font-bold mb-3 sm:mb-4 text-sm sm:text-base">Legal</h3>
            <ul className="space-y-2">
              <li><a href="#" className="text-slate-600 dark:text-slate-500 hover:text-black dark:hover:text-white text-xs sm:text-sm transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="text-slate-600 dark:text-slate-500 hover:text-black dark:hover:text-white text-xs sm:text-sm transition-colors">Terms of Service</a></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-black dark:text-white font-bold mb-3 sm:mb-4 text-sm sm:text-base">Connect</h3>
            <ul className="space-y-2">
              <li><a href="#" className="text-slate-600 dark:text-slate-500 hover:text-black dark:hover:text-white text-xs sm:text-sm transition-colors">GitHub</a></li>
              <li><a href="#" className="text-slate-600 dark:text-slate-500 hover:text-black dark:hover:text-white text-xs sm:text-sm transition-colors">Twitter</a></li>
              <li><a href="#" className="text-slate-600 dark:text-slate-500 hover:text-black dark:hover:text-white text-xs sm:text-sm transition-colors">Discord</a></li>
            </ul>
          </div>
        </div>
        
        {/* Download CTA Button */}
        {showDownload && (
          <div className="my-8 sm:my-12 text-center">
            <button
              onClick={handleDownloadClick}
              className="inline-block px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all transform hover:scale-105"
            >
              🚀 Download Stealth Assist for Windows
            </button>
          </div>
        )}
        
        <div className="border-t border-slate-200 dark:border-slate-800 pt-6 sm:pt-8 text-center">
          <p className="text-slate-500 dark:text-slate-600 text-xs sm:text-sm">
            © 2024 Interview Stealth Assist. All rights reserved. Use ethically and responsibly.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

