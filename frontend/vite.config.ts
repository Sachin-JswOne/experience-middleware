import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    proxy: {
      '/xp-mi': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../dist-admin',
    emptyOutDir: true,
  },
});