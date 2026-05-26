export type DetectedOS = 'windows' | 'mac' | 'linux' | 'other';

interface NavigatorUAData {
  platform?: string;
}

export function detectOS(): DetectedOS {
  if (typeof navigator === 'undefined') return 'other';

  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  const platform = (uaData?.platform ?? navigator.platform ?? '').toLowerCase();

  if (platform.includes('win')) return 'windows';
  if (platform.includes('mac')) return 'mac';
  if (platform.includes('linux')) return 'linux';

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'mac';
  if (ua.includes('linux')) return 'linux';

  return 'other';
}
