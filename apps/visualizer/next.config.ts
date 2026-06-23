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
  // Production talks to Turso via the pure-JS `@libsql/client/web` entry, which
  // we let webpack bundle straight into each function so nothing has to be traced
  // at runtime. The native `@libsql/client` (default entry) + `libsql` bindings
  // are only loaded lazily for local `file:` databases, so they stay external and
  // out of the bundle (and never run on Vercel).
  serverExternalPackages: ['libsql'],
  webpack: (webpackConfig, { isServer, webpack }) => {
    if (!isServer) {
      // libsonare's emscripten glue has a Node-only branch that does
      // `await import('node:module')` (plus node: requires). It never runs in
      // the browser (guarded by an env check), but webpack still tries to
      // resolve the specifier and can't handle the `node:` URI scheme. Strip
      // the scheme, then stub the bare core modules out for the client bundle.
      webpackConfig.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, '');
        }),
      );
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        module: false,
        fs: false,
        path: false,
        url: false,
        os: false,
        crypto: false,
      };
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
