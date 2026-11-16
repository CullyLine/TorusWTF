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
import { Button, Hint, Range, Section, cx, inputClass } from '@/components/ui/controls';
import { ChevronIcon, CloseIcon } from '@/components/ui/icons';

/**
 * The modulation matrix editor. It has two parts.
 *
 * Live signals lists every audio signal the engine computes (bands,
 * envelopes, drums, vocal and lead heuristics, song structure) as meters.
 *
 * Routings are rows that connect one signal to one control of the current
 * visualizer, shaped by an amount, a response curve, and a release time. The
 * math runs per frame inside the canvas (`ModulationProvider`). This panel
 * only edits the list.
 *
 * The meters skip React. A requestAnimationFrame loop writes transform styles
 * to the bar elements from `metricsRef`, so they cause no re-renders.
 */

interface ModulationPanelProps {
  routings: ModRouting[];
  onChange: (next: ModRouting[]) => void;
  activePreset: VisualizerId;
  /** Freshest metrics, mirrored out of the canvas every frame. */
  metricsRef: MutableRefObject<AudioMetrics | null>;
}

// Routing rows pack two selects on one line, so they use a tighter input.
const rowSelectClass = cx(inputClass, 'min-w-0 px-2 py-1 text-xs');

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
          v = shapeModValue(clamp01((m[source as ModSourceKey] as number) ?? 0), curve as ModCurve);
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
    <div className="h-1 w-full overflow-hidden rounded-full bg-torus-border-strong">
      <div
        ref={setMeterRef(id)}
        className={`h-full w-full origin-left ${accent}`}
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  );

  return (
    <Section title="Modulation">
      <Hint>
        A modulation connects a signal in the music to a control, so the control moves with it.
        Vocals can open the glow, or drums can drive turbulence. A positive amount pushes the
        control up and a negative amount pulls it down.
      </Hint>

      {/* Every signal the engine computes, as live meters. */}
      <div className="rounded-md border border-torus-border bg-torus-bg p-2">
        <button
          type="button"
          aria-expanded={signalsOpen}
          onClick={() => setSignalsOpen((open) => !open)}
          className="flex w-full items-center gap-2 text-left text-xs text-torus-fg-dim hover:text-torus-fg"
        >
          <ChevronIcon
            className={cx(
              'shrink-0 text-torus-fg-faint transition-transform',
              signalsOpen && 'rotate-90',
            )}
          />
          Live signals
        </button>
        {signalsOpen ? (
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {MOD_SOURCES.map((src) => (
              <div key={src.key} title={src.hint} className="cursor-help">
                <span className="mb-0.5 block text-[11px] text-torus-fg-dim">{src.label}</span>
                {meterBar(`src:${src.key}`)}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Routing rows */}
      <div className="space-y-2">
        {routings.map((r) => (
          <div
            key={r.id}
            className="space-y-2 rounded-md border border-torus-border bg-torus-bg p-2"
          >
            <div className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => updateRouting(r.id, { enabled: e.target.checked })}
                className="h-4 w-4 shrink-0 accent-torus-mid"
                aria-label="Enabled"
              />
              <select
                value={r.source}
                onChange={(e) => updateRouting(r.id, { source: e.target.value as ModSourceKey })}
                className={cx(rowSelectClass, 'flex-1')}
                aria-label="Signal"
              >
                {MOD_SOURCES.map((src) => (
                  <option key={src.key} value={src.key} title={src.hint}>
                    {src.label}
                  </option>
                ))}
              </select>
              <span className="shrink-0 text-torus-fg-faint">to</span>
              <select
                value={targets.includes(r.target) ? r.target : ''}
                onChange={(e) => updateRouting(r.id, { target: e.target.value as ControlKey })}
                className={cx(rowSelectClass, 'flex-1')}
                aria-label="Control"
              >
                {/* A routing saved on another visualizer can point at a control
                    this one lacks. Keep it listed as a disabled option instead
                    of silently rewriting it. */}
                {!targets.includes(r.target) ? (
                  <option value="" disabled>
                    {CONTROL_DEFS_BY_KEY[r.target]?.label ?? r.target} (other visualizer)
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
                className="shrink-0 rounded p-1 text-torus-fg-faint hover:text-torus-bass"
                aria-label="Delete modulation"
              >
                <CloseIcon width="12" height="12" />
              </button>
            </div>

            {/* This row's signal after its response curve, which is what drives the control. */}
            {meterBar(
              `row:${r.id}:${r.source}:${r.curve}`,
              r.enabled ? 'bg-torus-mid' : 'bg-torus-border',
            )}

            <div className="space-y-2 text-[11px] text-torus-fg-dim">
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0">Amount</span>
                <Range
                  value={r.amount}
                  min={-1}
                  max={1}
                  step={0.05}
                  onChange={(amount) => updateRouting(r.id, { amount })}
                  ariaLabel="Amount"
                />
                <span className="w-10 shrink-0 text-right tabular-nums">
                  {r.amount >= 0 ? '+' : ''}
                  {Math.round(r.amount * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0">Release</span>
                <Range
                  value={r.glide}
                  min={0}
                  max={3}
                  step={0.05}
                  onChange={(glide) => updateRouting(r.id, { glide })}
                  ariaLabel="Release time"
                />
                <span className="w-10 shrink-0 text-right tabular-nums">{r.glide.toFixed(2)}s</span>
              </div>
              <label className="flex items-center gap-2">
                <span className="w-14 shrink-0">Response</span>
                <select
                  value={r.curve}
                  onChange={(e) => updateRouting(r.id, { curve: e.target.value as ModCurve })}
                  className={cx(rowSelectClass, 'flex-1')}
                  aria-label="Response curve"
                >
                  {MOD_CURVES.map((c) => (
                    <option key={c.key} value={c.key} title={c.hint}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>

      {routings.length === 0 ? (
        <Hint>No modulations yet. Good first ones are Vocals to Glow and Song peak to Size.</Hint>
      ) : null}

      <Button size="sm" onClick={() => onChange([...routings, createModRouting()])}>
        Add modulation
      </Button>
    </Section>
  );
}
