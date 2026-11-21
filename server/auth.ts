// Password gate shared by the routing middleware and the API functions.
// Web-standard APIs only (crypto.subtle, TextEncoder), so it runs on both the edge and Node runtimes.
//
// Session = HttpOnly cookie "v1.<expiry ms>.<HMAC-SHA256(expiry)>". The HMAC key is derived from
// APP_PASSWORD (+ optional SESSION_SECRET), so changing the password signs every device out.

export const COOKIE = '2h_session';
const MAX_AGE_S = 60 * 60 * 24 * 120; // 120 days
const enc = new TextEncoder();

type Env = Record<string, string | undefined>;
const env = (): Env => (typeof process !== 'undefined' && process.env ? (process.env as Env) : {});

export function passwordConfigured(e: Env = env()) {
  return !!e.APP_PASSWORD && e.APP_PASSWORD.length > 0;
}

function keyMaterial(e: Env) {
  return `2ndhome/session/v1/${e.SESSION_SECRET ?? ''}/${e.APP_PASSWORD ?? ''}`;
}

async function hmac(secret: string, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

function b64url(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

function sameString(a: string, b: string) {
  return sameBytes(enc.encode(a), enc.encode(b));
}

/** Constant-time password check (both sides are HMAC'd first so lengths don't leak). */
export async function checkPassword(given: string, e: Env = env()) {
  if (!passwordConfigured(e)) return false;
  const k = 'pw-compare';
  const [a, b] = await Promise.all([hmac(k, given), hmac(k, e.APP_PASSWORD!)]);
  return sameBytes(a, b);
}

export async function makeToken(now = Date.now(), e: Env = env()) {
  const exp = now + MAX_AGE_S * 1000;
  const sig = b64url(await hmac(keyMaterial(e), `v1.${exp}`));
  return `v1.${exp}.${sig}`;
}

export async function verifyToken(token: string | null | undefined, now = Date.now(), e: Env = env()) {
  if (!token || !passwordConfigured(e)) return false;
  const m = /^v1\.(\d{10,16})\.([A-Za-z0-9_-]{20,})$/.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!(exp > now)) return false;
  const want = b64url(await hmac(keyMaterial(e), `v1.${exp}`));
  return sameString(want, m[2]);
}

export function readCookie(req: Request, name = COOKIE): string | null {
  const raw = req.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function isAuthed(req: Request, now = Date.now(), e: Env = env()) {
  return verifyToken(readCookie(req), now, e);
}

function isHttps(req: Request) {
  const proto = req.headers.get('x-forwarded-proto');
  if (proto) return proto.split(',')[0].trim() === 'https';
  return new URL(req.url).protocol === 'https:';
}

export function sessionCookie(req: Request, token: string) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE_S}; HttpOnly; SameSite=Lax${isHttps(req) ? '; Secure' : ''}`;
}

export function clearedCookie(req: Request) {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isHttps(req) ? '; Secure' : ''}`;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
