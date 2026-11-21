import { createStore, del, get, keys, set } from 'idb-keyval';
import type { Project } from '../types';
import { SERVER_FILE_MAX, srvFileUrl, srvUpload } from './server';

// Layers:
//  1. IndexedDB on this device (always; works on any static host, and offline).
//  2. Either the password-protected server (Vercel deployment: api/*, private Blob store) — one shared
//     copy for every device — or, when opened as a claude.ai artifact, that account's `db`/`assets`.
// Every remote call is wrapped so a blocked storage never breaks the app.

let projStore: ReturnType<typeof createStore> | null = null;
let blobStore: ReturnType<typeof createStore> | null = null;
let syncStore: ReturnType<typeof createStore> | null = null;
function stores() {
  if (!projStore) {
    try {
      projStore = createStore('2ndhome-projects', 'projects');
      blobStore = createStore('2ndhome-blobs', 'blobs');
      syncStore = createStore('2ndhome-sync', 'meta');
    } catch {
      projStore = null;
      blobStore = null;
      syncStore = null;
    }
  }
  return { projStore, blobStore, syncStore };
}

// ---------------------------------------------------------------- server sync bookkeeping (per device)
/** etag = server version this device last synced; dirty = local edits not on the server yet;
 *  base = that synced copy (for three-way merges). */
export interface SyncMeta {
  etag: string;
  dirty: boolean;
  base: Project | null;
}
const metaCache = new Map<string, SyncMeta>();

export async function getSync(id: string): Promise<SyncMeta | undefined> {
  if (metaCache.has(id)) return metaCache.get(id);
  const { syncStore } = stores();
  try {
    const m = syncStore ? await get<SyncMeta>(id, syncStore) : undefined;
    if (m) metaCache.set(id, m);
    return m;
  } catch {
    return undefined;
  }
}
export function peekSync(id: string) {
  return metaCache.get(id);
}
export async function setSync(id: string, m: SyncMeta) {
  metaCache.set(id, m);
  const { syncStore } = stores();
  try {
    if (syncStore) await set(id, m, syncStore);
  } catch {
    /* memory only */
  }
}
export async function markDirty(id: string) {
  const m = (await getSync(id)) ?? { etag: '', dirty: false, base: null };
  if (!m.dirty) await setSync(id, { ...m, dirty: true });
}
export async function delSync(id: string) {
  metaCache.delete(id);
  const { syncStore } = stores();
  try {
    if (syncStore) await del(id, syncStore);
  } catch {
    /* ignore */
  }
}

let serverFiles = false;
/** Turned on once signed in to a server with storage: new images / 3D files go to the server. */
export function setServerFiles(on: boolean) {
  serverFiles = on;
}
const isLocalBlobId = (id: string) => !id.startsWith('srv:') && !id.startsWith('asset:');

const memProjects = new Map<string, Project>();
const memBlobs = new Map<string, Blob>();

export async function localListProjects(): Promise<Project[]> {
  const { projStore } = stores();
  try {
    if (!projStore) throw new Error('no idb');
    const ks = await keys(projStore);
    const out: Project[] = [];
    for (const k of ks) {
      const p = await get<Project>(k, projStore);
      if (p && p.id) out.push(p);
    }
    return out;
  } catch {
    return [...memProjects.values()];
  }
}

export async function localSaveProject(p: Project) {
  memProjects.set(p.id, p);
  const { projStore } = stores();
  try {
    if (projStore) await set(p.id, p, projStore);
    return true;
  } catch {
    return false;
  }
}

export async function localDeleteProject(id: string) {
  memProjects.delete(id);
  const { projStore } = stores();
  try {
    if (projStore) await del(id, projStore);
  } catch {
    /* ignore */
  }
}

export async function putBlob(id: string, b: Blob) {
  memBlobs.set(id, b);
  const { blobStore } = stores();
  try {
    if (blobStore) await set(id, b, blobStore);
  } catch {
    /* memory only */
  }
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  if (memBlobs.has(id)) return memBlobs.get(id);
  if (id.startsWith('srv:')) {
    try {
      const r = await fetch(srvFileUrl(id.slice(4)), { credentials: 'same-origin' });
      if (!r.ok) return undefined;
      const b = await r.blob();
      memBlobs.set(id, b);
      return b;
    } catch {
      return undefined;
    }
  }
  const { blobStore } = stores();
  try {
    if (!blobStore) return undefined;
    const b = await get<Blob>(id, blobStore);
    if (b) memBlobs.set(id, b);
    return b;
  } catch {
    return undefined;
  }
}

const urlCache = new Map<string, string>();
export async function blobUrl(id: string): Promise<string | undefined> {
  if (id.startsWith('asset:')) return '/_blob/' + id.slice(6);
  if (id.startsWith('srv:')) return srvFileUrl(id.slice(4));
  if (urlCache.has(id)) return urlCache.get(id);
  const b = await getBlob(id);
  if (!b) return undefined;
  const u = URL.createObjectURL(b);
  urlCache.set(id, u);
  return u;
}

// ---------------------------------------------------------------- cloud (artifact runtime)
interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(d: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface CloudCtx {
  uid: string;
  doc: (path: string) => DocRef;
  assets: { upload(b: Blob, o?: { type?: string }): Promise<{ id: string; url: string }> } | null;
}

let cloud: CloudCtx | null = null;
let cloudInit: Promise<CloudCtx | null> | null = null;

declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> };
  }
}

export function initCloud(): Promise<CloudCtx | null> {
  if (cloudInit) return cloudInit;
  cloudInit = (async () => {
    try {
      if (typeof window === 'undefined' || !window.claude || typeof window.claude.use !== 'function') return null;
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), 10000));
      const [db, user] = (await Promise.race([Promise.all([window.claude.use('db'), window.claude.use('user')]), timeout.then(() => [null, null])])) as [
        { doc(p: string): DocRef } | null,
        { id(): Promise<string | null> } | null,
      ];
      if (!db || !user) return null;
      const id = await user.id();
      if (!id) return null;
      let assets: CloudCtx['assets'] = null;
      try {
        assets = (await window.claude.use('assets')) as CloudCtx['assets'];
      } catch {
        assets = null;
      }
      cloud = { uid: id, doc: (p) => db.doc(p), assets };
      return cloud;
    } catch {
      return null;
    }
  })();
  return cloudInit;
}

export function cloudReady() {
  return !!cloud;
}

const base = () => `data/users/${cloud!.uid}`;

function stripForCloud(p: Project): Project {
  let json = JSON.stringify(p);
  if (json.length < 200_000) return p;
  const q: Project = { ...p, versions: p.versions.map((v) => ({ ...v, thumb: undefined })) };
  json = JSON.stringify(q);
  return q;
}

export async function cloudListProjects(): Promise<{ id: string; name: string; t: number }[]> {
  if (!cloud) return [];
  try {
    const s = await cloud.doc(`${base()}/index`).get();
    const d = s.exists ? s.data() : undefined;
    return Array.isArray(d?.list) ? (d!.list as { id: string; name: string; t: number }[]) : [];
  } catch {
    return [];
  }
}

export async function cloudGetProject(id: string): Promise<Project | null> {
  if (!cloud) return null;
  try {
    const s = await cloud.doc(`${base()}/prj_${id}`).get();
    if (!s.exists) return null;
    const d = s.data();
    if (typeof d?.json !== 'string') return null;
    return JSON.parse(d.json) as Project;
  } catch {
    return null;
  }
}

let writing = false;
let pending: { p: Project; list: { id: string; name: string; t: number }[] } | null = null;

export async function cloudSaveProject(p: Project, list: { id: string; name: string; t: number }[]): Promise<'ok' | 'error' | 'off'> {
  if (!cloud) return 'off';
  if (writing) {
    pending = { p, list };
    return 'ok';
  }
  writing = true;
  let result: 'ok' | 'error' = 'ok';
  try {
    const slim = stripForCloud(p);
    await cloud.doc(`${base()}/prj_${p.id}`).set({ json: JSON.stringify(slim), t: p.updatedAt, name: p.name });
    await cloud.doc(`${base()}/index`).set({ list, t: Date.now() });
  } catch {
    result = 'error';
  }
  writing = false;
  if (pending) {
    const n = pending;
    pending = null;
    return cloudSaveProject(n.p, n.list);
  }
  return result;
}

export async function cloudDeleteProject(id: string, list: { id: string; name: string; t: number }[]) {
  if (!cloud) return;
  try {
    await cloud.doc(`${base()}/prj_${id}`).delete();
    await cloud.doc(`${base()}/index`).set({ list, t: Date.now() });
  } catch {
    /* ignore */
  }
}

const localId = () => 'b' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

async function toServer(b: Blob): Promise<string | null> {
  if (!serverFiles || b.size > SERVER_FILE_MAX) return null;
  const sid = await srvUpload(b);
  if (!sid) return null;
  memBlobs.set('srv:' + sid, b);
  return 'srv:' + sid;
}

/** Store an image: the server or account assets when available (synced), else this device. */
export async function storeImage(b: Blob): Promise<{ id: string; synced: boolean }> {
  const s = await toServer(b);
  if (s) return { id: s, synced: true };
  if (cloud?.assets) {
    try {
      const type = b.type && b.type.startsWith('image/') ? b.type : 'image/jpeg';
      const r = await cloud.assets.upload(b, { type });
      return { id: 'asset:' + r.id, synced: true };
    } catch {
      /* fall back to local */
    }
  }
  const id = localId();
  await putBlob(id, b);
  return { id, synced: false };
}

/** Any other file (3D models): the server when signed in and small enough, else this device only. */
export async function storeFile(b: Blob): Promise<{ id: string; synced: boolean }> {
  const s = await toServer(b);
  if (s) return { id: s, synced: true };
  const id = localId();
  await putBlob(id, b);
  return { id, synced: false };
}

const tooBig = new Set<string>();
/** Upload this device's images / 3D files referenced by a project; returns old id → server id. */
export async function uploadLocalBlobs(p: Project): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const r of p.moodboard) if (r.blobId && isLocalBlobId(r.blobId)) ids.add(r.blobId);
  if (p.plan.underlay?.blobId && isLocalBlobId(p.plan.underlay.blobId)) ids.add(p.plan.underlay.blobId);
  for (const c of p.customProducts) if (c.asset?.blobId && isLocalBlobId(c.asset.blobId)) ids.add(c.asset.blobId);
  const map = new Map<string, string>();
  if (!serverFiles) return map;
  for (const id of ids) {
    if (tooBig.has(id)) continue;
    const b = await getBlob(id);
    if (!b || b.size > SERVER_FILE_MAX) {
      tooBig.add(id);
      continue;
    }
    const s = await toServer(b);
    if (s) map.set(id, s);
  }
  return map;
}

/** Same project with blob ids replaced (only touched parts are copied). */
export function applyBlobMap(p: Project, map: Map<string, string>): Project {
  if (!map.size) return p;
  const sw = (id: string) => map.get(id) ?? id;
  return {
    ...p,
    moodboard: p.moodboard.map((r) => (r.blobId && map.has(r.blobId) ? { ...r, blobId: sw(r.blobId) } : r)),
    plan: p.plan.underlay && map.has(p.plan.underlay.blobId) ? { ...p.plan, underlay: { ...p.plan.underlay, blobId: sw(p.plan.underlay.blobId) } } : p.plan,
    customProducts: p.customProducts.map((c) => (c.asset && map.has(c.asset.blobId) ? { ...c, asset: { ...c.asset, blobId: sw(c.asset.blobId) } } : c)),
  };
}

/** Downscale an image file to keep storage small. */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (s >= 1 && file.size < 1_500_000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', quality));
  } catch {
    return file;
  }
}
