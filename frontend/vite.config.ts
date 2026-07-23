import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/xp-mi': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist-frontend',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // The dashboard pulls in recharts and MUI — keep them out of the
        // entry chunk so the login page loads light.
        manualChunks: {
          recharts: ['recharts'],
          mui: ['@mui/material', '@mui/icons-material'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
