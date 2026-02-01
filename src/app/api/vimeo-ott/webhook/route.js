export const runtime = 'nodejs';

const TOKEN = process.env.VIMEO_OTT_WEBHOOK_TOKEN;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function parsePossiblyDoubleEncodedJson(raw) {
  try {
    const first = JSON.parse(raw);
    if (typeof first === 'string') {
      return JSON.parse(first);
    }
    return first;
  } catch {
    return null;
  }
}

export async function OPTIONS() {
  return new Response('ok', { status: 200, headers: corsHeaders() });
}

export async function POST(req) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!TOKEN || token !== TOKEN) {
    return new Response('unauthorized', {
      status: 401,
      headers: corsHeaders(),
    });
  }

  const raw = await req.text();
  const payload = parsePossiblyDoubleEncodedJson(raw);

  console.log('[VIMEO OTT WEBHOOK] raw:', raw);

  if (payload) {
    console.log('[VIMEO OTT WEBHOOK] topic:', payload.topic);
    console.log(
      '[VIMEO OTT WEBHOOK] email:',
      payload?._embedded?.customer?.email
    );
  } else {
    console.log('[VIMEO OTT WEBHOOK] could not parse JSON');
  }

  return new Response('ok', { status: 200, headers: corsHeaders() });
}
