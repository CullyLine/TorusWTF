/** Subdomains and path segments that must not be claimed as user handles. */
export const RESERVED_HANDLES = new Set([
  'www',
  'admin',
  'api',
  'media',
  'static',
  'mail',
  'help',
  'support',
  'about',
  'signin',
  'signup',
  'login',
  'auth',
  'embed',
  'u',
  'settings',
  'privacy',
  'terms',
  'principles',
  'license',
  'conductor',
  'transcriber',
  'visualizer',
  'viz',
  'hd',
]);

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.toLowerCase());
}
