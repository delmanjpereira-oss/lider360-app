'use client';

import { useEffect, useState, useCallback } from 'react';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

declare global {
  interface Window {
    showConfirm: (options: ConfirmOptions) => Promise<boolean>;
  }
}

type ConfirmState = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export default function ConfirmModal() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    window.showConfirm = (options: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        setState({ ...options, resolve });
        requestAnimationFrame(() => setVisible(true));
      });
    };
  }, []);

  const close = useCallback(
    (value: boolean) => {
      if (!state) return;
      setVisible(false);
      setTimeout(() => {
        state.resolve(value);
        setState(null);
      }, 200);
    },
    [state]
  );

  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, close]);

  if (!state) return null;

  return (
    <div
      className={`fixed inset-0 z-[9998] flex items-center justify-center p-4 transition-all duration-200 ${
        visible ? 'bg-black/70 backdrop-blur-sm' : 'bg-black/0'
      }`}
      onClick={() => close(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`
          bg-gradient-to-br from-[#1f1f1f] to-[#161616]
          border-2 border-[#2a2a2a]
          rounded-3xl p-6 max-w-md w-full
          transition-all duration-200
          ${visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-6 opacity-0 scale-95'}
        `}
        style={{
          boxShadow:
            '0 30px 80px -10px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05) inset',
        }}
      >
        <div className="flex items-start gap-4 mb-5">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${
              state.danger
                ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-lg shadow-red-500/30'
                : 'bg-gradient-to-br from-[#FFD700] to-yellow-600 shadow-lg shadow-yellow-500/30'
            }`}
          >
            {state.danger ? '⚠' : '?'}
          </div>
          <div className="flex-1">
            <h3 className="text-white text-lg font-black mb-1">{state.title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{state.message}</p>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={() => close(false)}
            className="px-5 py-2.5 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white font-bold rounded-xl transition-all active:scale-95"
          >
            {state.cancelText || 'Cancelar'}
          </button>
          <button
            onClick={() => close(true)}
            className={`
              px-5 py-2.5 font-bold rounded-xl transition-all active:scale-95
              ${
                state.danger
                  ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-lg shadow-red-500/30'
                  : 'bg-gradient-to-br from-[#FFD700] to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-black shadow-lg shadow-yellow-500/30'
              }
            `}
          >
            {state.confirmText || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
