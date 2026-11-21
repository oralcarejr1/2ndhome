import { checkPassword, json, makeToken, passwordConfigured, sessionCookie } from '../server/auth.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    if (!passwordConfigured()) return json({ error: 'not_configured' }, 503);
    let pw = '';
    try {
      const b = (await req.json()) as { password?: unknown };
      pw = typeof b?.password === 'string' ? b.password : '';
    } catch {
      pw = '';
    }
    if (!pw || !(await checkPassword(pw))) {
      await sleep(1200); // slow down guessing
      return json({ error: 'wrong_password' }, 401);
    }
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(req, await makeToken()) });
  },
};
