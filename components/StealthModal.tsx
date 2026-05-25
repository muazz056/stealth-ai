import React, { useEffect } from 'react';

interface StealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  icon?: string;
  variant?: 'info' | 'success' | 'error' | 'warning';
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

const variantStyles = {
  info: {
    border: 'border-blue-500/60 dark:border-blue-500/60',
    iconColor: 'text-blue-400 dark:text-blue-400',
    gradient: 'from-blue-600 to-indigo-600',
    titleColor: 'text-blue-600 dark:text-blue-300',
    shadowColor: 'shadow-blue-500/20'
  },
  success: {
    border: 'border-emerald-500/60 dark:border-emerald-500/60',
    iconColor: 'text-emerald-400 dark:text-emerald-400',
    gradient: 'from-emerald-600 to-green-600',
    titleColor: 'text-emerald-600 dark:text-emerald-300',
    shadowColor: 'shadow-emerald-500/20'
  },
  error: {
    border: 'border-red-500/60 dark:border-red-500/60',
    iconColor: 'text-red-400 dark:text-red-400',
    gradient: 'from-red-600 to-rose-600',
    titleColor: 'text-red-600 dark:text-red-300',
    shadowColor: 'shadow-red-500/20'
  },
  warning: {
    border: 'border-amber-500/60 dark:border-amber-500/60',
    iconColor: 'text-amber-400 dark:text-amber-400',
    gradient: 'from-amber-600 to-orange-600',
    titleColor: 'text-amber-600 dark:text-amber-300',
    shadowColor: 'shadow-amber-500/20'
  }
};

const StealthModal: React.FC<StealthModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  icon,
  variant = 'info',
  primaryAction,
  secondaryAction
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const styles = variantStyles[variant];

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-md bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border ${styles.border} rounded-2xl p-6 sm:p-8 shadow-2xl ${styles.shadowColor} transform transition-all duration-200 scale-100`}
        onClick={(e) => e.stopPropagation()}
      >
        {icon && (
          <div className="flex justify-center mb-5">
            <span className={`text-5xl ${styles.iconColor}`}>{icon}</span>
          </div>
        )}
        {title && (
          <h3 className={`text-2xl font-bold ${styles.titleColor} text-center mb-4`}>
            {title}
          </h3>
        )}
        <div className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-7 text-center max-h-[50vh] overflow-y-auto">
          {children}
        </div>
        <div className="flex flex-col gap-3">
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className={`w-full px-6 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 bg-gradient-to-r ${styles.gradient} hover:brightness-110 text-white shadow-lg hover:scale-[1.02] active:scale-[0.98]`}
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="w-full px-6 py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-600 hover:border-blue-500/50 text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white hover:scale-[1.02] active:scale-[0.98]"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StealthModal;
