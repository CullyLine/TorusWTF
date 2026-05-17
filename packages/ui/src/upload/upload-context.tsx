'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { UploadDialog } from './UploadDialog';

interface UploadDialogApi {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const UploadCtx = createContext<UploadDialogApi | null>(null);

export function useUploadDialog(): UploadDialogApi {
  const ctx = useContext(UploadCtx);
  if (!ctx) throw new Error('useUploadDialog must be used inside <UploadDialogProvider>');
  return ctx;
}

/**
 * Mounts the global Upload dialog once and provides the open/close API to the rest of the app.
 * Also wires the 'U' keyboard shortcut to open from anywhere (ignoring inputs).
 */
export function UploadDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'u' && e.key !== 'U') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      setIsOpen(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const api = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);

  return (
    <UploadCtx.Provider value={api}>
      {children}
      <UploadDialog open={isOpen} onClose={close} />
    </UploadCtx.Provider>
  );
}
