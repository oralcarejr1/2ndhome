import type { Project, Version } from '../types';

// Three-way merge for when two devices edited the same project between syncs.
// base = the server copy this device last synced (null if it never synced this project).
// Rule per layout version: whichever side changed wins; if both changed, the server's stays and this
// device's edit is kept as an extra version "(이 기기 사본)" — nothing is silently dropped.

const SKIP = new Set(['thumb', 'updatedAt']);
const canon = (x: unknown) => JSON.stringify(x, (k, v) => (SKIP.has(k) ? undefined : v));
const same = (a: unknown, b: unknown) => canon(a) === canon(b);

let n = 0;
const copyId = () => 'v' + Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 6);

function mergeById<T extends { id: string }>(base: T[] | undefined, local: T[], remote: T[]): T[] {
  const b = new Map((base ?? []).map((x) => [x.id, x]));
  const l = new Map(local.map((x) => [x.id, x]));
  const out: T[] = [];
  for (const r of remote) {
    const li = l.get(r.id);
    const bi = b.get(r.id);
    if (!li) {
      // deleted on this device? keep only if the server changed it since
      if (bi && same(bi, r)) continue;
      out.push(r);
    } else out.push(bi && same(bi, r) ? li : r);
  }
  const rIds = new Set(remote.map((x) => x.id));
  for (const li of local) {
    if (rIds.has(li.id)) continue;
    const bi = b.get(li.id);
    if (bi && same(bi, li)) continue; // deleted on the server, untouched here
    out.push(li);
  }
  return out;
}

export function merge3(base: Project | null, local: Project, remote: Project): { merged: Project; copies: number } {
  let copies = 0;
  const bV = new Map((base?.versions ?? []).map((v) => [v.id, v]));
  const lV = new Map(local.versions.map((v) => [v.id, v]));
  const versions: Version[] = [];
  for (const r of remote.versions) {
    const l = lV.get(r.id);
    const b = bV.get(r.id);
    if (!l) {
      if (b && same(b, r)) continue; // this device deleted it
      versions.push(r);
      continue;
    }
    if (same(l, r)) versions.push(r.thumb || !l.thumb ? r : { ...r, thumb: l.thumb });
    else if (b && same(b, r)) versions.push(l);
    else if (b && same(b, l)) versions.push(r);
    else {
      versions.push(r);
      versions.push({ ...l, id: copyId(), name: `${l.name} (이 기기 사본)` });
      copies++;
    }
  }
  const rIds = new Set(remote.versions.map((v) => v.id));
  for (const l of local.versions) {
    if (rIds.has(l.id)) continue;
    const b = bV.get(l.id);
    if (b && same(b, l)) continue; // deleted on the other device, untouched here
    versions.push(l);
  }
  if (!versions.length) versions.push(...remote.versions, ...local.versions.slice(0, 1));

  const pick = <K extends keyof Project>(k: K): Project[K] => {
    if (!base) return remote[k];
    if (same(local[k], base[k])) return remote[k];
    if (same(remote[k], base[k])) return local[k];
    return remote[k];
  };

  const merged: Project = {
    ...remote,
    name: pick('name'),
    plan: pick('plan'),
    profiles: pick('profiles'),
    activeProfileId: pick('activeProfileId'),
    info: pick('info'),
    moveIn: pick('moveIn'),
    budget: pick('budget'),
    shortlist: [
      ...new Set([
        ...remote.shortlist.filter((id) => local.shortlist.includes(id) || !base?.shortlist.includes(id)),
        ...local.shortlist.filter((id) => remote.shortlist.includes(id) || !base?.shortlist.includes(id)),
      ]),
    ],
    moodboard: mergeById(base?.moodboard, local.moodboard, remote.moodboard),
    customProducts: mergeById(base?.customProducts, local.customProducts, remote.customProducts),
    versions,
    activeVersionId: versions.some((v) => v.id === local.activeVersionId) ? local.activeVersionId : versions[0].id,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt) + 1,
  };
  return { merged, copies };
}

// Content equality that ignores generated ids, timestamps and thumbnails — used to tell
// "untouched starting data" apart from real edits on a device that never synced before.
const VOLATILE = /^(id|thumb|updatedAt|createdAt|activeVersionId|activeProfileId|personId|groupId|parentId)$/;
export function contentKey(p: Project) {
  return JSON.stringify(p, (k, v) => (VOLATILE.test(k) ? undefined : v));
}
export function sameContent(a: Project, b: Project) {
  return contentKey(a) === contentKey(b);
}
