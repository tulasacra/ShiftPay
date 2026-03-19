import http from 'node:http';

const SIDESHIFT_API = 'https://sideshift.ai/api/v2';

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(),
  });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON body.');
  }
}

async function callSideShift(secret, userIp, method, pathname, jsonBody) {
  const headers = {
    'Content-Type': 'application/json',
    'x-sideshift-secret': secret,
  };
  if (userIp) {
    headers['x-user-ip'] = userIp;
  }
  const init = { method, headers };
  if (jsonBody !== undefined) {
    init.body = JSON.stringify(jsonBody);
  }
  return fetch(`${SIDESHIFT_API}${pathname}`, init);
}

async function forwardSideShiftResponse(res, upstream) {
  const text = await upstream.text();
  const ct = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
  res.writeHead(upstream.status, {
    'Content-Type': ct,
    ...corsHeaders(),
  });
  res.end(text);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ secret: string; affiliateId: string }} config
 */
export async function handleSideShiftProxy(req, res, config) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (!config.secret || !config.affiliateId) {
    sendJson(res, 503, {
      error: 'SideShift proxy is not configured. Set SIDESHIFT_SECRET and SIDESHIFT_AFFILIATE_ID.',
    });
    return;
  }

  const url = req.url || '/';
  const pathname = url.split('?')[0] || '/';
  const ip = clientIp(req);

  try {
    if (req.method === 'POST' && pathname === '/fixed-shift') {
      const body = await readJsonBody(req);
      const settleCoin = body.settleCoin;
      const settleAmount = body.settleAmount;
      const settleAddress = body.settleAddress;
      const refundAddress = body.refundAddress;

      if (typeof settleCoin !== 'string' || !settleCoin) {
        sendJson(res, 400, { error: 'settleCoin is required.' });
        return;
      }
      if (typeof settleAmount !== 'string' || !settleAmount) {
        sendJson(res, 400, { error: 'settleAmount is required.' });
        return;
      }
      if (typeof settleAddress !== 'string' || !settleAddress) {
        sendJson(res, 400, { error: 'settleAddress is required.' });
        return;
      }

      const quoteBody = {
        depositCoin: 'bch',
        settleCoin,
        settleAmount,
        affiliateId: config.affiliateId,
      };

      const quoteRes = await callSideShift(config.secret, ip, 'POST', '/quotes', quoteBody);
      if (!quoteRes.ok) {
        await forwardSideShiftResponse(res, quoteRes);
        return;
      }

      const quote = await quoteRes.json();
      const quoteId = quote.id;
      if (!quoteId) {
        sendJson(res, 502, { error: 'SideShift quote response did not include an id.' });
        return;
      }

      const shiftBody = {
        quoteId,
        settleAddress,
        affiliateId: config.affiliateId,
      };
      if (typeof refundAddress === 'string' && refundAddress) {
        shiftBody.refundAddress = refundAddress;
      }

      const shiftRes = await callSideShift(config.secret, ip, 'POST', '/shifts/fixed', shiftBody);
      await forwardSideShiftResponse(res, shiftRes);
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/shifts/')) {
      const shiftId = pathname.slice('/shifts/'.length);
      if (!shiftId || shiftId.includes('..')) {
        sendJson(res, 400, { error: 'Invalid shift id.' });
        return;
      }

      const headers = {
        'x-sideshift-secret': config.secret,
      };
      if (ip) {
        headers['x-user-ip'] = ip;
      }
      const shiftRes = await fetch(`${SIDESHIFT_API}/shifts/${encodeURIComponent(shiftId)}`, {
        method: 'GET',
        headers,
      });
      await forwardSideShiftResponse(res, shiftRes);
      return;
    }

    sendJson(res, 404, { error: 'Not found.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Proxy error.';
    sendJson(res, 500, { error: message });
  }
}

export function startSideShiftProxyServer(config, port = 8787) {
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    if (!url.startsWith('/api/sideshift')) {
      res.writeHead(404);
      res.end();
      return;
    }
    const innerPath = url.slice('/api/sideshift'.length) || '/';
    req.url = innerPath;
    void handleSideShiftProxy(req, res, config);
  });

  server.listen(port, () => {
    console.log(`SideShift proxy listening on http://127.0.0.1:${port}/api/sideshift`);
  });

  return server;
}
