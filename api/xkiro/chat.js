/**
 * Vercel Serverless Function: POST /api/xkiro/chat
 * Inference proxy hỗ trợ Server-Sent Events (SSE) streaming.
 * TUYỆT ĐỐI:
 * - KHÔNG log apiKey
 * - KHÔNG lưu apiKey
 * - KHÔNG ghi apiKey vào response hay log lỗi
 */

async function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch (_) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { message: 'Method Not Allowed' } }));
    return;
  }

  const body = await parseRequestBody(req);
  const {
    apiKey,
    model,
    messages,
    stream = true,
    reasoning_effort,
    response_format,
    temperature
  } = body;

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { message: 'Thiếu API key xKiro.' } }));
    return;
  }

  if (!model || !messages || !Array.isArray(messages)) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { message: 'Thiếu model hoặc messages hợp lệ.' } }));
    return;
  }

  const upstreamPayload = {
    model,
    messages,
    stream: Boolean(stream)
  };

  if (response_format) {
    upstreamPayload.response_format = response_format;
  }
  if (reasoning_effort && reasoning_effort !== 'default') {
    upstreamPayload.reasoning_effort = reasoning_effort;
  }
  if (typeof temperature === 'number') {
    upstreamPayload.temperature = temperature;
  }

  let upstreamRes;
  try {
    upstreamRes = await fetch('https://api.xkiro.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey.trim()
      },
      body: JSON.stringify(upstreamPayload)
    });
  } catch (netErr) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: {
        message: 'Không thể kết nối tới xKiro. Kiểm tra mạng, DNS hoặc proxy.'
      }
    }));
    return;
  }

  const status = upstreamRes.status;

  // Khi có lỗi từ upstream xKiro (400, 401, 403, 413, 429, 500, 503...)
  // Forward status code và JSON error về client mà KHÔNG biến thành generic network error
  if (!upstreamRes.ok) {
    const rawText = await upstreamRes.text().catch(() => '');
    let errJson;
    try {
      errJson = JSON.parse(rawText);
    } catch (_) {
      errJson = { error: { message: rawText || `Lỗi xKiro API (${status})` } };
    }

    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(JSON.stringify(errJson));
    return;
  }

  // 200 OK Thành công: Hỗ trợ stream SSE
  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    if (upstreamRes.body) {
      const reader = upstreamRes.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch (_) {
        // Stream reading interrupted
      } finally {
        res.end();
      }
    } else {
      res.end();
    }
    return;
  }

  // Non-streaming response
  const rawData = await upstreamRes.text().catch(() => '');
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(rawData);
};
