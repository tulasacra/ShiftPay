import { defineConfig, loadEnv } from 'vite';

import { handleSideShiftProxy } from './server/sideshiftProxy.mjs';

function sideshiftProxyPlugin() {
  return {
    name: 'sideshift-proxy',
    configureServer(server) {
      server.middlewares.use('/api/sideshift', (req, res, next) => {
        const env = loadEnv(server.config.mode, process.cwd(), '');
        const config = {
          secret: env.SIDESHIFT_SECRET || '',
          affiliateId: env.SIDESHIFT_AFFILIATE_ID || '',
        };
        void handleSideShiftProxy(req, res, config).catch(next);
      });
    },
  };
}

export default defineConfig({
  root: 'app',
  publicDir: '../public',
  base: './',
  plugins: [sideshiftProxyPlugin()],
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
