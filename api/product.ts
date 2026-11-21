import { isAuthed, json } from '../server/auth.js';
import { isAiConfigured } from '../server/productAi.js';
import { importProductContent } from '../server/productContent.js';
import { readProductPage } from '../server/productPage.js';
import { normalizeProductUrl } from '../src/lib/productImport.js';

const MAX_BODY_CHARS = 4_200_000;

export default {
  async fetch(req: Request): Promise<Response> {
    if (!(await isAuthed(req))) return json({ error: 'auth' }, 401);
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    if (req.headers.get('x-2ndhome') !== '1') return json({ error: 'csrf' }, 403);

    let url: string | undefined;
    let textContent: string | undefined;
    let imageDataUrl: string | undefined;

    try {
      const raw = await req.text();
      if (raw.length > MAX_BODY_CHARS) return json({ error: 'bad_request' }, 400);
      const body = JSON.parse(raw) as Record<string, unknown>;

      if (body.url !== undefined && body.url !== '') {
        if (typeof body.url !== 'string' || body.url.length > 2048) return json({ error: 'bad_url' }, 400);
        url = normalizeProductUrl(body.url);
      }
      if (body.text !== undefined && body.text !== '') {
        if (typeof body.text !== 'string' || body.text.length > 40_000) return json({ error: 'bad_request' }, 400);
        textContent = body.text;
      }
      if (body.image !== undefined && body.image !== '') {
        if (typeof body.image !== 'string' || body.image.length > 4_000_000) return json({ error: 'bad_request' }, 400);
        imageDataUrl = body.image;
      }

      if (!url && !textContent && !imageDataUrl) return json({ error: 'bad_url' }, 400);
    } catch {
      return json({ error: 'bad_url' }, 400);
    }

    if (textContent || imageDataUrl) {
      try {
        return json(await importProductContent({ url, text: textContent, image: imageDataUrl }));
      } catch (err) {
        const msg = (err as Error)?.message;
        if (msg === 'ai_required') return json({ error: 'ai_required', aiConfigured: false }, 422);
        if (msg === 'bad_image' || msg === 'image_too_large' || msg === 'empty_content') {
          return json({ error: 'bad_request' }, 400);
        }
        return json({ error: 'page_unavailable', aiConfigured: isAiConfigured() }, 422);
      }
    }

    try {
      return json(await readProductPage(url!));
    } catch {
      return json({ error: 'page_unavailable' }, 422);
    }
  },
};
