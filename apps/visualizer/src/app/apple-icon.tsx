import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'radial-gradient(circle at 35% 30%, rgba(255,45,149,0.5), transparent 55%), radial-gradient(circle at 70% 75%, rgba(34,211,206,0.55), transparent 60%), #0a0b1e',
        }}
      >
        <svg
          viewBox="0 0 200 130"
          width="140"
          height="91"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse cx="100" cy="65" rx="90" ry="35" stroke="#22D3CE" strokeWidth="10" />
          <ellipse cx="100" cy="65" rx="35" ry="12" stroke="#FF2D95" strokeWidth="10" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
