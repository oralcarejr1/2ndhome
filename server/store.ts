// Server-side storage. Production: a PRIVATE Vercel Blob store (readable only with the server's token,
// never by URL). Local dev/tests swap in another implementation with setStorage().
import { BlobNotFoundError, BlobPreconditionFailedError, del, get, head, list, put } from '@vercel/blob';

export interface StoredFile {
  body: Uint8Array;
  type: string;
  etag: string;
}
export interface FileStat {
  path: string;
  etag: string;
  size: number;
  at: number;
}
export interface Storage {
  read(path: string, fresh?: boolean): Promise<StoredFile | null>;
  stat(path: string): Promise<FileStat | null>;
  /** ifMatch: undefined = unconditional, string = only if the current etag equals it. */
  write(path: string, body: Uint8Array, type: string, ifMatch?: string): Promise<{ etag: string }>;
  remove(path: string): Promise<void>;
  listPrefix(prefix: string): Promise<FileStat[]>;
}

export class Conflict extends Error {
  constructor() {
    super('precondition failed');
  }
}
export class NotConfigured extends Error {
  constructor() {
    super('storage not configured');
  }
}

// Two ways a Vercel project can be connected to its Blob store:
//  - BLOB_READ_WRITE_TOKEN (older stores), or
//  - BLOB_STORE_ID + a short-lived OIDC token that Vercel attaches to every function request as the
//    `x-vercel-oidc-token` header (newer stores). We pass that header's token to the SDK explicitly.
const blobConfigured = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

export interface BlobCreds {
  oidcToken?: string;
  storeId?: string;
}
export function credsFrom(req?: Request): BlobCreds {
  const oidcToken = req?.headers.get('x-vercel-oidc-token')?.trim();
  const storeId = process.env.BLOB_STORE_ID?.trim();
  return oidcToken && storeId ? { oidcToken, storeId } : {};
}

const blobStorage = (c: BlobCreds): Storage => ({
  async read(path, fresh = true) {
    const r = await get(path, { access: 'private', useCache: !fresh, ...c });
    if (!r || r.statusCode !== 200) return null;
    const body = new Uint8Array(await new Response(r.stream).arrayBuffer());
    return { body, type: r.blob.contentType, etag: r.blob.etag };
  },
  async stat(path) {
    try {
      const h = await head(path, c);
      return { path: h.pathname, etag: h.etag, size: h.size, at: new Date(h.uploadedAt).getTime() };
    } catch (e) {
      if (e instanceof BlobNotFoundError) return null;
      throw e;
    }
  },
  async write(path, body, type, ifMatch) {
    try {
      const r = await put(path, new Blob([body], { type }), {
        access: 'private',
        contentType: type,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        ...(ifMatch ? { ifMatch } : {}),
        ...c,
      });
      return { etag: r.etag };
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) throw new Conflict();
      throw e;
    }
  },
  async remove(path) {
    await del(path, c);
  },
  async listPrefix(prefix) {
    const out: FileStat[] = [];
    let cursor: string | undefined;
    do {
      const r = await list({ prefix, cursor, limit: 1000, ...c });
      for (const b of r.blobs) out.push({ path: b.pathname, etag: b.etag, size: b.size, at: new Date(b.uploadedAt).getTime() });
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return out;
  },
});

let override: Storage | null = null;
export function setStorage(s: Storage | null) {
  override = s;
}
/** Pass the incoming request so its OIDC token (if any) is used for the Blob calls. */
export function storage(req?: Request): Storage {
  if (override) return override;
  if (!blobConfigured()) throw new NotConfigured();
  return blobStorage(credsFrom(req));
}
export function storageConfigured() {
  return !!override || blobConfigured();
}

// ------------------------------------------------------------------ layout of the store
export const ROOT = 'v1';
export const projectPath = (id: string) => `${ROOT}/projects/${id}.json`;
export const INDEX_PATH = `${ROOT}/index.json`;
export const filePath = (id: string) => `${ROOT}/files/${id}`;
export const validId = (id: string | null): id is string => !!id && /^[A-Za-z0-9_-]{1,80}$/.test(id);

export interface IndexEntry {
  id: string;
  name: string;
}

const dec = new TextDecoder();
const enc = new TextEncoder();

export async function readIndex(s: Storage): Promise<{ list: IndexEntry[]; etag?: string }> {
  const f = await s.read(INDEX_PATH);
  if (!f) return { list: [] };
  try {
    const d = JSON.parse(dec.decode(f.body));
    return { list: Array.isArray(d?.list) ? d.list : [], etag: f.etag };
  } catch {
    return { list: [], etag: f.etag };
  }
}

/** Read-modify-write of the small name index with optimistic concurrency. */
export async function updateIndex(s: Storage, fn: (list: IndexEntry[]) => IndexEntry[] | null) {
  for (let i = 0; i < 4; i++) {
    const { list, etag } = await readIndex(s);
    const next = fn(list.map((x) => ({ ...x })));
    if (!next) return;
    try {
      await s.write(INDEX_PATH, enc.encode(JSON.stringify({ list: next })), 'application/json', etag);
      return;
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
    }
  }
}
