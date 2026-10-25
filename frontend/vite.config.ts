import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('origin', 'http://127.0.0.1:5173');
          });
        },
      },
      '/healthz': 'http://127.0.0.1:8000',
    },
  },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    exclude: ['e2e/**/*.spec.ts', '**/node_modules/**'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
