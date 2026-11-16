'use client';

import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { EditableNumber } from '@/components/ui/EditableNumber';
import { ChevronIcon } from '@/components/ui/icons';

/**
 * The form controls every studio panel is built from. Keeping them in one
 * place is what makes the sidebar look like one tool: a panel should not carry
 * its own class strings for a slider, a select, or a button.
 */

/** Joins class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Shared look for text inputs and selects. */
export const inputClass =
  'rounded-md border border-torus-border bg-torus-raised px-2.5 py-1.5 text-[13px] text-torus-fg placeholder:text-torus-fg-faint hover:border-torus-border-strong disabled:cursor-not-allowed disabled:opacity-40';

// ---------- Buttons ----------

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // The one filled button per panel: the action the panel exists for.
  primary: 'bg-torus-mid font-semibold text-torus-bg hover:bg-torus-mid/85',
  secondary: 'border border-torus-border-strong text-torus-fg hover:bg-torus-raised',
  quiet: 'text-torus-fg-dim hover:bg-torus-raised hover:text-torus-fg',
  danger: 'border border-torus-bass/60 text-torus-bass hover:bg-torus-bass/10',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-2 text-[13px]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}

/** An inline text action, for secondary things such as "Random" or "Reset". */
export function TextButton({
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cx(
        'text-xs text-torus-mid hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:no-underline',
        className,
      )}
      {...rest}
    />
  );
}

// ---------- Layout ----------

interface SectionProps {
  title: string;
  children: ReactNode;
  /** Sections start open unless they hold advanced settings. */
  defaultOpen?: boolean;
  /** A control shown at the right of the header, for example a text button. */
  action?: ReactNode;
}

/** A titled, collapsible block. Sections stack with a hairline between them. */
export function Section({ title, children, defaultOpen = true, action }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className="border-b border-torus-border last:border-b-0">
      <div className="flex items-center gap-2 pr-4">
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center gap-2 py-3 pl-4 text-left text-[13px] font-semibold text-torus-fg"
          >
            <ChevronIcon
              className={cx(
                'shrink-0 text-torus-fg-faint transition-transform',
                open && 'rotate-90',
              )}
            />
            {title}
          </button>
        </h3>
        {action}
      </div>
      {open ? (
        <div id={bodyId} className="space-y-3 px-4 pb-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** Small explanatory text under a control. */
export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx('text-[11px] leading-snug text-torus-fg-faint', className)}>{children}</p>
  );
}

// ---------- Fields ----------

interface RangeProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

/** A range input whose track fills with the accent color up to the thumb. */
export function Range({
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  disabled,
  className,
}: RangeProps) {
  const clamped = Math.max(min, Math.min(max, value));
  const fill = max > min ? ((clamped - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={clamped}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      aria-label={ariaLabel}
      className={cx('torus-range', className)}
      style={{ '--fill': `${fill}%` } as CSSProperties}
    />
  );
}

interface SliderFieldProps {
  label: string;
  /** Shown as a tooltip on the label. */
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Replaces the editable number, for example "40% wet". */
  readout?: ReactNode;
  /**
   * Lets a typed value go outside `min..max`. The slider thumb then pins at
   * its nearest end and the number shows in the warning color.
   */
  unbounded?: boolean;
  disabled?: boolean;
}

export function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  readout,
  unbounded = false,
  disabled,
}: SliderFieldProps) {
  const commit = (next: number) => onChange(unbounded ? next : Math.max(min, Math.min(max, next)));

  return (
    <div className="text-xs text-torus-fg-dim">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span title={hint} className={hint ? 'cursor-help' : undefined}>
          {label}
        </span>
        {readout ?? (
          <EditableNumber
            value={value}
            onCommit={commit}
            ariaLabel={label}
            outOfRange={value < min || value > max}
          />
        )}
      </div>
      <Range
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        ariaLabel={label}
        disabled={disabled}
      />
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  return (
    <label className="block text-xs text-torus-fg-dim">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={cx(inputClass, 'mt-1 w-full')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface CheckboxFieldProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function CheckboxField({ label, hint, checked, onChange }: CheckboxFieldProps) {
  return (
    <label className="flex items-start justify-between gap-3 text-xs text-torus-fg-dim">
      <span>
        {label}
        {hint ? (
          <span className="mt-0.5 block text-[11px] leading-snug text-torus-fg-faint">{hint}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-torus-mid"
      />
    </label>
  );
}

interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

interface SegmentedProps<T extends string> {
  ariaLabel: string;
  value: T | null;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
}

/** A row of mutually exclusive choices, for a handful of short options. */
export function Segmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-md bg-torus-raised p-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cx(
              'rounded px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              selected
                ? 'bg-torus-border-strong text-torus-fg'
                : 'text-torus-fg-dim hover:text-torus-fg',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
