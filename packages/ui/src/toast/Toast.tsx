'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface ToastItem {
  id: string;
  message: string;
  level: 'info' | 'success' | 'error';
}

interface ToastApi {
  show: (message: string, level?: ToastItem['level']) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, level: ToastItem['level'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((current) => [...current, { id, message, level }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4_000);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 9999,
          pointerEvents: 'none',
        }}
        aria-live="polite"
      >
        {items.map((t) => (
          <Toast key={t.id} message={t.message} level={t.level} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

interface ToastProps {
  message: string;
  level?: ToastItem['level'];
}

export function Toast({ message, level = 'info' }: ToastProps) {
  const accent =
    level === 'success'
      ? 'var(--color-torus-mid)'
      : level === 'error'
        ? 'var(--color-torus-bass)'
        : 'var(--color-torus-fg-dim)';
  return (
    <div
      role="status"
      style={{
        padding: '10px 16px',
        borderRadius: 999,
        background: 'rgba(10,11,30,0.92)',
        color: 'var(--color-torus-fg)',
        border: `1px solid ${accent}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        fontSize: 13,
        backdropFilter: 'blur(8px)',
      }}
    >
      {message}
    </div>
  );
}
