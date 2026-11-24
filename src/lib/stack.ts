// Furniture standing on other furniture — a shelf or monitor on a desk, a dryer on a washer,
// a lamp on a sideboard. Plain geometry with no store or three.js imports, so the 3D view,
// the 2D plan and the store (carrying things along when their support moves) all share it.
import type { PlacedItem, Product, Vec2 } from '../types';
import { clamp, deg2rad, localToWorld, normDeg, pointInPoly, polyOverlap, worldToLocal } from './geometry';

export type Lookup = (productId: string) => Product | undefined;

/** Size used for collisions and stacking (a standing desk's top follows its current height). */
export function effectiveItemDims(it: PlacedItem, prod: Product) {
  const d = it.dims ?? prod.dims;
  let h = d.h;
  if (prod.model === 'table' && (it.params?.base ?? prod.params?.base) === 'standing') {
    h = Number(it.params?.curH ?? prod.params?.curH ?? h);
  }
  return { w: d.w, d: d.d, h };
}

export interface Body {
  it: PlacedItem;
  prod: Product;
  w: number;
  d: number;
  h: number;
  y0: number;
  y1: number;
  poly: Vec2[];
}

export function bodyOf(it: PlacedItem, prod: Product): Body {
  const { w, d, h } = effectiveItemDims(it, prod);
  const poly: Vec2[] = [
    localToWorld(it.x, it.z, it.rot, -w / 2, -d / 2),
    localToWorld(it.x, it.z, it.rot, w / 2, -d / 2),
    localToWorld(it.x, it.z, it.rot, w / 2, d / 2),
    localToWorld(it.x, it.z, it.rot, -w / 2, d / 2),
  ];
  return { it, prod, w, d, h, y0: it.y, y1: it.y + h, poly };
}

/** Every placed item with a known product, hidden ones included (they still ride along). */
export function bodiesOf(items: PlacedItem[], lookup: Lookup): Body[] {
  const out: Body[] = [];
  for (const it of items) {
    const prod = lookup(it.productId);
    if (prod) out.push(bodyOf(it, prod));
  }
  return out;
}

/** No usable flat top: seating and beds are soft, lamps/plants/decor/screens aren't shelves. */
const NO_TOP_MODELS = new Set(['sofa', 'chair', 'office', 'lounge', 'bench', 'bed', 'rack', 'lamp', 'rug', 'curtain', 'plant', 'frame', 'mirror', 'decor', 'screen', 'bath', 'activity']);
/** Always on the floor: chairs tuck under desks; tables, counters and beds are never put on things. */
const FLOOR_ONLY_MODELS = new Set(['sofa', 'chair', 'office', 'lounge', 'bench', 'bed', 'table', 'kitchen', 'rug', 'curtain', 'bath']);
const FLOOR_ONLY_CATEGORIES = new Set(['sofa', 'chair', 'bed']);
/** Taller floor pieces (floor lamps, big plants, wardrobes) are not put on top of furniture. */
export const MAX_STACK_H = 120;
/** How close (cm) a bottom has to be to a top to count as resting on it. */
export const REST_TOL = 1.5;
/** Within this distance (cm) of an edge of the top, snap flush to it. */
const FLUSH = 3;

const mountOf = (p: Product) => p.mount ?? 'floor';

/** Has a flat top other furniture can stand on (desk, table, cabinet, shelf, counter, appliance…). */
export function canHost(b: Body): boolean {
  return mountOf(b.prod) !== 'ceiling' && !NO_TOP_MODELS.has(b.prod.model) && b.h >= 2;
}

/** Can be put on top of other furniture. */
export function canStack(prod: Product, h: number): boolean {
  const m = mountOf(prod);
  if (m === 'wall' || m === 'ceiling') return false;
  if (m === 'surface') return true;
  return !FLOOR_ONLY_CATEGORIES.has(prod.category) && !FLOOR_ONLY_MODELS.has(prod.model) && h <= MAX_STACK_H;
}

/** Half extents of a w×d footprint rotated by `rot`, measured along a host's axes. */
function extentsIn(hostRot: number, rot: number, w: number, d: number): [number, number] {
  const r = deg2rad(normDeg(rot - hostRot));
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return [(w / 2) * c + (d / 2) * s, (w / 2) * s + (d / 2) * c];
}

/** Square a rotation to the host when it is within 22° of one of the host's axes. */
export function squareTo(rot: number, hostRot: number): number {
  let best = rot;
  let bestDiff = 22.0001;
  for (const k of [0, 90, 180, 270]) {
    const c = normDeg(hostRot + k);
    let diff = Math.abs(normDeg(rot - c));
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return normDeg(best);
}

/** The footprint fits on the host's top (1cm tolerance). */
export function fitsOn(host: Body, w: number, d: number, rot: number): boolean {
  const [ex, ez] = extentsIn(host.it.rot, rot, w, d);
  return ex <= host.w / 2 + 1 && ez <= host.d / 2 + 1;
}

/** Keep a footprint centred near `p` inside the host's top, flush to an edge when close to it. */
export function placeOn(host: Body, p: Vec2, w: number, d: number, rot: number): Vec2 {
  const [lx, lz] = worldToLocal(host.it.x, host.it.z, host.it.rot, p[0], p[1]);
  const [ex, ez] = extentsIn(host.it.rot, rot, w, d);
  const axis = (v: number, e: number, half: number) => {
    if (e >= half) return 0; // as wide as the top (or overhanging, like a TV on a narrower stand): centre it
    const lo = -half + e;
    const hi = half - e;
    const c = clamp(v, lo, hi);
    if (c - lo < FLUSH) return lo;
    if (hi - c < FLUSH) return hi;
    return c;
  };
  return localToWorld(host.it.x, host.it.z, host.it.rot, axis(lx, ex, host.w / 2), axis(lz, ez, host.d / 2));
}

export interface StackHit {
  host: Body;
  x: number;
  z: number;
  y: number;
  rot: number;
}

/**
 * The furniture top an item lands on. `at(top)` gives the item's centre on the horizontal plane at
 * that height (in 3D the pointer ray meets each top at a different spot; in 2D it is the same point).
 * Higher tops win, so a box on a cabinet on a desk is found before the desk.
 */
export function pickSupport(
  hosts: Body[],
  at: (top: number) => Vec2 | null,
  guest: { prod: Product; w: number; d: number; h: number },
  rot: number,
  ceiling: number,
  opts: { faceHost?: boolean } = {},
): StackHit | null {
  const surface = mountOf(guest.prod) === 'surface';
  const sorted = [...hosts].sort((a, b) => b.y1 - a.y1);
  for (const host of sorted) {
    if (host.y1 + guest.h > ceiling + 0.5) continue;
    const p = at(host.y1);
    if (!p || !pointInPoly(p, host.poly)) continue;
    const r = opts.faceHost ? normDeg(host.it.rot) : squareTo(rot, host.it.rot);
    // small things (lamps, monitors, TVs) may overhang a little; furniture must fit on the top
    if (!surface && !fitsOn(host, guest.w, guest.d, r)) continue;
    const [x, z] = placeOn(host, p, guest.w, guest.d, r);
    return { host, x, z, y: host.y1, rot: r };
  }
  return null;
}

/** What `b` stands on: a top it rests on, or (for small surface things) a shelf inside a host. */
export function supportOf(bodies: Body[], b: Body, prefer?: (h: Body) => boolean): { host: Body; top: boolean } | null {
  const m = mountOf(b.prod);
  if (m === 'wall' || m === 'ceiling' || b.y0 < 1) return null;
  const c: Vec2 = [b.it.x, b.it.z];
  let onTop: Body | null = null;
  let inside: Body | null = null;
  for (const h of bodies) {
    if (h === b || !canHost(h) || h.w * h.d + 1 < b.w * b.d * 0.5) continue;
    if (!pointInPoly(c, h.poly)) continue;
    if (Math.abs(b.y0 - h.y1) <= REST_TOL) {
      if (!onTop || (prefer && prefer(h) && !prefer(onTop))) onTop = h;
    } else if (m === 'surface' && b.y0 > h.y0 + 1 && b.y0 < h.y1 - REST_TOL) {
      if (!inside || h.w * h.d < inside.w * inside.d) inside = h;
    }
  }
  if (onTop) return { host: onTop, top: true };
  if (inside) return { host: inside, top: false };
  return null;
}

interface CarryRider {
  id: string;
  /** rests on the root's top (moves with its top) rather than on a shelf inside it */
  top: boolean;
}

export interface CarryPlan {
  roots: { id: string; x: number; z: number; rot: number; y0: number; y1: number; riders: CarryRider[] }[];
}

/** Map each host id → the items standing directly on it (only items that are free to move). */
function ridersByHost(bodies: Body[], moving: Set<string>): Map<string, { id: string; top: boolean }[]> {
  const out = new Map<string, { id: string; top: boolean }[]>();
  const stays = (h: Body) => !moving.has(h.it.id);
  for (const b of bodies) {
    if (moving.has(b.it.id) || b.it.locked) continue;
    // when two tops line up (a desk dragged past another), keep things on the one that isn't moving
    const sup = supportOf(bodies, b, stays);
    if (!sup) continue;
    const list = out.get(sup.host.it.id) ?? [];
    list.push({ id: b.it.id, top: sup.top });
    out.set(sup.host.it.id, list);
  }
  return out;
}

/** Everything standing on `ids` (and on those, and so on), not counting `ids` themselves. */
export function ridersOf(items: PlacedItem[], ids: Iterable<string>, lookup: Lookup): Set<string> {
  const moving = new Set(ids);
  const by = ridersByHost(bodiesOf(items, lookup), moving);
  const out = new Set<string>();
  const queue = [...moving];
  while (queue.length) {
    const id = queue.shift()!;
    for (const r of by.get(id) ?? []) {
      if (out.has(r.id) || moving.has(r.id)) continue;
      out.add(r.id);
      queue.push(r.id);
    }
  }
  return out;
}

/** Before items in `ids` change: remember them and what stands on them. */
export function planCarry(items: PlacedItem[], ids: Set<string>, lookup: Lookup): CarryPlan {
  const bodies = bodiesOf(items, lookup);
  const by = ridersByHost(bodies, ids);
  const roots: CarryPlan['roots'] = [];
  const taken = new Set<string>();
  for (const b of bodies) {
    if (!ids.has(b.it.id)) continue;
    const riders: CarryRider[] = [];
    const queue = (by.get(b.it.id) ?? []).map((r) => ({ id: r.id, top: r.top }));
    while (queue.length) {
      const r = queue.shift()!;
      if (taken.has(r.id) || ids.has(r.id)) continue;
      taken.add(r.id);
      riders.push(r);
      for (const c of by.get(r.id) ?? []) queue.push({ id: c.id, top: r.top });
    }
    if (riders.length) roots.push({ id: b.it.id, x: b.it.x, z: b.it.z, rot: b.it.rot, y0: b.y0, y1: b.y1, riders });
  }
  return { roots };
}

/** After the change: move, turn and lift what stood on each changed item along with it. */
export function applyCarry(items: PlacedItem[], plan: CarryPlan, lookup: Lookup) {
  if (!plan.roots.length) return;
  const byId = new Map(items.map((it) => [it.id, it]));
  for (const root of plan.roots) {
    const it = byId.get(root.id);
    const prod = it && lookup(it.productId);
    if (!it || !prod) continue;
    const after = bodyOf(it, prod);
    const dRot = it.rot - root.rot;
    const dTop = after.y1 - root.y1;
    const dBottom = after.y0 - root.y0;
    const still = Math.abs(it.x - root.x) < 1e-6 && Math.abs(it.z - root.z) < 1e-6 && Math.abs(dRot) < 1e-6;
    if (still && Math.abs(dTop) < 1e-6 && Math.abs(dBottom) < 1e-6) continue;
    const r = deg2rad(dRot);
    const c = Math.cos(r);
    const s = Math.sin(r);
    for (const rider of root.riders) {
      const q = byId.get(rider.id);
      if (!q) continue;
      const ox = q.x - root.x;
      const oz = q.z - root.z;
      q.x = it.x + ox * c + oz * s;
      q.z = it.z - ox * s + oz * c;
      if (Math.abs(dRot) > 1e-6) q.rot = normDeg(q.rot + dRot);
      q.y = Math.max(0, q.y + (rider.top ? dTop : dBottom));
    }
  }
}

export interface StackDrag {
  /** item follows furniture tops / the floor while dragged (it started on the floor or on a top) */
  gravity: boolean;
  /** the item may go on top of furniture at all */
  stackable: boolean;
  /** ids that can't be landed on: the dragged items, what stands on them, and furniture the item started under */
  exclude: Set<string>;
  /** what stands on the dragged items (moves along with them) */
  riders: string[];
}

/** Decide at drag start how a dragged item may be stacked. */
export function stackDragContext(items: PlacedItem[], ids: string[], primary: string, lookup: Lookup): StackDrag {
  const bodies = bodiesOf(items, lookup);
  const me = bodies.find((b) => b.it.id === primary);
  const riders = [...ridersOf(items, ids, lookup)];
  const exclude = new Set([...ids, ...riders]);
  if (!me) return { gravity: false, stackable: false, exclude, riders };
  // a drawer unit tucked under a desk stays under it while you nudge it around
  for (const b of bodies) {
    if (exclude.has(b.it.id) || !canHost(b)) continue;
    if (b.y1 > me.y0 + REST_TOL && polyOverlap(b.poly, me.poly) > 0.5) exclude.add(b.it.id);
  }
  const resting = me.y0 < 1 || !!supportOf(bodies, me)?.top;
  return { gravity: resting, stackable: canStack(me.prod, me.h), exclude, riders };
}

/** Furniture tops an item may land on. */
export function hostBodies(items: PlacedItem[], lookup: Lookup, exclude: Set<string> = new Set()): Body[] {
  return bodiesOf(items, lookup).filter((b) => !b.it.hidden && !exclude.has(b.it.id) && canHost(b));
}

/** Highest furniture top under the item's centre (for the "위" button). */
export function topUnder(items: PlacedItem[], id: string, lookup: Lookup): Body | null {
  const me = items.find((i) => i.id === id);
  if (!me) return null;
  const exclude = new Set([id, ...ridersOf(items, [id], lookup)]);
  let best: Body | null = null;
  for (const h of hostBodies(items, lookup, exclude)) {
    if (pointInPoly([me.x, me.z], h.poly) && (!best || h.y1 > best.y1)) best = h;
  }
  return best;
}
