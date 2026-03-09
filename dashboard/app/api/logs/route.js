export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BOT_BACKEND_URL || 'http://localhost:8000';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get('limit') || '100';
  const level = searchParams.get('level') || '';

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/v1/logs?limit=${limit}&level=${level}`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (res.ok) {
      const data = await res.json();
      return Response.json(data);
    }
  } catch (e) {
    // Backend not available
  }

  return Response.json({ logs: [], _fallback: true });
}
