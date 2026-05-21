'use client';

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
}

export interface PromptOptions {
  message: string;
  placeholder?: string;
  defaultValue?: string;
}

interface ToastMessage {
  id: string;
  kind: 'message';
  message: string;
  variant: ToastVariant;
}

interface PromptMessage {
  id: string;
  kind: 'prompt';
  message: string;
  placeholder?: string;
  defaultValue?: string;
  resolve: (value: string | null) => void;
}

type ToastItem = ToastMessage | PromptMessage;

const MAX_VISIBLE = 3;
const DISMISS_MS = 4_000;

export interface ToastContextValue {
  toast: (opts: ToastOptions | string) => void;
  prompt: (opts: PromptOptions | string) => Promise<string | null>;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: 'border-torus-border-strong bg-torus-mid/15 text-torus-mid',
  success: 'border-torus-mid/50 bg-torus-mid/15 text-torus-mid',
  error: 'border-torus-bass/50 bg-torus-bass/15 text-torus-bass',
};

function normalizeToastOpts(opts: ToastOptions | string): ToastOptions {
  return typeof opts === 'string' ? { message: opts } : opts;
}

function normalizePromptOpts(opts: PromptOptions | string): PromptOptions {
  return typeof opts === 'string' ? { message: opts } : opts;
}

function PromptToast({
  item,
  onDismiss,
}: {
  item: PromptMessage;
  onDismiss: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const finish = (value: string | null) => {
    item.resolve(value);
    onDismiss(item.id);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    finish(inputRef.current?.value ?? null);
  };

  return (
    <div
      role="dialog"
      aria-label={item.message}
      className="pointer-events-auto w-full max-w-sm rounded-lg border border-torus-border-strong bg-torus-bg/95 p-3 shadow-lg backdrop-blur-sm motion-safe:animate-[toast-in_200ms_ease-out]"
    >
      <p className="mb-2 text-sm text-torus-fg">{item.message}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="text"
          defaultValue={item.defaultValue ?? ''}
          placeholder={item.placeholder}
          className="w-full rounded-md border border-torus-border bg-torus-surface px-3 py-2 text-sm text-torus-fg placeholder:text-torus-fg-faint"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => finish(null)}
            className="rounded-md px-3 py-1.5 text-xs text-torus-fg-dim hover:text-torus-fg"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-torus-mid/20 px-3 py-1.5 text-xs text-torus-mid hover:bg-torus-mid/30"
          >
            Confirm
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageToast({ item, onDismiss }: { item: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <div
      role="status"
      className={`pointer-events-auto w-full max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm motion-safe:animate-[toast-in_200ms_ease-out] ${VARIANT_STYLES[item.variant]}`}
    >
      {item.message}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const promptActiveRef = useRef(false);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((opts: ToastOptions | string) => {
    const { message, variant = 'info' } = normalizeToastOpts(opts);
    const id = crypto.randomUUID();
    setItems((current) => {
      const messages = current.filter((t) => t.kind === 'message') as ToastMessage[];
      const prompts = current.filter((t) => t.kind === 'prompt');
      const nextMessages = [...messages, { id, kind: 'message' as const, message, variant }];
      const trimmed =
        nextMessages.length > MAX_VISIBLE ? nextMessages.slice(-MAX_VISIBLE) : nextMessages;
      return [...prompts, ...trimmed];
    });
  }, []);

  const prompt = useCallback((opts: PromptOptions | string) => {
    const normalized = normalizePromptOpts(opts);
    return new Promise<string | null>((resolve) => {
      if (promptActiveRef.current) {
        resolve(null);
        return;
      }
      promptActiveRef.current = true;
      const id = crypto.randomUUID();
      setItems((current) => [
        ...current,
        {
          id,
          kind: 'prompt',
          message: normalized.message,
          placeholder: normalized.placeholder,
          defaultValue: normalized.defaultValue,
          resolve: (value) => {
            promptActiveRef.current = false;
            resolve(value);
          },
        },
      ]);
    });
  }, []);

  const api = useMemo(() => ({ toast, prompt }), [toast, prompt]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col items-end gap-2 p-4"
        aria-live="polite"
      >
        {items.map((item) =>
          item.kind === 'prompt' ? (
            <PromptToast key={item.id} item={item} onDismiss={dismiss} />
          ) : (
            <MessageToast key={item.id} item={item} onDismiss={dismiss} />
          ),
        )}
      </div>
    </ToastContext.Provider>
  );
}
