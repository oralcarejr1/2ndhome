import { isAuthed, json } from '../server/auth.js';
import { Conflict, INDEX_PATH, NotConfigured, projectPath, readIndex, storage, updateIndex, validId } from '../server/store.js';

// GET  /api/projects                 → { list: [{ id, name, etag, at }] }
// GET  /api/projects?id=X            → project JSON (etag in x-etag)
// GET  /api/projects?id=X&stat=1     → { etag, at }
// PUT  /api/projects?id=X            → body = project JSON; x-base-etag: <etag> | none | (absent = overwrite)
// DELETE /api/projects?id=X
const MAX_BYTES = 4_300_000; // Vercel request bodies stop at 4.5 MB
const dec = new TextDecoder();

export default {
  async fetch(req: Request): Promise<Response> {
    if (!(await isAuthed(req))) return json({ error: 'auth' }, 401);
    if (req.method !== 'GET' && req.headers.get('x-2ndhome') !== '1') return json({ error: 'csrf' }, 403);
    try {
      return await handle(req);
    } catch (e) {
      if (e instanceof NotConfigured) return json({ error: 'storage_not_configured' }, 503);
      console.error('projects', e);
      return json({ error: 'server' }, 500);
    }
  },
};

async function handle(req: Request): Promise<Response> {
  const s = storage();
  const q = new URL(req.url).searchParams;
  const id = q.get('id');

  if (req.method === 'GET' && !id) {
    const [files, idx] = await Promise.all([s.listPrefix(projectPath('').replace(/\.json$/, '')), readIndex(s)]);
    const names = new Map(idx.list.map((x) => [x.id, x.name]));
    const list = files
      .filter((f) => f.path !== INDEX_PATH && f.path.endsWith('.json'))
      .map((f) => {
        const pid = f.path.slice(f.path.lastIndexOf('/') + 1, -5);
        return { id: pid, name: names.get(pid) ?? pid, etag: f.etag, at: f.at };
      })
      .sort((a, b) => b.at - a.at);
    return json({ list });
  }
  if (!validId(id)) return json({ error: 'bad_id' }, 400);

  if (req.method === 'GET') {
    if (q.get('stat')) {
      const st = await s.stat(projectPath(id));
      return st ? json({ etag: st.etag, at: st.at }) : json({ error: 'not_found' }, 404);
    }
    const f = await s.read(projectPath(id));
    if (!f) return json({ error: 'not_found' }, 404);
    return new Response(f.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-etag': f.etag } });
  }

  if (req.method === 'PUT') {
    const raw = new Uint8Array(await req.arrayBuffer());
    if (raw.byteLength > MAX_BYTES) return json({ error: 'too_large' }, 413);
    let name = id;
    try {
      const p = JSON.parse(dec.decode(raw)) as { id?: unknown; name?: unknown; versions?: unknown };
      if (p?.id !== id || !Array.isArray(p.versions)) return json({ error: 'bad_project' }, 400);
      if (typeof p.name === 'string') name = p.name.slice(0, 120);
    } catch {
      return json({ error: 'bad_json' }, 400);
    }
    const base = req.headers.get('x-base-etag');
    if (base === 'none') {
      const cur = await s.stat(projectPath(id));
      if (cur) return json({ error: 'conflict', etag: cur.etag }, 409);
    }
    let etag: string;
    try {
      ({ etag } = await s.write(projectPath(id), raw, 'application/json', base && base !== 'none' ? base : undefined));
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      const cur = await s.stat(projectPath(id));
      return json({ error: 'conflict', etag: cur?.etag ?? null }, 409);
    }
    await updateIndex(s, (list) => {
      const hit = list.find((x) => x.id === id);
      if (hit && hit.name === name) return null;
      if (hit) hit.name = name;
      else list.push({ id, name });
      return list;
    });
    return json({ etag });
  }

  if (req.method === 'DELETE') {
    await s.remove(projectPath(id));
    await updateIndex(s, (list) => (list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : null));
    return json({ ok: true });
  }

  return json({ error: 'method' }, 405);
}
