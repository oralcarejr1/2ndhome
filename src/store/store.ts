import { produce, setAutoFreeze } from 'immer';
import { create } from 'zustand';
import { ALL_BUILTIN, defaultElev, defaultMount } from '../catalog/products';
import { blankProject, sampleProject } from '../catalog/seed';
import { localToWorld, uid } from '../lib/geometry';
import type { AppMode, PersonProfile, PlacedItem, PlacedPerson, Pose, Product, Project, Version, ViewMode } from '../types';
import { merge3, sameContent } from './merge';
import {
  applyBlobMap,
  cloudDeleteProject,
  cloudGetProject,
  cloudListProjects,
  cloudSaveProject,
  delSync,
  getSync,
  initCloud,
  localDeleteProject,
  localListProjects,
  localSaveProject,
  markDirty,
  peekSync,
  setServerFiles,
  setSync,
  uploadLocalBlobs,
} from './persistence';
import { serverLogout, serverSession, setOnAuthLost, srvDelete, srvGet, srvList, srvPut, srvStat } from './server';

setAutoFreeze(false);

export interface ShowOpts {
  dims: boolean;
  clearance: boolean;
  heatmap: boolean;
  labels: boolean;
  people: boolean;
  grid: boolean;
  walls: 'auto' | 'full' | 'low' | 'hidden';
  ceiling: boolean;
  collisions: boolean;
}

export interface SnapOpts {
  grid: number;
  walls: boolean;
  objects: boolean;
  angle: number;
}

interface State {
  ready: boolean;
  project: Project | null;
  projectList: { id: string; name: string; t: number }[];
  mode: AppMode;
  view: ViewMode;
  selection: string[];
  placing: { productId: string; params?: PlacedItem['params']; dims?: PlacedItem['dims'] } | null;
  placingPerson: Pose | null;
  measure: boolean;
  show: ShowOpts;
  snap: SnapOpts;
  past: Project[];
  future: Project[];
  saveState: 'saved' | 'saving' | 'error';
  cloud: 'off' | 'on' | 'connecting';
  /** where projects live: this device only, the claude.ai account, or the password-protected server */
  sync: 'local' | 'artifact' | 'server' | 'server-nostore';
  /** password screen: shown when the server says this device isn't signed in */
  gate: 'checking' | 'login' | 'open';
  toast: { msg: string; t: number } | null;
  panel: string; // right panel tab
  leftOpen: boolean;
  rightOpen: boolean;
  compareIds: string[];
  shotRequest: number;
  // ---- actions
  init: () => Promise<void>;
  logout: () => Promise<void>;
  setMode: (m: AppMode) => void;
  setView: (v: ViewMode) => void;
  setPanel: (p: string) => void;
  setShow: (p: Partial<ShowOpts>) => void;
  setSnap: (p: Partial<SnapOpts>) => void;
  notify: (msg: string) => void;
  /** quiet = automatic change (thumbnail) that alone shouldn't count as an edit to upload */
  mutate: (fn: (p: Project) => void, history?: boolean, quiet?: boolean) => void;
  mutateVersion: (fn: (v: Version, p: Project) => void, history?: boolean) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[], additive?: boolean) => void;
  startPlacing: (productId: string, extra?: { params?: PlacedItem['params']; dims?: PlacedItem['dims'] }) => void;
  cancelPlacing: () => void;
  addItem: (productId: string, x: number, z: number, extra?: Partial<PlacedItem>) => string;
  updateItems: (ids: string[], fn: (it: PlacedItem) => void, history?: boolean) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  addPerson: (pose: Pose, x: number, z: number, y?: number) => void;
  setActiveVersion: (id: string) => void;
  newVersion: (name: string, fromId?: string) => void;
  deleteVersion: (id: string) => void;
  switchProject: (id: string) => Promise<void>;
  newProject: (name: string, kind: 'blank' | 'copy') => void;
  deleteProject: (id: string) => void;
  importProject: (p: Project) => void;
  upsertProduct: (p: Product) => void;
  setProfiles: (fn: (ps: PersonProfile[]) => void) => void;
  requestShot: () => void;
}

export const productIndex = new Map<string, Product>(ALL_BUILTIN.map((p) => [p.id, p]));
const CATALOG_IDS = new Set(ALL_BUILTIN.map((p) => p.id));

/** Make every home's own products (its customProducts) resolvable, so an older copy of a project
 *  that lacks a definition still finds it — e.g. after restoring that home's backup file. */
export function registerProducts(projects: Project[]) {
  for (const p of projects) for (const c of p.customProducts ?? []) if (!productIndex.has(c.id)) productIndex.set(c.id, c);
}

/** Copy definitions a project uses but doesn't carry (found via registerProducts) into the project. */
export function withOwnProducts(p: Project): Project {
  const own = new Set(p.customProducts.map((c) => c.id));
  const used = new Set<string>(p.shortlist);
  for (const v of p.versions) for (const i of v.items) [i.productId, ...(i.alts ?? [])].forEach((id) => used.add(id));
  const add: Product[] = [];
  for (const id of used) {
    if (own.has(id) || CATALOG_IDS.has(id)) continue;
    const c = productIndex.get(id);
    if (c) add.push(c);
  }
  return add.length ? { ...p, customProducts: [...p.customProducts, ...add] } : p;
}

export function getProduct(id: string, project?: Project | null): Product | undefined {
  const c = project?.customProducts.find((p) => p.id === id);
  return c ?? productIndex.get(id);
}

export function syncText(sync: State['sync']): { shared: boolean; short: string; long: string } {
  if (sync === 'server') return { shared: true, short: '서버에 동기화', long: '서버에 저장 — 비밀번호로 들어온 모든 기기에서 같은 내용이 보여요' };
  if (sync === 'artifact') return { shared: true, short: '계정에 동기화', long: '계정에 저장 — 다른 기기에서도 보여요' };
  if (sync === 'server-nostore') return { shared: false, short: '이 기기에만 저장', long: '서버 저장소(Vercel Blob)가 아직 연결되지 않아 이 브라우저에만 저장돼요' };
  return { shared: false, short: '이 브라우저에 저장', long: '이 브라우저에 저장 — 백업은 버전저장 탭에서' };
}

export function activeVersion(p: Project | null): Version | null {
  if (!p) return null;
  return p.versions.find((v) => v.id === p.activeVersionId) ?? p.versions[0] ?? null;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let editPending = false;

// ---- server sync state (module level: one engine per page)
let serverOn = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushFirstAt = 0;
let pushing = false;
let pushAgain = false;
let lastFullSync = 0;
let initStarted = false;

export const useStore = create<State>((set, get) => {
  const persist = (quiet = false) => {
    if (!quiet) editPending = true;
    if (saveTimer) clearTimeout(saveTimer);
    set({ saveState: 'saving' });
    saveTimer = setTimeout(() => void saveNow(), 700);
  };
  /** Write pending changes of the open project now (before switching projects). */
  const flushLocal = async () => {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    await saveNow();
  };
  const saveNow = async () => {
    saveTimer = null;
    const p = get().project;
    if (!p) return;
    const edited = editPending;
    editPending = false;
    const okLocal = await localSaveProject(p);
    if (edited) await markDirty(p.id);
    const list = upsertList(get().projectList, p);
    set({ projectList: list });
    if (serverOn) {
      if (peekSync(p.id)?.dirty) schedulePush();
      else set({ saveState: okLocal ? 'saved' : 'error' });
      return;
    }
    const r = await cloudSaveProject(p, list);
    set({ saveState: r === 'error' || (!okLocal && r === 'off') ? 'error' : 'saved' });
  };

  // ------------------------------------------------------------ server sync engine
  const schedulePush = (now = false) => {
    if (!serverOn) return;
    if (pushTimer) clearTimeout(pushTimer);
    const t = Date.now();
    if (!pushFirstAt) pushFirstAt = t;
    // batch edits: 2.5 s after the last change, at most 15 s after the first
    const wait = now ? 0 : Math.max(0, Math.min(2500, pushFirstAt + 15000 - t));
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushFirstAt = 0;
      void pushCurrent();
    }, wait);
  };

  /** Replace the open project with a newer copy (from the server) without touching undo of others. */
  const adopt = (p: Project) => {
    registerProducts([p]);
    if (get().project?.id !== p.id) return;
    open(p);
  };

  /** Show a project; fills in product definitions it was missing (that counts as an edit to sync). */
  const open = (p: Project) => {
    const q = withOwnProducts(p);
    set({ project: q, past: [], future: [], selection: [] });
    if (q !== p) persist();
  };

  /** A device that never synced this project has its own copy (data from before sign-in / sync).
   *  Untouched starting data → take the server copy. Real edits → keep them as a separate project. */
  const adoptOrFork = async (loc: Project, remote: { project: Project; etag: string }) => {
    await localSaveProject(remote.project);
    await setSync(remote.project.id, { etag: remote.etag, dirty: false, base: remote.project });
    if (!sameContent(loc, remote.project) && !sameContent(loc, sampleProject())) {
      const copy: Project = { ...loc, id: uid('prj'), name: `${loc.name} (이 기기에 있던 내용)` };
      await localSaveProject(copy);
      await markDirty(copy.id);
      await pushProject(copy);
      set({ projectList: upsertList(get().projectList, copy) });
      try {
        localStorage.setItem('2ndhome:last', remote.project.id); // stay on the shared project
      } catch {
        /* ignore */
      }
      get().notify(`이 기기에만 있던 수정은 "${copy.name}" 프로젝트로 따로 남겼어요`);
    }
    adopt(remote.project);
  };

  /** Upload one project. On a conflict, merge with the server copy and upload the merge. */
  const pushProject = async (p: Project): Promise<'ok' | 'merged' | 'error'> => {
    const map = await uploadLocalBlobs(p);
    if (map.size) {
      p = applyBlobMap(p, map);
      await localSaveProject(p);
      const cur = get().project;
      if (cur?.id === p.id) set({ project: applyBlobMap(cur, map) });
    }
    const meta = await getSync(p.id);
    const r = await srvPut(p, meta?.etag || 'none');
    if (r.ok) {
      await setSync(p.id, { etag: r.etag, dirty: false, base: p });
      return 'ok';
    }
    if (!r.conflict) return 'error';
    const remote = await srvGet(p.id);
    if (!remote) {
      // gone from the server (deleted elsewhere) while edited here → put it back
      const r2 = await srvPut(p, 'none');
      if (!r2.ok) return 'error';
      await setSync(p.id, { etag: r2.etag, dirty: false, base: p });
      return 'ok';
    }
    if (!meta?.etag || !meta.base) {
      await adoptOrFork(p, remote);
      return 'merged';
    }
    const { merged, copies } = merge3(meta.base, p, remote.project);
    const r3 = await srvPut(merged, remote.etag);
    if (!r3.ok) return 'error';
    await setSync(p.id, { etag: r3.etag, dirty: false, base: merged });
    await localSaveProject(merged);
    const cur = get().project;
    if (cur?.id === p.id) {
      // edits made while this was in flight are merged on top
      if (cur !== p && JSON.stringify(cur) !== JSON.stringify(p)) {
        const again = merge3(p, cur, merged).merged;
        set({ project: again });
        await markDirty(p.id);
        pushAgain = true;
      } else adopt(merged);
    }
    set({ projectList: upsertList(get().projectList, merged) });
    get().notify(
      copies
        ? `다른 기기에서 같은 배치를 고쳐서 둘 다 남겼어요 — 이 기기 수정본은 "(이 기기 사본)" 버전으로 저장됐어요`
        : '다른 기기에서 바뀐 내용과 합쳤어요',
    );
    return 'merged';
  };

  const pushCurrent = async () => {
    if (!serverOn) return;
    if (pushing) {
      pushAgain = true;
      return;
    }
    const p = get().project;
    if (!p) return;
    pushing = true;
    set({ saveState: 'saving' });
    const sent = JSON.stringify(p);
    let res: 'ok' | 'merged' | 'error' = 'error';
    try {
      res = await pushProject(p);
    } catch {
      res = 'error';
    }
    pushing = false;
    const cur = get().project;
    const changed = !!cur && cur.id === p.id && JSON.stringify(cur) !== sent && res === 'ok';
    if (changed) await markDirty(p.id);
    set({ saveState: res === 'error' ? 'error' : 'saved' });
    if (res === 'error') {
      // offline or server hiccup: edits stay on this device (marked dirty) and are retried
      setTimeout(() => peekSync(p.id)?.dirty && schedulePush(true), 20000);
      return;
    }
    if (pushAgain || changed) {
      pushAgain = false;
      schedulePush();
    }
  };

  /** Two-way reconcile of every project with the server. Returns false when unreachable. */
  const syncAll = async (): Promise<boolean> => {
    const remote = await srvList();
    if (!remote) return false;
    lastFullSync = Date.now();
    const locals = await localListProjects();
    const rIds = new Set(remote.map((r) => r.id));
    for (const r of remote) {
      const loc = locals.find((l) => l.id === r.id);
      const m = await getSync(r.id);
      if (loc && !m?.etag) {
        const g0 = await srvGet(r.id);
        if (g0) await adoptOrFork(loc, g0);
        continue;
      }
      if (loc && m?.dirty) {
        await pushProject(loc);
        continue;
      }
      if (loc && m?.etag === r.etag) continue;
      const g = await srvGet(r.id);
      if (!g) continue;
      await localSaveProject(g.project);
      await setSync(r.id, { etag: g.etag, dirty: false, base: g.project });
      adopt(g.project);
    }
    for (const loc of locals) {
      if (rIds.has(loc.id)) continue;
      const m = await getSync(loc.id);
      if (m?.etag && !m.dirty) {
        // deleted on another device
        await localDeleteProject(loc.id);
        await delSync(loc.id);
        continue;
      }
      await pushProject(loc);
    }
    const all = await localListProjects();
    set({ projectList: all.map((p) => ({ id: p.id, name: p.name, t: p.updatedAt })).sort((a, b) => b.t - a.t) });
    const cur = get().project;
    if (cur && !all.some((p) => p.id === cur.id)) {
      if (all.length) await get().switchProject(all.sort((a, b) => b.updatedAt - a.updatedAt)[0].id);
    }
    return true;
  };

  /** Called when the tab comes back / periodically: pick up edits made on other devices. */
  const pullRemote = async (full: boolean) => {
    const p = get().project;
    if (!serverOn || !p || pushing || pushTimer || saveTimer || peekSync(p.id)?.dirty) return;
    if (full && Date.now() - lastFullSync > 60000) {
      await syncAll();
      return;
    }
    const etag = await srvStat(p.id);
    if (etag === null) return;
    const m = await getSync(p.id);
    if (etag === '' || etag === m?.etag) return;
    const g = await srvGet(p.id);
    if (!g || get().project?.id !== p.id || peekSync(p.id)?.dirty || saveTimer) return;
    await localSaveProject(g.project);
    await setSync(p.id, { etag: g.etag, dirty: false, base: g.project });
    adopt(g.project);
    set({ projectList: upsertList(get().projectList, g.project) });
    get().notify('다른 기기에서 바뀐 내용을 불러왔어요');
  };

  const startServerWatch = () => {
    if (typeof window === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState === 'visible') void pullRemote(true);
      else if (pushTimer) schedulePush(true); // leaving the tab: send pending edits now
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', () => void pullRemote(true));
    window.addEventListener('online', () => {
      const p = get().project;
      if (p && peekSync(p.id)?.dirty) schedulePush(true);
      void pullRemote(true);
    });
    setInterval(() => document.visibilityState === 'visible' && void pullRemote(false), 90000);
  };

  const upsertList = (list: State['projectList'], p: Project) => {
    const others = list.filter((x) => x.id !== p.id);
    return [{ id: p.id, name: p.name, t: p.updatedAt }, ...others].sort((a, b) => b.t - a.t);
  };

  const commit = (next: Project, history: boolean, quiet = false) => {
    const prev = get().project;
    next.updatedAt = Date.now();
    if (history && prev) {
      const past = [...get().past, prev].slice(-120);
      set({ project: next, past, future: [] });
    } else set({ project: next });
    persist(quiet);
  };

  return {
    ready: false,
    project: null,
    projectList: [],
    mode: 'layout',
    view: '3d',
    selection: [],
    placing: null,
    placingPerson: null,
    measure: false,
    show: { dims: true, clearance: false, heatmap: false, labels: true, people: true, grid: false, walls: 'auto', ceiling: false, collisions: true },
    snap: { grid: 1, walls: true, objects: true, angle: 15 },
    past: [],
    future: [],
    saveState: 'saved',
    cloud: 'connecting',
    sync: 'local',
    gate: 'checking',
    toast: null,
    panel: 'inspect',
    leftOpen: true,
    rightOpen: true,
    compareIds: [],
    shotRequest: 0,

    init: async () => {
      if (initStarted) return; // once per page (React StrictMode runs effects twice in dev)
      initStarted = true;
      // Signed-in check first when this is the server deployment (not inside a claude.ai artifact).
      const inArtifact = typeof window !== 'undefined' && !!window.claude;
      const srv = inArtifact ? null : await serverSession();
      if (srv?.configured && !srv.auth) {
        set({ gate: 'login' });
        return;
      }
      set({ gate: 'open' });
      setOnAuthLost(() => set({ gate: 'login' }));
      if (srv?.auth && srv.storage) {
        serverOn = true;
        setServerFiles(true);
        set({ sync: 'server', cloud: 'on' });
        await syncAll(); // pull before showing anything, so every device opens on the same content
        startServerWatch();
      } else if (srv?.auth) set({ sync: 'server-nostore' });
      let locals = await localListProjects();
      if (!locals.length) {
        const s = sampleProject();
        await localSaveProject(s);
        locals = [s];
      }
      locals.sort((a, b) => b.updatedAt - a.updatedAt);
      let lastId: string | null = null;
      try {
        lastId = localStorage.getItem('2ndhome:last');
      } catch {
        lastId = null;
      }
      registerProducts(locals);
      const stored = locals.find((p) => p.id === lastId) ?? locals[0];
      const first = withOwnProducts(stored);
      set({
        ready: true,
        project: first,
        projectList: locals.map((p) => ({ id: p.id, name: p.name, t: p.updatedAt })).sort((a, b) => b.t - a.t),
      });
      if (first !== stored) persist();
      if (serverOn) {
        if (peekSync(first.id)?.dirty || !peekSync(first.id)?.etag) schedulePush(true); // freshly seeded
        return;
      }
      if (srv) {
        set({ cloud: 'off' });
        if (srv.auth && !srv.storage) get().notify('서버 저장소(Vercel Blob)가 아직 연결되지 않아 이 기기에만 저장돼요');
        return;
      }
      // account sync
      const c = await initCloud();
      if (!c) {
        set({ cloud: 'off' });
        return;
      }
      set({ cloud: 'on', sync: 'artifact' });
      const remote = await cloudListProjects();
      let list = get().projectList;
      for (const r of remote) {
        const loc = locals.find((p) => p.id === r.id);
        if (!loc || r.t > loc.updatedAt) {
          const rp = await cloudGetProject(r.id);
          if (rp) {
            await localSaveProject(rp);
            list = upsertList(list, rp);
            if (get().project?.id === rp.id && rp.updatedAt > (get().project?.updatedAt ?? 0)) set({ project: rp, past: [], future: [] });
          }
        }
      }
      set({ projectList: list });
      // push local-only or newer projects
      for (const loc of locals) {
        const r = remote.find((x) => x.id === loc.id);
        if (!r || loc.updatedAt > r.t) await cloudSaveProject(loc, get().projectList);
      }
      if (remote.length && !locals.some((l) => l.id === get().project?.id)) {
        await get().switchProject(remote[0].id);
      }
    },

    logout: async () => {
      await serverLogout();
      location.reload();
    },

    setMode: (m) => set({ mode: m, placing: null, measure: false }),
    setView: (v) => set({ view: v }),
    setPanel: (p) => set({ panel: p, rightOpen: true }),
    setShow: (p) => set({ show: { ...get().show, ...p } }),
    setSnap: (p) => set({ snap: { ...get().snap, ...p } }),
    notify: (msg) => set({ toast: { msg, t: Date.now() } }),

    mutate: (fn, history = true, quiet = false) => {
      const p = get().project;
      if (!p) return;
      const next = produce(p, (d) => {
        fn(d);
      });
      commit(next, history, quiet);
    },
    mutateVersion: (fn, history = true) => {
      get().mutate((p) => {
        const v = p.versions.find((x) => x.id === p.activeVersionId) ?? p.versions[0];
        if (v) {
          fn(v, p);
          v.updatedAt = Date.now();
        }
      }, history);
    },
    checkpoint: () => {
      const p = get().project;
      if (p) set({ past: [...get().past, p].slice(-120), future: [] });
    },
    undo: () => {
      const { past, project, future } = get();
      if (!past.length || !project) return;
      const prev = past[past.length - 1];
      set({ project: prev, past: past.slice(0, -1), future: [project, ...future].slice(0, 120) });
      persist();
    },
    redo: () => {
      const { past, project, future } = get();
      if (!future.length || !project) return;
      set({ project: future[0], past: [...past, project], future: future.slice(1) });
      persist();
    },
    select: (ids, additive) => {
      const cur = get().selection;
      if (additive) {
        const s = new Set(cur);
        for (const id of ids) s.has(id) ? s.delete(id) : s.add(id);
        set({ selection: [...s], panel: 'inspect' });
      } else set({ selection: ids, panel: ids.length ? 'inspect' : get().panel });
    },
    startPlacing: (productId, extra) => set({ placing: { productId, ...extra }, placingPerson: null, measure: false, mode: 'layout' }),
    cancelPlacing: () => set({ placing: null, placingPerson: null }),
    addItem: (productId, x, z, extra = {}) => {
      const p = get().project;
      const prod = getProduct(productId, p);
      const id = uid('i');
      if (!p || !prod) return id;
      const y = extra.y ?? defaultElev(prod, p.plan.ceiling);
      get().mutateVersion((v) => {
        v.items.push({ id, productId, x, z, y, rot: 0, status: 'candidate', ...extra });
      });
      set({ selection: [id], panel: 'inspect' });
      void defaultMount;
      return id;
    },
    updateItems: (ids, fn, history = true) => {
      const s = new Set(ids);
      get().mutateVersion((v) => {
        for (const it of v.items) if (s.has(it.id)) fn(it);
        for (const h of v.people) if (s.has(h.id)) fn(h as unknown as PlacedItem);
      }, history);
    },
    removeSelected: () => {
      const s = new Set(get().selection);
      if (!s.size) return;
      const v = activeVersion(get().project);
      const lockedCount = v?.items.filter((i) => s.has(i.id) && i.locked).length ?? 0;
      get().mutateVersion((v) => {
        v.items = v.items.filter((i) => !s.has(i.id) || i.locked);
        v.people = v.people.filter((h) => !s.has(h.id));
      });
      set({ selection: [] });
      if (lockedCount) get().notify('고정(🔒)된 항목은 삭제되지 않았어요. 고정을 풀고 지우세요.');
    },
    duplicateSelected: () => {
      const s = new Set(get().selection);
      const newIds: string[] = [];
      get().mutateVersion((v) => {
        const gmap = new Map<string, string>();
        for (const it of v.items.filter((i) => s.has(i.id))) {
          const c: PlacedItem = JSON.parse(JSON.stringify(it));
          c.id = uid('i');
          const [nx, nz] = localToWorld(it.x, it.z, it.rot, 20, 20);
          c.x = nx;
          c.z = nz;
          c.locked = false;
          if (it.groupId) {
            if (!gmap.has(it.groupId)) gmap.set(it.groupId, uid('g'));
            c.groupId = gmap.get(it.groupId);
          }
          v.items.push(c);
          newIds.push(c.id);
        }
        for (const h of v.people.filter((x) => s.has(x.id))) {
          const c: PlacedPerson = { ...h, id: uid('h'), x: h.x + 30, z: h.z + 30 };
          v.people.push(c);
          newIds.push(c.id);
        }
      });
      set({ selection: newIds });
    },
    addPerson: (pose, x, z, y = 0) => {
      const p = get().project;
      if (!p) return;
      const id = uid('h');
      get().mutateVersion((v) => {
        v.people.push({ id, profileId: p.activeProfileId, x, z, y, rot: 0, pose });
      });
      set({ selection: [id], placingPerson: null, panel: 'inspect' });
    },
    setActiveVersion: (id) => {
      get().mutate((p) => {
        p.activeVersionId = id;
      }, false);
      set({ selection: [], past: [], future: [] });
    },
    newVersion: (name, fromId) => {
      const p = get().project;
      if (!p) return;
      const blank = fromId === '__none__';
      const src = p.versions.find((v) => v.id === (blank ? p.activeVersionId : (fromId ?? p.activeVersionId)));
      const id = uid('v');
      get().mutate((d) => {
        const now = Date.now();
        const base: Version = src
          ? JSON.parse(JSON.stringify(src))
          : { id, name, notes: '', createdAt: now, updatedAt: now, items: [], people: [], finishes: JSON.parse(JSON.stringify(d.versions[0].finishes)) };
        base.id = id;
        base.name = name;
        base.createdAt = now;
        base.updatedAt = now;
        if (src) base.items = base.items.filter((i) => !blank || i.locked).map((i) => ({ ...i, id: uid('i') }));
        if (blank) {
          base.people = [];
          base.notes = '';
          base.thumb = undefined;
        }
        d.versions.push(base);
        d.activeVersionId = id;
      });
      set({ selection: [] });
    },
    deleteVersion: (id) => {
      const p = get().project;
      if (!p || p.versions.length <= 1) return;
      get().mutate((d) => {
        d.versions = d.versions.filter((v) => v.id !== id);
        if (d.activeVersionId === id) d.activeVersionId = d.versions[0].id;
      });
    },
    switchProject: async (id) => {
      await flushLocal();
      const prev = get().project;
      if (serverOn && prev && prev.id !== id && peekSync(prev.id)?.dirty) {
        if (pushTimer) {
          clearTimeout(pushTimer);
          pushTimer = null;
          pushFirstAt = 0;
        }
        await pushProject(prev).catch(() => 'error');
      }
      const locals = await localListProjects();
      let p = locals.find((x) => x.id === id) ?? null;
      if (serverOn) {
        const m = await getSync(id);
        if (!m?.dirty) {
          const etag = await srvStat(id);
          if (etag && etag !== m?.etag) {
            const g = await srvGet(id);
            if (g) {
              await localSaveProject(g.project);
              await setSync(id, { etag: g.etag, dirty: false, base: g.project });
              p = g.project;
            }
          }
        }
      } else {
        const remote = await cloudGetProject(id);
        if (remote && (!p || remote.updatedAt > p.updatedAt)) p = remote;
      }
      if (!p) return;
      try {
        localStorage.setItem('2ndhome:last', id);
      } catch {
        /* ignore */
      }
      open(p);
    },
    newProject: (name, kind) => {
      const cur = get().project;
      const p: Project = kind === 'copy' && cur ? { ...(JSON.parse(JSON.stringify(cur)) as Project), id: uid('prj'), name, createdAt: Date.now() } : blankProject(name);
      set({ project: p, selection: [], past: [], future: [], mode: kind === 'blank' ? 'plan' : 'layout' });
      try {
        localStorage.setItem('2ndhome:last', p.id);
      } catch {
        /* ignore */
      }
      persist();
    },
    deleteProject: (id) => {
      const list = get().projectList.filter((x) => x.id !== id);
      set({ projectList: list });
      void localDeleteProject(id);
      if (serverOn)
        void srvDelete(id).then((ok) => {
          if (ok) void delSync(id);
        });
      else void cloudDeleteProject(id, list);
      if (get().project?.id === id) {
        if (list.length) void get().switchProject(list[0].id);
        else get().newProject('새 집', 'blank');
      }
    },
    importProject: (p) => {
      const q = { ...p, id: get().projectList.some((x) => x.id === p.id) ? uid('prj') : p.id, updatedAt: Date.now() };
      registerProducts([q]);
      set({ project: withOwnProducts(q), selection: [], past: [], future: [] });
      persist();
    },
    upsertProduct: (prod) => {
      get().mutate((p) => {
        const i = p.customProducts.findIndex((x) => x.id === prod.id);
        if (i >= 0) p.customProducts[i] = prod;
        else p.customProducts.push(prod);
      });
    },
    setProfiles: (fn) => {
      get().mutate((p) => fn(p.profiles));
    },
    requestShot: () => set({ shotRequest: Date.now() }),
  };
});

// Remember last project
useStore.subscribe((s, prev) => {
  if (s.project?.id && s.project.id !== prev.project?.id) {
    try {
      localStorage.setItem('2ndhome:last', s.project.id);
    } catch {
      /* ignore */
    }
  }
});

export function useProject() {
  return useStore((s) => s.project);
}
export function useVersion() {
  return useStore((s) => activeVersion(s.project));
}
