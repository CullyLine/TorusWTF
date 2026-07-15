'use client';

import { useEffect, useRef, useState, type JSX, type MutableRefObject } from 'react';
import {
  CONTROL_DEFS_BY_KEY,
  MOD_CURVES,
  MOD_SOURCES,
  modTargetsForPreset,
  shapeModValue,
  type AudioMetrics,
  type ControlKey,
  type ModCurve,
  type ModRouting,
  type ModSourceKey,
  type VisualizerId,
} from '@torus/visualizers';
import { createModRouting } from '@/lib/modMatrix';

/**
 * Modulate panel — the modulation matrix UI.
 *
 * Two halves:
 *  - LIVE SIGNALS: every audio signal the engine computes, as live meters.
 *    This is the "what is the music doing right now?" X-ray — bands,
 *    envelopes, drums, vocals/lead heuristics, song structure.
 *  - ROUTINGS: rows that wire a signal into any control of the current
 *    preset (plus the global look controls), with amount / response /
 *    release shaping. The math runs per-frame inside the canvas
 *    (`ModulationProvider`); this panel only edits the routing list.
 *
 * Meters bypass React: a rAF loop writes transform styles straight to the
 * bar elements from `metricsRef` — zero re-renders at 60fps.
 */

interface ModulationPanelProps {
  routings: ModRouting[];
  onChange: (next: ModRouting[]) => void;
  activePreset: VisualizerId;
  /** Freshest metrics, mirrored out of the canvas every frame. */
  metricsRef: MutableRefObject<AudioMetrics | null>;
}

const selectClass =
  'rounded-lg border border-torus-border bg-torus-bg px-2 py-1 text-xs text-torus-fg';
const pillButtonClass =
  'rounded-full border border-torus-border px-2 py-1 text-[10px] text-torus-fg-dim hover:border-torus-mid/40';

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function ModulationPanel({
  routings,
  onChange,
  activePreset,
  metricsRef,
}: ModulationPanelProps): JSX.Element {
  const [signalsOpen, setSignalsOpen] = useState(false);
  const targets = modTargetsForPreset(activePreset);

  // --- Live meters (rAF → direct style writes, no React state) ---
  const meterRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const m = metricsRef.current;
      if (!m) return;
      for (const [key, el] of meterRefs.current) {
        // Meter ids: "src:<source>" for the signal list, "row:<id>:<source>"
        // for the per-routing meter (shaped through that row's curve).
        let v = 0;
        if (key.startsWith('src:')) {
          v = clamp01((m[key.slice(4) as ModSourceKey] as number) ?? 0);
        } else {
          const [, , source, curve] = key.split(':');
          v = shapeModValue(
            clamp01((m[source as ModSourceKey] as number) ?? 0),
            curve as ModCurve,
          );
        }
        el.style.transform = `scaleX(${v})`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [metricsRef]);

  const setMeterRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) meterRefs.current.set(id, el);
    else meterRefs.current.delete(id);
  };

  const updateRouting = (id: string, patch: Partial<ModRouting>) => {
    onChange(routings.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRouting = (id: string) => {
    onChange(routings.filter((r) => r.id !== id));
  };

  const meterBar = (id: string, accent = 'bg-torus-mid') => (
    <div className="h-1 w-full overflow-hidden rounded-full bg-torus-border/60">
      <div
        ref={setMeterRef(id)}
        className={`h-full w-full origin-left ${accent}`}
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  );

  return (
    <section className="rounded-xl border border-torus-border bg-torus-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-torus-fg-dim">Modulate</h2>
      <p className="mb-3 text-[10px] text-torus-fg-faint">
        Wire anything the music does into any control — vocals opening the glow, drums driving
        turbulence, quiet passages pulling the camera close. Positive amounts push a control up,
        negative pull it down.
      </p>

      {/* Live signal X-ray */}
      <details
        open={signalsOpen}
        onToggle={(e) => setSignalsOpen((e.target as HTMLDetailsElement).open)}
        className="mb-3 rounded-lg border border-torus-border bg-torus-bg p-2"
      >
        <summary className="cursor-pointer select-none list-none text-xs text-torus-fg-dim hover:text-torus-fg [&::-webkit-details-marker]:hidden">
          Live signals
          <span
            aria-hidden
            className="float-right text-torus-fg-faint transition-transform [[open]>summary>&]:rotate-90"
          >
            ›
          </span>
        </summary>
        {signalsOpen ? (
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {MOD_SOURCES.map((src) => (
              <div key={src.key} title={src.hint} className="cursor-help">
                <div className="mb-0.5 flex items-baseline justify-between">
                  <span className="text-[10px] text-torus-fg-dim">{src.label}</span>
                </div>
                {meterBar(`src:${src.key}`)}
              </div>
            ))}
          </div>
        ) : null}
      </details>

      {/* Routing rows */}
      <div className="space-y-2">
        {routings.map((r) => (
          <div key={r.id} className="space-y-2 rounded-lg border border-torus-border bg-torus-bg p-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => updateRouting(r.id, { enabled: e.target.checked })}
                className="accent-torus-mid"
                aria-label="Enabled"
              />
              <select
                value={r.source}
                onChange={(e) => updateRouting(r.id, { source: e.target.value as ModSourceKey })}
                className={selectClass}
                aria-label="Signal"
              >
                {MOD_SOURCES.map((src) => (
                  <option key={src.key} value={src.key} title={src.hint}>
                    {src.label}
                  </option>
                ))}
              </select>
              <span className="text-torus-fg-faint">→</span>
              <select
                value={targets.includes(r.target) ? r.target : ''}
                onChange={(e) => updateRouting(r.id, { target: e.target.value as ControlKey })}
                className={selectClass}
                aria-label="Control"
              >
                {/* A routing saved on another preset can point at a control
                    this preset doesn't have — keep it listed (grayed by the
                    empty option) instead of silently rewriting it. */}
                {!targets.includes(r.target) ? (
                  <option value="" disabled>
                    {CONTROL_DEFS_BY_KEY[r.target]?.label ?? r.target} (other preset)
                  </option>
                ) : null}
                {targets.map((key) => (
                  <option key={key} value={key}>
                    {CONTROL_DEFS_BY_KEY[key].label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeRouting(r.id)}
                className="ml-auto text-torus-fg-faint hover:text-torus-bass"
                aria-label="Delete modulation"
              >
                ✕
              </button>
            </div>

            {/* This row's signal, after its response curve — what actually drives the control. */}
            {meterBar(`row:${r.id}:${r.source}:${r.curve}`, r.enabled ? 'bg-torus-mid' : 'bg-torus-border')}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] text-torus-fg-dim">
              <label className="flex min-w-[130px] flex-1 items-center gap-2">
                <span className="w-12 shrink-0">
                  Amount
                  <span className="block tabular-nums text-torus-fg-faint">
                    {r.amount >= 0 ? '+' : ''}
                    {Math.round(r.amount * 100)}%
                  </span>
                </span>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={r.amount}
                  onChange={(e) => updateRouting(r.id, { amount: Number(e.target.value) })}
                  aria-label="Amount"
                  className="w-full accent-torus-mid"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span>Response</span>
                <select
                  value={r.curve}
                  onChange={(e) => updateRouting(r.id, { curve: e.target.value as ModCurve })}
                  className={selectClass}
                  aria-label="Response curve"
                >
                  {MOD_CURVES.map((c) => (
                    <option key={c.key} value={c.key} title={c.hint}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[120px] flex-1 items-center gap-2">
                <span className="w-12 shrink-0">
                  Release
                  <span className="block tabular-nums text-torus-fg-faint">{r.glide.toFixed(2)}s</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.05}
                  value={r.glide}
                  onChange={(e) => updateRouting(r.id, { glide: Number(e.target.value) })}
                  aria-label="Release time"
                  className="w-full accent-torus-mid"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      {routings.length === 0 ? (
        <p className="mb-2 text-[10px] text-torus-fg-faint">
          No modulations yet. Try Vocals → Glow, or Song peak → Size.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => onChange([...routings, createModRouting()])}
        className={`${pillButtonClass} mt-2`}
      >
        Add modulation
      </button>
    </section>
  );
}
