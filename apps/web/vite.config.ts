import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** API upstream for /api proxy — use http://api:3000 in Docker Compose. */
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

const apiProxy = {
  '/api': {
    target: apiProxyTarget,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, '')
  }
};

export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  resolve: {
    alias: {
      '@pds/fixtures': resolve(__dirname, '../../packages/fixtures/src/index.ts'),
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    proxy: apiProxy
  },
  preview: {
    proxy: apiProxy,
    // nginx/TLS demos forward the public Host header; allow explicit hosts or all.
    // VITE_PREVIEW_ALLOWED_HOSTS=all | comma-separated list (default: localhost + demo.viksitpds.in)
    allowedHosts: (() => {
      const raw = process.env.VITE_PREVIEW_ALLOWED_HOSTS?.trim();
      if (raw === 'all') return true;
      const hosts = (raw ? raw.split(',') : ['localhost', 'demo.viksitpds.in'])
        .map((host) => host.trim())
        .filter(Boolean);
      return hosts.length > 0 ? hosts : true;
    })()
  }
});
