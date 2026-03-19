import { loadEnv } from 'vite';

import { startSideShiftProxyServer } from './sideshiftProxy.mjs';

const env = loadEnv('development', process.cwd(), '');
const config = {
  secret: env.SIDESHIFT_SECRET || '',
  affiliateId: env.SIDESHIFT_AFFILIATE_ID || '',
};
const port = Number(env.SIDESHIFT_PROXY_PORT || 8787);

startSideShiftProxyServer(config, port);
