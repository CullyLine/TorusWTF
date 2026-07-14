'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

// The default framing is intentionally close — the scene should own the
// frame, not float in the middle of it. Wheel/pinch pulls back when the
// user wants an establishing view.
const DEFAULT_DISTANCE = { embedded: 2.8, fullscreen: 3.1 } as const;
const LIMITS = {
  embedded: { min: 1.4, max: 7.5 },
  fullscreen: { min: 1.6, max: 10 },
} as const;

const WHEEL_SENSITIVITY = 0.0045;

interface CameraZoomContextValue {
  distanceRef: RefObject<number>;
  setDistance: (distance: number) => void;
  nudge: (delta: number) => void;
  reset: () => void;
}

const CameraZoomContext = createContext<CameraZoomContextValue | null>(null);

function defaultDistance(embedded: boolean) {
  return embedded ? DEFAULT_DISTANCE.embedded : DEFAULT_DISTANCE.fullscreen;
}

function clampDistance(distance: number, embedded: boolean) {
  const { min, max } = embedded ? LIMITS.embedded : LIMITS.fullscreen;
  return Math.max(min, Math.min(max, distance));
}

export function CameraZoomProvider({
  embedded,
  children,
}: {
  embedded: boolean;
  children: ReactNode;
}) {
  const distanceRef = useRef<number>(defaultDistance(embedded));

  const setDistance = useCallback(
    (distance: number) => {
      distanceRef.current = clampDistance(distance, embedded);
    },
    [embedded],
  );

  const nudge = useCallback(
    (delta: number) => {
      distanceRef.current = clampDistance(distanceRef.current + delta, embedded);
    },
    [embedded],
  );

  const reset = useCallback(() => {
    distanceRef.current = defaultDistance(embedded);
  }, [embedded]);

  useEffect(() => {
    distanceRef.current = defaultDistance(embedded);
  }, [embedded]);

  const value = useMemo(
    () => ({ distanceRef, setDistance, nudge, reset }),
    [setDistance, nudge, reset],
  );

  return <CameraZoomContext.Provider value={value}>{children}</CameraZoomContext.Provider>;
}

export function useCameraZoom() {
  const ctx = useContext(CameraZoomContext);
  if (!ctx) throw new Error('useCameraZoom must be used within CameraZoomProvider');
  return ctx;
}

/** Read zoom distance inside R3F useFrame (no React re-render). */
export function useCameraZoomDistanceRef() {
  return useContext(CameraZoomContext)?.distanceRef ?? null;
}

function touchSpan(touches: TouchList) {
  if (touches.length < 2) return 0;
  const a = touches[0]!;
  const b = touches[1]!;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

interface VisualizerZoomSurfaceProps {
  children: ReactNode;
  /** Fired on zoom gestures (e.g. reveal overlay UI). */
  onInteract?: () => void;
}

/**
 * Captures wheel + pinch on the visualizer viewport and adjusts camera distance.
 * Uses non-passive listeners so wheel does not scroll the page.
 */
export function VisualizerZoomSurface({ children, onInteract }: VisualizerZoomSurfaceProps) {
  const { distanceRef, setDistance, nudge } = useCameraZoom();
  const rootRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ lastSpan: number } | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onInteract?.();
      nudge(e.deltaY * WHEEL_SENSITIVITY);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = { lastSpan: touchSpan(e.touches) };
        onInteract?.();
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const span = touchSpan(e.touches);
      if (span <= 0) return;
      const scale = span / pinchRef.current.lastSpan;
      if (Math.abs(scale - 1) > 0.002) {
        setDistance(distanceRef.current / scale);
        pinchRef.current.lastSpan = span;
      }
    };

    const endPinch = () => {
      pinchRef.current = null;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', endPinch);
    el.addEventListener('touchcancel', endPinch);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', endPinch);
      el.removeEventListener('touchcancel', endPinch);
    };
  }, [distanceRef, nudge, setDistance, onInteract]);

  return (
    <div ref={rootRef} style={{ width: '100%', height: '100%', touchAction: 'none' }}>
      {children}
    </div>
  );
}
