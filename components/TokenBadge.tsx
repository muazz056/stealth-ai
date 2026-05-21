import React from 'react';

interface TokenBadgeProps {
  user?: any;
  isMobile?: boolean;
  onUpgrade?: () => void;
}

const TokenBadge: React.FC<TokenBadgeProps> = ({ user, isMobile = false, onUpgrade }) => {
  if (!user) return null;

  const tokens = user.tokens ?? 0;
  const plan = user.plan || 'Free';
  const isAdmin = user.role === 'admin' || user.role === 'super-admin';
  const hasUnlimited = isAdmin || tokens === -1;
  const isPaid = ['Pro', 'Premium', 'Lifetime'].includes(plan) || hasUnlimited;

  const getTokenColor = () => {
    if (hasUnlimited) return 'text-emerald-400';
    if (tokens >= 5) return 'text-emerald-400';
    if (tokens >= 2) return 'text-amber-400';
    return 'text-red-400';
  };

  if (isMobile) {
    return (
      <div className={`mx-4 mb-2 flex items-center justify-between gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm transition-all ${
        isPaid
          ? 'bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border-emerald-500/20 dark:border-blue-500/20'
          : 'bg-gradient-to-r from-slate-200 to-slate-100 dark:from-slate-800/60 dark:to-slate-800/40 border-slate-300 dark:border-slate-700/50'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${
            hasUnlimited
              ? 'bg-emerald-500/20'
              : tokens <= 1
                ? 'bg-red-500/20'
                : 'bg-blue-500/20'
          }`}>
            {hasUnlimited ? '∞' : '🪙'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-base font-bold ${getTokenColor()}`}>
                {hasUnlimited ? 'Unlimited' : tokens}
              </span>
              {!hasUnlimited && (
                <span className="text-xs text-slate-500 dark:text-slate-400">Credits</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                isPaid
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-slate-400/15 text-slate-500 dark:text-slate-400'
              }`}>{plan}</span>
            </div>
          </div>
        </div>
        {!isPaid && (
          <button
            onClick={onUpgrade}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-md hover:shadow-blue-500/25 transition-all shrink-0"
          >
            UPGRADE
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border backdrop-blur-sm transition-all ${
      isPaid
        ? 'bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border-emerald-500/20 dark:border-blue-500/20'
        : 'bg-slate-200 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700/50'
    }`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${
        hasUnlimited
          ? 'bg-emerald-500/20'
          : tokens <= 1
            ? 'bg-red-500/20'
            : 'bg-blue-500/20'
      }`}>
        {hasUnlimited ? (
          <span className="text-emerald-400 font-bold">∞</span>
        ) : (
          <span>🪙</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`text-sm font-bold ${getTokenColor()}`}>
          {hasUnlimited ? 'Unlimited' : tokens}
        </span>
        {!hasUnlimited && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Credits</span>
        )}
      </div>
      {!isPaid && tokens <= 3 && (
        <button
          onClick={onUpgrade}
          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-md hover:shadow-blue-500/25 transition-all"
        >
          UPGRADE
        </button>
      )}
      {!hasUnlimited && tokens > 3 && (
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
          isPaid
            ? 'bg-emerald-500/15 text-emerald-500'
            : 'bg-slate-400/15 text-slate-500 dark:text-slate-400'
        }`}>{plan}</span>
      )}
    </div>
  );
};

export default TokenBadge;
