import { env } from '../../../../server/env';
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(key)) return new Response('Not found', { status: 404 });
  try {
    const file = await env.BUCKET?.get(key);
    if (!file) return new Response('Not found', { status: 404 });
    return new Response(file.body, {
      headers: {
        'Content-Type': file.httpMetadata?.contentType ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public,max-age=31536000,immutable',
      },
    });
  } catch {
    return new Response('Unavailable', { status: 503 });
  }
}
