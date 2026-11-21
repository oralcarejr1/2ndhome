import { isAuthed, json } from '../server/auth.js';
import { filePath, NotConfigured, storage, validId } from '../server/store.js';

// POST /api/files      body = file bytes (content-type = its type) → { id }
// GET  /api/files?id=X → the file (immutable; ids are never reused)
const MAX_BYTES = 4_300_000;
const SAFE_TYPES = /^(image\/(jpeg|png|webp|gif|avif|svg\+xml)|model\/[\w.+-]+|application\/(octet-stream|json)|text\/plain)$/;

export default {
  async fetch(req: Request): Promise<Response> {
    if (!(await isAuthed(req))) return json({ error: 'auth' }, 401);
    try {
      if (req.method === 'POST') {
        if (req.headers.get('x-2ndhome') !== '1') return json({ error: 'csrf' }, 403);
        const body = new Uint8Array(await req.arrayBuffer());
        if (!body.byteLength) return json({ error: 'empty' }, 400);
        if (body.byteLength > MAX_BYTES) return json({ error: 'too_large' }, 413);
        const t = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        const type = SAFE_TYPES.test(t) ? t : 'application/octet-stream';
        const rnd = crypto.getRandomValues(new Uint8Array(12));
        const id = 'f' + Date.now().toString(36) + [...rnd].map((b) => b.toString(16).padStart(2, '0')).join('');
        await storage().write(filePath(id), body, type);
        return json({ id });
      }
      if (req.method === 'GET') {
        const id = new URL(req.url).searchParams.get('id');
        if (!validId(id)) return json({ error: 'bad_id' }, 400);
        const f = await storage().read(filePath(id), false);
        if (!f) return json({ error: 'not_found' }, 404);
        return new Response(f.body, {
          headers: {
            'content-type': f.type || 'application/octet-stream',
            'cache-control': 'private, max-age=31536000, immutable',
            'x-content-type-options': 'nosniff',
            'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
          },
        });
      }
      return json({ error: 'method' }, 405);
    } catch (e) {
      if (e instanceof NotConfigured) return json({ error: 'storage_not_configured' }, 503);
      console.error('files', e);
      return json({ error: 'server' }, 500);
    }
  },
};
