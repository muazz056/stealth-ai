import React, { useState, useEffect } from 'react';
import { authClient } from '../src/utils/authClient';

interface AuthPageProps {
  onAuthSuccess: (user: any) => void;
}

// Password validation hook
const usePasswordStrength = (password: string) => {
  const [strength, setStrength] = useState(0);
  const [rules, setRules] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
  });

  useEffect(() => {
    const hasLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);

    setRules({
      length: hasLength,
      uppercase: hasUppercase,
      lowercase: hasLowercase,
      number: hasNumber,
    });

    let score = 0;
    if (hasLength) score++;
    if (hasUppercase) score++;
    if (hasLowercase) score++;
    if (hasNumber) score++;
    setStrength(score);
  }, [password]);

  return { strength, rules };
};

const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  // Detect if running in Electron
  const isElectron = typeof window !== 'undefined' && (window as any).require;
  
  const [isLogin, setIsLogin] = useState(true);
  const [showResendForm, setShowResendForm] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [resendEmail, setResendEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  const { strength, rules } = usePasswordStrength(formData.password);

  const isPasswordValid = () => {
    if (isLogin) return true;
    return rules.length && rules.uppercase && rules.lowercase && rules.number;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isLogin && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Frontend password validation (signup only)
    if (!isLogin && !isPasswordValid()) {
      setError('Please ensure your password meets all requirements');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        // Login
        const result = await authClient.login(formData.username, formData.password);

        if (result.success) {
          onAuthSuccess(result.user);
        } else {
          setError(result.message);
        }
      } else {
        // Frontend email validation (double-check)
        const allowedDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me'];
        const domain = formData.email.toLowerCase().split('@')[1];
        if (!allowedDomains.includes(domain)) {
          setError('This email provider is not allowed. Please use Gmail, Yahoo, Outlook, Hotmail, iCloud, or Proton.');
          setLoading(false);
          return;
        }

        // Register
        const result = await authClient.register({
          username: formData.username,
          name: formData.name,
          email: formData.email,
          password: formData.password
        });

        if (result.success) {
          // Don't auto-login - user needs to verify email first
          setError('');
          // Clear any existing session
          localStorage.removeItem('isa_current_user');
          alert('Registration successful! Please check your email to verify your account before logging in.');
          setIsLogin(true); // Switch to login form
          // Reset form
          setFormData({
            username: '',
            name: '',
            email: '',
            password: '',
            confirmPassword: ''
          });
        } else {
          setError(result.message);
        }
      }
    } catch (err: any) {
      setError('Authentication failed: ' + err.message);
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 transition-colors duration-300 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background Effects - Dark Mode Only */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none dark:block hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Auth Card */}
      <div className="relative max-w-md w-full bg-white dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-slate-700/50 rounded-2xl shadow-2xl">
        {/* Gradient Border Effect - Dark Mode Only */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-purple-500/20 rounded-2xl blur-xl opacity-0 dark:opacity-50"></div>
        
        {/* Content */}
        <div className="relative p-8 md:p-10">
          {/* Logo/Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 rounded-2xl mb-4 shadow-2xl shadow-blue-500/50 transform hover:scale-105 transition-transform">
              <span className="text-4xl font-black text-white">IA</span>
            </div>
            <h1 className="text-3xl font-black text-black dark:text-white uppercase tracking-wider mb-2">
              Interview <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-500">Assist</span>
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">
              {isLogin ? '🔐 Sign in to your account' : '✨ Create your account'}
            </p>
          </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-xl backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <span className="text-red-600 dark:text-red-400 text-xl">⚠️</span>
              <p className="text-red-700 dark:text-red-300 text-sm font-medium flex-1">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username or Email */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Username or Email
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              className="w-full bg-slate-100 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-600/50 rounded-xl px-4 py-3 text-black dark:text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
              placeholder="Enter username or email"
            />
          </div>

          {/* Name (Signup only) */}
          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full bg-slate-100 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-600/50 rounded-xl px-4 py-3 text-black dark:text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder="Enter your full name"
              />
            </div>
          )}

          {/* Email (Signup only) */}
          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="w-full bg-slate-100 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-600/50 rounded-xl px-4 py-3 text-black dark:text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder="Enter your email"
              />
            </div>
          )}

          {/* Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                className="w-full bg-slate-100 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-300 dark:border-slate-600/50 rounded-xl px-4 py-3 pr-12 text-black dark:text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors p-1"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                )}
              </button>
            </div>

            {/* Password Strength Bar (Signup only) */}
            {!isLogin && (
              <div className="mt-3 space-y-2">
                {/* Strength Bar */}
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                        strength >= level
                          ? level <= 2
                            ? 'bg-red-500'
                            : level === 3
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                          : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                  ))}
                </div>

                {/* Validation Rules */}
                <div className="space-y-1">
                  <div className={`flex items-center gap-2 text-xs ${rules.length ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    <span className="text-sm">{rules.length ? '✓' : '○'}</span>
                    <span>At least 8 characters</span>
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${rules.uppercase ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    <span className="text-sm">{rules.uppercase ? '✓' : '○'}</span>
                    <span>At least 1 uppercase letter</span>
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${rules.lowercase ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    <span className="text-sm">{rules.lowercase ? '✓' : '○'}</span>
                    <span>At least 1 lowercase letter</span>
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${rules.number ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    <span className="text-sm">{rules.number ? '✓' : '○'}</span>
                    <span>At least 1 number</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password (Signup only) */}
          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-600/50 rounded-xl px-4 py-3 pr-12 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-500"
                  placeholder="Confirm your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors p-1"
                >
                  {showConfirmPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white font-bold py-3.5 rounded-xl text-sm uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] transform"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : isLogin ? (
              '🔓 Sign In'
            ) : (
              '✨ Create Account'
            )}
          </button>
        </form>

        {/* Toggle Login/Signup */}
        <div className="mt-8 text-center space-y-2">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setShowResendForm(false);
              setFormData({
                username: '',
                name: '',
                email: '',
                password: '',
                confirmPassword: ''
              });
            }}
            className="text-sm text-slate-600 dark:text-slate-400 hover:text-black dark:hover:text-white transition-colors"
          >
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 font-bold hover:from-blue-700 hover:to-indigo-700 dark:hover:from-blue-300 dark:hover:to-indigo-300">
              {isLogin ? 'Sign Up' : 'Sign In'}
            </span>
          </button>

          {/* Resend Verification Link */}
          {isLogin && (
            <div>
              <button
                onClick={() => {
                  setShowResendForm(!showResendForm);
                  setError('');
                  setResendMessage('');
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Didn't receive verification email?
              </button>
            </div>
          )}
        </div>

        {/* Resend Verification Form */}
        {showResendForm && (
          <div className="mt-4 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-300 dark:border-slate-700">
            <h3 className="text-sm font-bold text-black dark:text-white mb-2">Resend Verification Email</h3>
            <div className="space-y-3">
              <input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-black dark:text-white placeholder:text-slate-400"
              />
              <button
                onClick={async () => {
                  if (!resendEmail) {
                    setResendMessage('Please enter your email');
                    return;
                  }
                  setResendLoading(true);
                  setResendMessage('');
                  try {
                    const result = await authClient.resendVerification(resendEmail);
                    if (result.success) {
                      setResendMessage('Verification email sent! Check your inbox.');
                    } else {
                      setResendMessage(result.message);
                    }
                  } catch (error: any) {
                    setResendMessage('Failed to resend: ' + error.message);
                  } finally {
                    setResendLoading(false);
                  }
                }}
                disabled={resendLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {resendLoading ? 'Sending...' : 'Resend Verification Email'}
              </button>
              {resendMessage && (
                <p className={`text-xs ${resendMessage.includes('sent') ? 'text-green-600' : 'text-red-600'}`}>
                  {resendMessage}
                </p>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
