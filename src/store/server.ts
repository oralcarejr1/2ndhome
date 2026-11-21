import type { Project } from '../types';

// Client for the password-protected API on the Vercel deployment (api/*.ts).
// Every call is same-origin, so the HttpOnly session cookie rides along automatically.

export interface SessionInfo {
  configured: boolean;
  auth: boolean;
  storage: boolean;
}
export interface RemoteEntry {
  id: string;
  name: string;
  etag: string;
  at: number;
}
export type PutResult = { ok: true; etag: string } | { ok: false; conflict: true } | { ok: false; conflict: false; status: number };

const W = { 'x-2ndhome': '1' };
let onAuthLost: (() => void) | null = null;
export function setOnAuthLost(fn: () => void) {
  onAuthLost = fn;
}

async function call(path: string, init: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, signal: ctl.signal });
    if (r.status === 401) onAuthLost?.();
    return r;
  } finally {
    clearTimeout(t);
  }
}

/** null = no API here (claude.ai artifact, plain static hosting, offline). */
export async function serverSession(): Promise<SessionInfo | null> {
  try {
    const r = await call('/api/session', {}, 6000);
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    const d = (await r.json()) as { app?: string; configured?: boolean; auth?: boolean; storage?: boolean };
    if (d?.app !== '2ndhome') return null;
    return { configured: !!d.configured, auth: !!d.auth, storage: !!d.storage };
  } catch {
    return null;
  }
}

export async function serverLogin(password: string): Promise<'ok' | 'wrong' | 'not_configured' | 'error'> {
  try {
    const r = await call('/api/login', { method: 'POST', headers: { ...W, 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    if (r.ok) return 'ok';
    if (r.status === 401) return 'wrong';
    if (r.status === 503) return 'not_configured';
    return 'error';
  } catch {
    return 'error';
  }
}

export async function serverLogout() {
  try {
    await call('/api/logout', { method: 'POST', headers: W });
  } catch {
    /* ignore */
  }
}

export async function srvList(): Promise<RemoteEntry[] | null> {
  try {
    const r = await call('/api/projects');
    if (!r.ok) return null;
    const d = (await r.json()) as { list?: RemoteEntry[] };
    return Array.isArray(d.list) ? d.list : [];
  } catch {
    return null;
  }
}

export async function srvGet(id: string): Promise<{ project: Project; etag: string } | null> {
  try {
    const r = await call(`/api/projects?id=${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const project = (await r.json()) as Project;
    return { project, etag: r.headers.get('x-etag') ?? '' };
  } catch {
    return null;
  }
}

/** Current etag of a project, '' if it doesn't exist on the server, null if unreachable. */
export async function srvStat(id: string): Promise<string | null> {
  try {
    const r = await call(`/api/projects?id=${encodeURIComponent(id)}&stat=1`, {}, 8000);
    if (r.status === 404) return '';
    if (!r.ok) return null;
    return ((await r.json()) as { etag: string }).etag;
  } catch {
    return null;
  }
}

export async function srvPut(p: Project, base: string | 'none'): Promise<PutResult> {
  try {
    const r = await call(`/api/projects?id=${encodeURIComponent(p.id)}`, {
      method: 'PUT',
      headers: { ...W, 'content-type': 'application/json', 'x-base-etag': base },
      body: JSON.stringify(p),
    });
    if (r.ok) return { ok: true, etag: ((await r.json()) as { etag: string }).etag };
    if (r.status === 409) return { ok: false, conflict: true };
    return { ok: false, conflict: false, status: r.status };
  } catch {
    return { ok: false, conflict: false, status: 0 };
  }
}

export async function srvDelete(id: string) {
  try {
    const r = await call(`/api/projects?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: W });
    return r.ok;
  } catch {
    return false;
  }
}

export const SERVER_FILE_MAX = 4_200_000;

export async function srvUpload(b: Blob): Promise<string | null> {
  if (b.size > SERVER_FILE_MAX) return null;
  try {
    const r = await call('/api/files', { method: 'POST', headers: { ...W, 'content-type': b.type || 'application/octet-stream' }, body: b }, 60000);
    if (!r.ok) return null;
    return ((await r.json()) as { id: string }).id;
  } catch {
    return null;
  }
}

export const srvFileUrl = (id: string) => `/api/files?id=${encodeURIComponent(id)}`;
