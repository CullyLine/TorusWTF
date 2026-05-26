import type { NextConfig } from 'next';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Load .env from the monorepo root so the same file works whether you run
// `pnpm dev` from the repo root or `next dev` from apps/web.
(function loadRootEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
      loadEnv({ path: resolve(dir, '.env'), override: false, quiet: true });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
})();


const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  transpilePackages: ['@torus/ui', '@torus/visualizers', '@torus/shared', '@torus/db', '@torus/storage'],
  serverExternalPackages: ['better-sqlite3'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default config;
