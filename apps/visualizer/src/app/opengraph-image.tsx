import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'torus visualizer — turn any audio into 3D visuals';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background:
            'radial-gradient(circle at 30% 30%, rgba(255,45,149,0.55), transparent 55%), radial-gradient(circle at 75% 80%, rgba(34,211,206,0.45), transparent 60%), radial-gradient(circle at 50% 50%, rgba(167,139,250,0.35), transparent 70%), #0a0b1e',
          color: '#f5f5fb',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 999,
              border: '4px solid #22D3CE',
              boxShadow: '0 0 30px rgba(34, 211, 206, 0.6)',
            }}
          />
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em' }}>
            torus visualizer
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
            }}
          >
            Turn any audio into 3D visuals.
          </div>
          <div
            style={{
              fontSize: 30,
              color: 'rgba(245, 245, 251, 0.78)',
              lineHeight: 1.3,
            }}
          >
            Spotify · Ableton · Splice · mic — nine reactive presets, infinite Mandelbrot zoom,
            instant export.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            fontSize: 22,
            color: 'rgba(245, 245, 251, 0.6)',
          }}
        >
          <span
            style={{
              padding: '8px 18px',
              borderRadius: 999,
              border: '1px solid rgba(34, 211, 206, 0.5)',
              color: '#22D3CE',
            }}
          >
            Free
          </span>
          <span
            style={{
              padding: '8px 18px',
              borderRadius: 999,
              border: '1px solid rgba(245, 245, 251, 0.25)',
            }}
          >
            No signup
          </span>
          <span
            style={{
              padding: '8px 18px',
              borderRadius: 999,
              border: '1px solid rgba(245, 245, 251, 0.25)',
            }}
          >
            Open source
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
