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
  openWithFile: (file: File) => void;
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
const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'flac',
  'aiff',
  'aif',
  'ogg',
  'opus',
  'm4a',
  'webm',
]);

function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext ? AUDIO_EXTENSIONS.has(ext) : false;
}

export interface UploadAuthConfig {
  sessionUser: { id: string; handle: string } | null;
  refreshSession: () => Promise<unknown>;
  discordAuth: boolean;
  openDiscordSignIn: () => void;
}

export function UploadDialogProvider({
  children,
  auth,
}: {
  children: ReactNode;
  auth?: UploadAuthConfig;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const openWithFile = useCallback((file: File) => {
    setPendingFile(file);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    setPendingFile(null);
    setIsOpen(false);
  }, []);

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

  useEffect(() => {
    function onDragOver(e: DragEvent) {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
    }

    function onDrop(e: DragEvent) {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || !isAudioFile(file)) return;
      openWithFile(file);
    }

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [openWithFile]);

  const api = useMemo(
    () => ({ open, openWithFile, close, isOpen }),
    [open, openWithFile, close, isOpen],
  );

  return (
    <UploadCtx.Provider value={api}>
      {children}
      <UploadDialog open={isOpen} onClose={close} pendingFile={pendingFile} auth={auth} />
    </UploadCtx.Provider>
  );
}
