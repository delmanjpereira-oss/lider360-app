'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'loading';

type Toast = {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
};

type ToastContextType = {
  show: (toast: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
  loading: (title: string, description?: string) => number;
  update: (id: number, toast: Partial<Omit<Toast, 'id'>>) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    const newToast: Toast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);
    const duration = toast.duration ?? (toast.type === 'loading' ? 0 : 4000);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const update = useCallback((id: number, toast: Partial<Omit<Toast, 'id'>>) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...toast } : t)));
    if (toast.type && toast.type !== 'loading') {
      setTimeout(() => dismiss(id), toast.duration ?? 4000);
    }
  }, [dismiss]);

  const success = useCallback((title: string, description?: string) =>
    show({ type: 'success', title, description }), [show]);
  const error = useCallback((title: string, description?: string) =>
    show({ type: 'error', title, description }), [show]);
  const info = useCallback((title: string, description?: string) =>
    show({ type: 'info', title, description }), [show]);
  const loading = useCallback((title: string, description?: string) =>
    show({ type: 'loading', title, description, duration: 0 }), [show]);

  return (
    <ToastContext.Provider value={{ show, dismiss, success, error, info, loading, update }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  function handleClose() {
    setLeaving(true);
    setTimeout(onDismiss, 200);
  }

  const styles = {
    success: { bg: 'bg-gradient-to-br from-green-500/20 to-emerald-600/10', border: 'border-green-500/50', icon: '✅', iconBg: 'bg-green-500/20', titleColor: 'text-green-300', shadow: 'shadow-green-500/20' },
    error: { bg: 'bg-gradient-to-br from-red-500/20 to-rose-600/10', border: 'border-red-500/50', icon: '❌', iconBg: 'bg-red-500/20', titleColor: 'text-red-300', shadow: 'shadow-red-500/20' },
    info: { bg: 'bg-gradient-to-br from-blue-500/20 to-cyan-600/10', border: 'border-blue-500/50', icon: 'ℹ️', iconBg: 'bg-blue-500/20', titleColor: 'text-blue-300', shadow: 'shadow-blue-500/20' },
    loading: { bg: 'bg-gradient-to-br from-purple-500/20 to-violet-600/10', border: 'border-purple-500/50', icon: '⏳', iconBg: 'bg-purple-500/20', titleColor: 'text-purple-300', shadow: 'shadow-purple-500/20' },
  };

  const s = styles[toast.type];

  return (
    <div
      onClick={handleClose}
      className={`pointer-events-auto cursor-pointer ${s.bg} ${s.border} border-2 rounded-2xl backdrop-blur-md shadow-2xl ${s.shadow} min-w-[320px] max-w-md p-4 transition-all duration-300 ease-out ${visible && !leaving ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-8 opacity-0 scale-95'}`}
      style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
    >
      <div className="flex items-start gap-3">
        <div className={`${s.iconBg} w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0`}>
          {toast.type === 'loading' ? <span className="inline-block animate-spin">{s.icon}</span> : <span>{s.icon}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`${s.titleColor} font-bold text-sm leading-tight`}>{toast.title}</p>
          {toast.description && <p className="text-gray-300 text-xs mt-1 leading-snug">{toast.description}</p>}
        </div>
      </div>
    </div>
  );
}
