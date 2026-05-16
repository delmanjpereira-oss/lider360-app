'use client';

import { useEffect, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type Toast = {
  id: number;
  type: ToastType;
  message: string;
};

// Declaração global pra TypeScript reconhecer window.showToast
declare global {
  interface Window {
    showToast: (type: ToastType, message: string) => void;
  }
}

let idCounter = 0;

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    window.showToast = (type: ToastType, message: string) => {
      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onClose={() => remove(toast.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const config: Record<
    ToastType,
    { bg: string; border: string; icon: string; iconBg: string; text: string }
  > = {
    success: {
      bg: 'bg-gradient-to-br from-green-500/20 to-green-600/10',
      border: 'border-green-400/40',
      icon: '✓',
      iconBg: 'bg-green-500',
      text: 'text-green-300',
    },
    error: {
      bg: 'bg-gradient-to-br from-red-500/20 to-red-600/10',
      border: 'border-red-400/40',
      icon: '✕',
      iconBg: 'bg-red-500',
      text: 'text-red-300',
    },
    info: {
      bg: 'bg-gradient-to-br from-blue-500/20 to-blue-600/10',
      border: 'border-blue-400/40',
      icon: 'i',
      iconBg: 'bg-blue-500',
      text: 'text-blue-300',
    },
    warning: {
      bg: 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/10',
      border: 'border-yellow-400/40',
      icon: '!',
      iconBg: 'bg-yellow-500',
      text: 'text-yellow-300',
    },
  };

  const c = config[toast.type];

  return (
    <div
      className={`
        ${c.bg} ${c.border}
        backdrop-blur-md border-2 rounded-2xl p-4 pr-12 min-w-[300px] max-w-md
        pointer-events-auto shadow-2xl
        transition-all duration-300 ease-out
        ${visible ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-12 opacity-0 scale-95'}
      `}
      style={{
        boxShadow: '0 20px 50px -10px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className={`${c.iconBg} text-white w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-lg`}
        >
          {c.icon}
        </div>
        <div className={`flex-1 ${c.text} text-sm font-medium leading-relaxed pt-0.5`}>
          {toast.message}
        </div>
      </div>
      <button
        onClick={onClose}
        className="absolute top-2.5 right-2.5 text-white/50 hover:text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
      >
        ×
      </button>
    </div>
  );
}
