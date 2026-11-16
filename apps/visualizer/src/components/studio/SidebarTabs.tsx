'use client';

import type { ReactNode } from 'react';
import { cx } from '@/components/ui/controls';

/** The four groups of controls, in the order a new user works through them. */
export const STUDIO_TABS = [
  { id: 'audio', label: 'Audio' },
  { id: 'look', label: 'Look' },
  { id: 'automate', label: 'Automate' },
  { id: 'export', label: 'Export' },
] as const;

export type StudioTabId = (typeof STUDIO_TABS)[number]['id'];

export function isStudioTabId(value: unknown): value is StudioTabId {
  return STUDIO_TABS.some((tab) => tab.id === value);
}

interface TabBarProps {
  active: StudioTabId;
  onSelect: (tab: StudioTabId) => void;
  /** Prefix for the tab and panel ids, so two tab bars can exist in one document. */
  idPrefix: string;
  /** On the mobile sheet no tab looks selected while the sheet is closed. */
  showSelection?: boolean;
  trailing?: ReactNode;
  className?: string;
}

export function StudioTabBar({
  active,
  onSelect,
  idPrefix,
  showSelection = true,
  trailing,
  className,
}: TabBarProps) {
  return (
    <div className={cx('flex shrink-0 items-stretch border-torus-border', className)}>
      <div role="tablist" aria-label="Controls" className="flex min-w-0 flex-1">
        {STUDIO_TABS.map((tab) => {
          const selected = showSelection && tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel`}
              onClick={() => onSelect(tab.id)}
              className={cx(
                'relative flex-1 px-2 py-3 text-[13px] font-medium transition-colors',
                selected ? 'text-torus-fg' : 'text-torus-fg-dim hover:text-torus-fg',
              )}
            >
              {tab.label}
              {selected ? (
                <span
                  className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-torus-mid"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
      {trailing}
    </div>
  );
}

interface TabPanelProps {
  active: StudioTabId;
  idPrefix: string;
  /** The panel content for each tab. Only the active one is mounted. */
  panels: Record<StudioTabId, ReactNode>;
  className?: string;
}

export function StudioTabPanel({ active, idPrefix, panels, className }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel`}
      aria-labelledby={`${idPrefix}-tab-${active}`}
      className={cx('torus-scroll min-h-0 flex-1 overflow-y-auto', className)}
    >
      {panels[active]}
    </div>
  );
}
