import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
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

