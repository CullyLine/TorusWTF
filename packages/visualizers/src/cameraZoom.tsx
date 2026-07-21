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

/**
 * Short SmoothDamp time for wheel/pinch framing pulls — fluid ease with no
 * stair-steps, settles cleanly so quiet idle holds still.
 */
const ZOOM_SPRING_SMOOTH = 0.11;

/** Snap threshold so critically-damped ease doesn't micro-crawl forever. */
const ZOOM_SETTLE_EPS = 1e-4;

interface ZoomSpring {
  value: number;
  velocity: number;
  initialized: boolean;
}

/**
 * Unity-style SmoothDamp (critically damped) for camera distance.
 * First call snaps to the target so mount doesn't ease in from zero.
 * Near-zero error + velocity snaps so idle framing holds still.
 */
function smoothDampZoom(
  state: ZoomSpring,
  target: number,
  dt: number,
  smoothTime: number,
): number {
  if (!state.initialized) {
    state.value = target;
    state.velocity = 0;
    state.initialized = true;
    return target;
  }
  const change = state.value - target;
  if (Math.abs(change) < ZOOM_SETTLE_EPS && Math.abs(state.velocity) < ZOOM_SETTLE_EPS) {
    state.value = target;
    state.velocity = 0;
    return target;
  }
  const st = Math.max(1e-4, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const temp = (state.velocity + omega * change) * dt;
  state.velocity = (state.velocity - omega * temp) * exp;
  state.value = target + (change + temp) * exp;
  return state.value;
}

interface CameraZoomContextValue {
  /** Smoothed distance — SceneRig / presets read this each frame. */
  distanceRef: RefObject<number>;
  /** Gesture target — wheel/pinch write here; SmoothDamp eases toward it. */
  targetDistanceRef: RefObject<number>;
  setDistance: (distance: number) => void;
  nudge: (delta: number) => void;
  reset: () => void;
  /** Advance SmoothDamp toward the target (call once per render frame). */
  advance: (dt: number) => void;
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
  const initial = defaultDistance(embedded);
  const distanceRef = useRef<number>(initial);
  const targetDistanceRef = useRef<number>(initial);
  const springRef = useRef<ZoomSpring>({
    value: initial,
    velocity: 0,
    initialized: true,
  });

  const snapTo = useCallback(
    (distance: number) => {
      const clamped = clampDistance(distance, embedded);
      targetDistanceRef.current = clamped;
      distanceRef.current = clamped;
      springRef.current.value = clamped;
      springRef.current.velocity = 0;
      springRef.current.initialized = true;
    },
    [embedded],
  );

  const setDistance = useCallback(
    (distance: number) => {
      targetDistanceRef.current = clampDistance(distance, embedded);
    },
    [embedded],
  );

  const nudge = useCallback(
    (delta: number) => {
      targetDistanceRef.current = clampDistance(targetDistanceRef.current + delta, embedded);
    },
    [embedded],
  );

  const reset = useCallback(() => {
    snapTo(defaultDistance(embedded));
  }, [embedded, snapTo]);

  const advance = useCallback((dt: number) => {
    const next = smoothDampZoom(
      springRef.current,
      targetDistanceRef.current,
      Math.min(dt, 0.1),
      ZOOM_SPRING_SMOOTH,
    );
    distanceRef.current = next;
  }, []);

  useEffect(() => {
    snapTo(defaultDistance(embedded));
  }, [embedded, snapTo]);

  const value = useMemo(
    () => ({
      distanceRef,
      targetDistanceRef,
      setDistance,
      nudge,
      reset,
      advance,
    }),
    [setDistance, nudge, reset, advance],
  );

  return <CameraZoomContext.Provider value={value}>{children}</CameraZoomContext.Provider>;
}

export function useCameraZoom() {
  const ctx = useContext(CameraZoomContext);
  if (!ctx) throw new Error('useCameraZoom must be used within CameraZoomProvider');
  return ctx;
}

/** Read smoothed zoom distance inside R3F useFrame (no React re-render). */
export function useCameraZoomDistanceRef() {
  return useContext(CameraZoomContext)?.distanceRef ?? null;
}

/** Advance zoom SmoothDamp once per frame (no-op outside CameraZoomProvider). */
export function useAdvanceCameraZoom(): ((dt: number) => void) | null {
  return useContext(CameraZoomContext)?.advance ?? null;
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
 * Gestures update the zoom *target*; SmoothDamp eases the live distance.
 */
export function VisualizerZoomSurface({ children, onInteract }: VisualizerZoomSurfaceProps) {
  const { targetDistanceRef, setDistance, nudge } = useCameraZoom();
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
        // Scale from the gesture target so pinch tracks continuously while
        // the smoothed distance eases — never compound off the lagging value.
        setDistance(targetDistanceRef.current / scale);
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
  }, [targetDistanceRef, nudge, setDistance, onInteract]);

  return (
    <div ref={rootRef} style={{ width: '100%', height: '100%', touchAction: 'none' }}>
      {children}
    </div>
  );
}
