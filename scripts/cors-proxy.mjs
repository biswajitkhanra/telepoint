import http from 'node:http';

const TARGET = 'https://telepoint-topaz.vercel.app';
const PORT = 3001;

const server = http.createServer(async (req, res) => {
  // Add CORS headers to all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    const url = `${TARGET}${req.url}`;
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.origin;
    delete headers.referer;

    let body = null;
    if (['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = Buffer.concat(chunks);
    }

    const upstreamRes = await fetch(url, {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
        ...(req.headers['authorization'] ? { authorization: req.headers['authorization'] } : {})
      },
      body
    });

    res.writeHead(upstreamRes.status, {
      'content-type': upstreamRes.headers.get('content-type') || 'application/json',
      'Access-Control-Allow-Origin': '*'
    });

    const data = await upstreamRes.arrayBuffer();
    res.end(Buffer.from(data));
  } catch (err) {
    console.error('Proxy error:', err);
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy failed', details: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`CORS Proxy running on http://localhost:${PORT} -> ${TARGET}`);
});
