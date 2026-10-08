/**
 * Vercel Serverless Function: GET /api/xkiro/models
 * Public catalog endpoint proxy - không gửi Authorization
 */
module.exports = async function handler(req, res) {
  // CORS support
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { message: 'Method Not Allowed' } }));
    return;
  }

  try {
    const upstreamRes = await fetch('https://api.xkiro.com/v1/models', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    const status = upstreamRes.status;
    const rawText = await upstreamRes.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      data = { raw: rawText };
    }

    if (!upstreamRes.ok) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data || { error: { message: `xKiro catalog trả HTTP ${status}.` } }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300'
    });
    res.end(JSON.stringify(data));
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: {
        message: 'Không thể kết nối tới xKiro. Kiểm tra mạng, DNS hoặc proxy.'
      }
    }));
  }
};
