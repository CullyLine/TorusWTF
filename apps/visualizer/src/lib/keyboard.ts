/**
 * Helpers for page-wide keyboard shortcuts, so a shortcut never steals a key
 * press that belongs to the element the user is working in.
 */

/** True when the key press should type into the focused field. */
export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * True when the user moved focus onto a control with the keyboard, so Space
 * should activate that control instead of a page shortcut.
 *
 * A control focused by a mouse click does not count. Clicking a button and
 * then pressing Space to pause is common, and `:focus-visible` tells the two
 * cases apart.
 */
export function isKeyboardFocusedControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const control = target.closest(
    'button, a, summary, [role="button"], [role="slider"], [role="tab"]',
  );
  return control !== null && control.matches(':focus-visible');
}
