/** Customer-facing support address (Polar, license help, general contact). */
export const SUPPORT_EMAIL = 'support@torus.wtf';

/** In-app feedback form destination. */
export const FEEDBACK_EMAIL = 'feedback@torus.wtf';

export function mailto(href: string): string {
  return `mailto:${href}`;
}
