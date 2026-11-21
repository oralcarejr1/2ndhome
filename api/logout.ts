import { clearedCookie, json } from '../server/auth.js';

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    return json({ ok: true }, 200, { 'set-cookie': clearedCookie(req) });
  },
};
