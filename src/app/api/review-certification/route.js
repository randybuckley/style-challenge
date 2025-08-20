// File: src/app/api/review-certification/route.js
export async function POST(req) {
  try {
    const { user_id, first_name, second_name, salon } = await req.json();

    const response = await fetch('https://sifluvnvdgszfchtudkv.functions.supabase.co/review-certification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ user_id, first_name, second_name, salon }),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
    });
  } catch (error) {
    console.error('Server error:', error);
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), {
      status: 500,
    });
  }
}