'use client';

import { useState, useEffect } from 'react';

type ApolloMood = 'info' | 'success' | 'warning' | 'alert';

type ApolloBadgeProps = {
  mood?: ApolloMood;
  message: string;
  detail?: string;
  action?: { label: string; href?: string; onClick?: () => void };
};

export default function ApolloBadge({ mood = 'info', message, detail, action }: ApolloBadgeProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const styles = {
    info: { bg: 'from-cyan-500/10 to-cyan-600/5', border: 'border-cyan-500/30', accent: 'text-cyan-300', icon: 'bg-cyan-500' },
    success: { bg: 'from-emerald-500/10 to-emerald-600/5', border: 'border-emerald-500/30', accent: 'text-emerald-300', icon: 'bg-emerald-500' },
    warning: { bg: 'from-amber-500/10 to-amber-600/5', border: 'border-amber-500/30', accent: 'text-amber-300', icon: 'bg-amber-500' },
    alert: { bg: 'from-rose-500/10 to-rose-600/5', border: 'border-rose-500/30', accent: 'text-rose-300', icon: 'bg-rose-500' },
  };

  const s = styles[mood];

  return (
    <div
      className={`
        bg-gradient-to-br ${s.bg} ${s.border} border rounded-xl p-3 
        flex items-center gap-3 mb-6
        transition-all duration-500 ease-out
        ${visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'}
      `}
    >
      {/* Apollo avatar minimalista - estilo bot/IA */}
      <div className={`${s.icon} w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 relative`}>
        <span className="text-white text-xs font-black tracking-tighter">AI</span>
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full ring-2 ring-[#0a0a0a] animate-pulse" />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${s.accent}`}>{message}</p>
        {detail && <p className="text-xs text-gray-400 mt-0.5">{detail}</p>}
      </div>

      {action && (
        action.href ? (
          <a 
            href={action.href}
            className={`text-xs font-bold ${s.accent} hover:underline whitespace-nowrap flex items-center gap-1`}
          >
            {action.label} →
          </a>
        ) : (
          <button 
            onClick={action.onClick}
            className={`text-xs font-bold ${s.accent} hover:underline whitespace-nowrap flex items-center gap-1`}
          >
            {action.label} →
          </button>
        )
      )}
    </div>
  );
}
