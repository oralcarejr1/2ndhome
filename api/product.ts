import { isAuthed, json } from '../server/auth.js';
import { readProductPage } from '../server/productPage.js';
import { normalizeProductUrl } from '../src/lib/productImport.js';

export default {
  async fetch(req: Request): Promise<Response> {
    if (!(await isAuthed(req))) return json({ error: 'auth' }, 401);
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    if (req.headers.get('x-2ndhome') !== '1') return json({ error: 'csrf' }, 403);
    let url: string;
    try {
      const text = await req.text();
      if (text.length > 4096) return json({ error: 'bad_url' }, 400);
      const body = JSON.parse(text);
      if (typeof body.url !== 'string' || body.url.length > 2048) return json({ error: 'bad_url' }, 400);
      url = normalizeProductUrl(body.url);
    } catch { return json({ error: 'bad_url' }, 400); }
    try {
      return json(await readProductPage(url));
    } catch {
      return json({ error: 'page_unavailable' }, 422);
    }
  },
};
