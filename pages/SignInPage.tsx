import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AuthPage from '../components/AuthPage';
import { isElectron as checkIsElectron } from '../src/utils/authClient';

const SignInPage: React.FC = () => {
  const navigate = useNavigate();
  const isElectron = checkIsElectron();

  const handleAuthSuccess = (user: any) => {
    // Save user and notify AppRouter by dispatching a custom event + navigate
    localStorage.setItem('isa_current_user', JSON.stringify(user));
    window.dispatchEvent(new CustomEvent('user-auth-success', { detail: { user } }));
    navigate('/service');
  };

  if (isElectron) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <AuthPage onAuthSuccess={handleAuthSuccess} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col transition-colors duration-300">
      <Navbar />
      <div className="flex-grow">
        <AuthPage onAuthSuccess={handleAuthSuccess} />
      </div>
      <Footer />
    </div>
  );
};

export default SignInPage;