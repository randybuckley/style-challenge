export const runtime = 'nodejs';

const EXPECTED_TOKEN = process.env.VIMEO_OTT_WEBHOOK_TOKEN;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function parsePossiblyDoubleEncodedJson(raw) {
  try {
    const first = JSON.parse(raw);
    if (typeof first === 'string') return JSON.parse(first);
    return first;
  } catch {
    return null;
  }
}

function isAuthorized(paramsToken) {
  return Boolean(EXPECTED_TOKEN) && paramsToken === EXPECTED_TOKEN;
}

export async function OPTIONS() {
  return new Response('ok', { status: 200, headers: corsHeaders() });
}

// Optional: helps if Vimeo “tests” with a GET ping.
export async function GET(_req, { params }) {
  if (!isAuthorized(params?.token)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders() });
  }
  return new Response('ok', { status: 200, headers: corsHeaders() });
}

export async function POST(req, { params }) {
  if (!isAuthorized(params?.token)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders() });
  }

  const raw = await req.text();
  const payload = parsePossiblyDoubleEncodedJson(raw);

  console.log('[VIMEO OTT WEBHOOK] raw:', raw);

  if (payload) {
    console.log('[VIMEO OTT WEBHOOK] topic:', payload.topic);
    console.log('[VIMEO OTT WEBHOOK] email:', payload?._embedded?.customer?.email);
  } else {
    console.log('[VIMEO OTT WEBHOOK] could not parse JSON');
  }

  return new Response('ok', { status: 200, headers: corsHeaders() });
}
