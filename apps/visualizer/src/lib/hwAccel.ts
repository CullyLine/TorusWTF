const SOFTWARE_RENDERER =
  /swiftshader|llvmpipe|software|microsoft basic render|angle \(software/i;

export function isSoftwareWebGLRenderer(): boolean {
  if (typeof document === 'undefined') return false;

  const canvas = document.createElement('canvas');
  const gl =
    canvas.getContext('webgl') ??
    canvas.getContext('experimental-webgl');

  if (!gl || !(gl instanceof WebGLRenderingContext)) return false;

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (!debugInfo) return false;

  const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
  if (typeof renderer !== 'string') return false;

  return SOFTWARE_RENDERER.test(renderer);
}

export function hardwareAccelHelpUrl(): string {
  return 'https://support.google.com/chrome/answer/12208909?hl=en';
}
