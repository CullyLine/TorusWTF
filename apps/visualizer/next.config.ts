import type { NextConfig } from 'next';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

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
  transpilePackages: ['@torus/ui', '@torus/visualizers', '@torus/shared'],
  // The libSQL driver ships native bindings + non-JS files; keep it out of the
  // webpack bundle and require it at runtime on the server instead. Production
  // uses the pure-JS `@libsql/client/web` entry (no native code) against Turso.
  serverExternalPackages: ['@libsql/client', 'libsql'],
  webpack: (webpackConfig, { isServer }) => {
    if (isServer) {
      const libsqlExternals = [
        '@libsql/client',
        '@libsql/client/web',
        'libsql',
        '@libsql/isomorphic-fetch',
        '@libsql/isomorphic-ws',
        '@libsql/hrana-client',
      ];
      const existing = webpackConfig.externals;
      webpackConfig.externals = Array.isArray(existing)
        ? [...existing, ...libsqlExternals]
        : [existing, ...libsqlExternals].filter(Boolean);
    }
    return webpackConfig;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), display-capture=(self), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
