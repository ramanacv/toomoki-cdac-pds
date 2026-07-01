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
    proxy: apiProxy
  }
});
