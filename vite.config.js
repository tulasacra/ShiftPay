import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app',
  publicDir: '../public',
  base: './',
  server: {
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
