import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import files from '../api/files';
import login from '../api/login';
import projects from '../api/projects';
import session from '../api/session';
import middleware from '../middleware';
import { makeToken, verifyToken } from '../server/auth';
import { Conflict, credsFrom, setStorage, type FileStat, type Storage } from '../server/store';

function memStorage(): Storage {
  const m = new Map<string, { body: Uint8Array; type: string; at: number }>();
  const etag = (b: Uint8Array) => createHash('sha1').update(b).digest('hex');
  return {
    async read(p) {
      const f = m.get(p);
      return f ? { body: f.body, type: f.type, etag: etag(f.body) } : null;
    },
    async stat(p) {
      const f = m.get(p);
      return f ? { path: p, etag: etag(f.body), size: f.body.byteLength, at: f.at } : null;
    },
    async write(p, body, type, ifMatch) {
      if (ifMatch && (!m.has(p) || etag(m.get(p)!.body) !== ifMatch)) throw new Conflict();
      m.set(p, { body, type, at: Date.now() });
      return { etag: etag(body) };
    },
    async remove(p) {
      m.delete(p);
    },
    async listPrefix(prefix) {
      const out: FileStat[] = [];
      for (const [p, f] of m) if (p.startsWith(prefix)) out.push({ path: p, etag: etag(f.body), size: f.body.byteLength, at: f.at });
      return out;
    },
  };
}

const URL0 = 'https://example.test';
let cookie = '';
const req = (path: string, init: RequestInit & { auth?: boolean } = {}) => {
  const h = new Headers(init.headers);
  if (init.auth !== false && cookie) h.set('cookie', cookie);
  if (init.method && init.method !== 'GET') h.set('x-2ndhome', '1');
  return new Request(URL0 + path, { ...init, headers: h });
};
const project = (id: string, name: string, extra = {}) => JSON.stringify({ id, name, versions: [{ id: 'v1', items: [] }], ...extra });

beforeAll(() => {
  process.env.APP_PASSWORD = 'correct horse battery';
  setStorage(memStorage());
});

describe('auth', () => {
  it('signs and verifies sessions; rejects tampering, expiry and a changed password', async () => {
    const t = await makeToken(1_000);
    expect(await verifyToken(t, 2_000)).toBe(true);
    expect(await verifyToken(t.slice(0, -2) + 'xx', 2_000)).toBe(false);
    expect(await verifyToken(t, 1_000 + 121 * 86400_000)).toBe(false);
    expect(await verifyToken(t, 2_000, { APP_PASSWORD: 'other' })).toBe(false);
    expect(await verifyToken('v1.9999999999999.abc', 2_000)).toBe(false);
  });

  it('wrong password → 401, right password → HttpOnly session cookie', async () => {
    const bad = await login.fetch(req('/api/login', { method: 'POST', body: JSON.stringify({ password: 'nope' }), auth: false }));
    expect(bad.status).toBe(401);
    const ok = await login.fetch(req('/api/login', { method: 'POST', body: JSON.stringify({ password: 'correct horse battery' }), auth: false }));
    expect(ok.status).toBe(200);
    const sc = ok.headers.get('set-cookie')!;
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/Secure/);
    expect(sc).toMatch(/SameSite=Lax/);
    cookie = sc.split(';')[0];
    const s = await (await session.fetch(req('/api/session'))).json();
    expect(s).toMatchObject({ configured: true, auth: true, storage: true });
  }, 10_000);
});

describe('middleware', () => {
  it('serves only the login page without a session, everything with one', async () => {
    const page = await middleware(req('/', { auth: false }));
    expect(page.status).toBe(401);
    const html = await page.text();
    expect(html).toContain('비밀번호');
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+stylesheet/); // self-contained: loads nothing of the app
    expect(html.length).toBeLessThan(8000);
    expect((await middleware(req('/assets/index.js', { auth: false }))).status).toBe(401);
    expect((await middleware(req('/api/projects', { auth: false }))).status).toBe(401);
    expect((await middleware(req('/api/login', { auth: false }))).headers.get('x-middleware-next')).toBe('1');
    expect((await middleware(req('/assets/index.js'))).headers.get('x-middleware-next')).toBe('1');
  });

  it('locks everything when no password is configured', async () => {
    const pw = process.env.APP_PASSWORD;
    delete process.env.APP_PASSWORD;
    try {
      expect((await middleware(req('/'))).status).toBe(503);
      expect((await middleware(req('/api/projects'))).status).toBe(503);
    } finally {
      process.env.APP_PASSWORD = pw;
    }
  });
});

describe('projects api', () => {
  it('rejects unauthenticated and cross-site writes', async () => {
    expect((await projects.fetch(req('/api/projects', { auth: false }))).status).toBe(401);
    const r = new Request(URL0 + '/api/projects?id=a', { method: 'PUT', headers: { cookie }, body: project('a', 'A') });
    expect((await projects.fetch(r)).status).toBe(403);
  });

  it('creates, lists, detects conflicts, renames and deletes', async () => {
    const put = (id: string, body: string, base?: string) =>
      projects.fetch(req(`/api/projects?id=${id}`, { method: 'PUT', body, headers: base ? { 'x-base-etag': base } : {} }));
    const a1 = await put('p1', project('p1', '우리 집'), 'none');
    expect(a1.status).toBe(200);
    const { etag: e1 } = await a1.json();
    expect((await put('p1', project('p1', '우리 집'), 'none')).status).toBe(409); // already exists

    const a2 = await put('p1', project('p1', '우리 집', { note: 'device A' }), e1);
    expect(a2.status).toBe(200);
    const { etag: e2 } = await a2.json();
    // device B still holds e1 → conflict, and the server reports the current etag
    const b = await put('p1', project('p1', '우리 집', { note: 'device B' }), e1);
    expect(b.status).toBe(409);
    expect((await b.json()).etag).toBe(e2);

    const g = await projects.fetch(req('/api/projects?id=p1'));
    expect(g.headers.get('x-etag')).toBe(e2);
    expect((await g.json()).note).toBe('device A');
    expect(await (await projects.fetch(req('/api/projects?id=p1&stat=1'))).json()).toMatchObject({ etag: e2 });

    await put('p1', project('p1', '새 이름'), e2);
    const list = (await (await projects.fetch(req('/api/projects'))).json()).list;
    expect(list).toEqual([expect.objectContaining({ id: 'p1', name: '새 이름' })]);

    expect((await put('p1', project('other', 'x'))).status).toBe(400); // id mismatch
    expect((await put('../x', project('../x', 'x'))).status).toBe(400);

    await projects.fetch(req('/api/projects?id=p1', { method: 'DELETE' }));
    expect((await (await projects.fetch(req('/api/projects'))).json()).list).toEqual([]);
    expect((await projects.fetch(req('/api/projects?id=p1'))).status).toBe(404);
  });
});

describe('files api', () => {
  it('stores images privately and serves them back with safe headers', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    const up = await files.fetch(req('/api/files', { method: 'POST', body: bytes, headers: { 'content-type': 'image/jpeg' } }));
    expect(up.status).toBe(200);
    const { id } = await up.json();
    expect((await files.fetch(req(`/api/files?id=${id}`, { auth: false }))).status).toBe(401);
    const got = await files.fetch(req(`/api/files?id=${id}`));
    expect(got.headers.get('content-type')).toBe('image/jpeg');
    expect(got.headers.get('content-security-policy')).toContain('sandbox');
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes);
    const html = await files.fetch(req('/api/files', { method: 'POST', body: '<script>', headers: { 'content-type': 'text/html' } }));
    const hid = (await html.json()).id;
    expect((await files.fetch(req(`/api/files?id=${hid}`))).headers.get('content-type')).toBe('application/octet-stream');
  });
});

describe('blob credentials', () => {
  it('uses the per-request OIDC token with BLOB_STORE_ID (newer Vercel Blob stores)', () => {
    const r = new Request(URL0 + '/api/projects', { headers: { 'x-vercel-oidc-token': ' tok ' } });
    delete process.env.BLOB_STORE_ID;
    expect(credsFrom(r)).toEqual({});
    process.env.BLOB_STORE_ID = 'store_abc';
    try {
      expect(credsFrom(r)).toEqual({ oidcToken: 'tok', storeId: 'store_abc' });
      expect(credsFrom(new Request(URL0))).toEqual({});
    } finally {
      delete process.env.BLOB_STORE_ID;
    }
  });

  it('session reports a broken store instead of failing silently', async () => {
    const broken: Storage = {
      read: async () => null,
      stat: async () => {
        throw new Error('Vercel Blob: access denied');
      },
      write: async () => ({ etag: 'x' }),
      remove: async () => {},
      listPrefix: async () => [],
    };
    setStorage(broken);
    try {
      const s = await (await session.fetch(req('/api/session'))).json();
      expect(s).toMatchObject({ auth: true, storage: false, storageError: 'Vercel Blob: access denied' });
    } finally {
      setStorage(memStorage());
    }
  });
});
