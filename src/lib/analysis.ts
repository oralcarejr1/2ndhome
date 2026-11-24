import { getProduct } from '../store/store';
import type { FloorPlan, Opening, PersonProfile, PlacedItem, Product, Project, Version, Vec2, Wall } from '../types';
import { anthro, fitsThrough, ideals, tiltUpHeight, tvDiagFromWidth, tvDistance, type Level } from './ergonomics';
import { add, bboxOf, clamp, closestOnSeg, itemAxes, localToWorld, mul, norm, pointInPoly, polyOverlap, raySeg, sub, wallPoly } from './geometry';
import { num as pnum } from '../models/parts';
import { resolveParams } from '../models';

export interface Resolved {
  it: PlacedItem;
  prod: Product;
  w: number;
  d: number;
  h: number;
  y0: number;
  y1: number;
  poly: Vec2[];
}

export function resolveItems(project: Project, v: Version): Resolved[] {
  const out: Resolved[] = [];
  for (const it of v.items) {
    if (it.hidden) continue;
    const prod = getProduct(it.productId, project);
    if (!prod) continue;
    const dims = it.dims ?? prod.dims;
    let h = dims.h;
    if (prod.model === 'table' && it.params?.base === 'standing') h = Number(it.params?.curH ?? h);
    const corners = [
      localToWorld(it.x, it.z, it.rot, -dims.w / 2, -dims.d / 2),
      localToWorld(it.x, it.z, it.rot, dims.w / 2, -dims.d / 2),
      localToWorld(it.x, it.z, it.rot, dims.w / 2, dims.d / 2),
      localToWorld(it.x, it.z, it.rot, -dims.w / 2, dims.d / 2),
    ];
    out.push({ it, prod, w: dims.w, d: dims.d, h, y0: it.y, y1: it.y + h, poly: corners });
  }
  return out;
}

const PASS_THROUGH_MODELS = new Set(['rug', 'curtain']);
const isChairLike = (r: Resolved) => r.prod.category === 'chair' || r.prod.model === 'bench';
const isTableLike = (r: Resolved) => r.prod.model === 'table';

function wallSegments(plan: FloorPlan): [Vec2, Vec2][] {
  const segs: [Vec2, Vec2][] = [];
  for (const w of plan.walls) {
    const p = wallPoly(w);
    for (let i = 0; i < 4; i++) segs.push([p[i], p[(i + 1) % 4]]);
  }
  return segs;
}

/** Wall pieces with door openings removed (so things may sit in a doorway check separately). */
function solidWallPolys(plan: FloorPlan): Vec2[][] {
  const out: Vec2[][] = [];
  for (const w of plan.walls) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const dir = norm(sub(w.b, w.a));
    const ops = plan.openings.filter((o) => o.wallId === w.id && o.sill < 20).map((o) => [o.pos - o.width / 2, o.pos + o.width / 2] as [number, number]);
    ops.sort((a, b) => a[0] - b[0]);
    let s = 0;
    const pieces: [number, number][] = [];
    for (const [a, b] of ops) {
      if (a > s) pieces.push([s, a]);
      s = Math.max(s, b);
    }
    if (s < L) pieces.push([s, L]);
    for (const [a, b] of pieces) {
      const wa = add(w.a, mul(dir, a));
      const wb = add(w.a, mul(dir, b));
      out.push(wallPoly({ ...w, a: wa, b: wb }));
    }
  }
  return out;
}

export function doorSwingPoly(plan: FloorPlan, o: Opening): Vec2[] | null {
  if (o.type !== 'door' && o.type !== 'doubleDoor' && o.type !== 'balcony') return null;
  const w = plan.walls.find((x) => x.id === o.wallId);
  if (!w) return null;
  const dir = norm(sub(w.b, w.a));
  const n: Vec2 = [-dir[1], dir[0]];
  const side = o.side ?? 1;
  const faceOff = (w.thickness / 2) * side;
  const s0 = add(w.a, mul(dir, o.pos - o.width / 2));
  const s1 = add(w.a, mul(dir, o.pos + o.width / 2));
  const pts: Vec2[] = [];
  const leaves: { hinge: Vec2; tip: Vec2; r: number }[] = [];
  if (o.type === 'doubleDoor') {
    const mid = add(w.a, mul(dir, o.pos));
    leaves.push({ hinge: s0, tip: mid, r: o.width / 2 }, { hinge: s1, tip: mid, r: o.width / 2 });
  } else {
    const hinge = o.hinge === 'end' ? s1 : s0;
    const tip = o.hinge === 'end' ? s0 : s1;
    leaves.push({ hinge, tip, r: o.width });
  }
  for (const L of leaves) {
    const h = add(L.hinge, mul(n, faceOff));
    const a0 = Math.atan2(L.tip[1] - L.hinge[1], L.tip[0] - L.hinge[0]);
    const a1 = Math.atan2(n[1] * side, n[0] * side);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    pts.push(h);
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (da * i) / 10;
      pts.push([h[0] + Math.cos(a) * L.r, h[1] + Math.sin(a) * L.r]);
    }
  }
  return pts;
}

/** Convex hull for the door swing polygons (SAT needs convex). */
function hull(points: Vec2[]): Vec2[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Vec2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function clearanceRects(r: Resolved): { side: 'front' | 'back' | 'left' | 'right'; poly: Vec2[]; depth: number }[] {
  const c = r.prod.clearance;
  if (!c) return [];
  const { it, w, d } = r;
  const out: { side: 'front' | 'back' | 'left' | 'right'; poly: Vec2[]; depth: number }[] = [];
  const mk = (x0: number, z0: number, x1: number, z1: number) => [
    localToWorld(it.x, it.z, it.rot, x0, z0),
    localToWorld(it.x, it.z, it.rot, x1, z0),
    localToWorld(it.x, it.z, it.rot, x1, z1),
    localToWorld(it.x, it.z, it.rot, x0, z1),
  ];
  if (c.front) out.push({ side: 'front', depth: c.front, poly: mk(-w / 2, d / 2, w / 2, d / 2 + c.front) });
  if (c.back) out.push({ side: 'back', depth: c.back, poly: mk(-w / 2, -d / 2 - c.back, w / 2, -d / 2) });
  if (c.left) out.push({ side: 'left', depth: c.left, poly: mk(-w / 2 - c.left, -d / 2, -w / 2, d / 2) });
  if (c.right) out.push({ side: 'right', depth: c.right, poly: mk(w / 2, -d / 2, w / 2 + c.right, d / 2) });
  return out;
}

export interface Issue {
  level: 'bad' | 'warn';
  msg: string;
}

/** Collisions & placement problems per item id. */
export function computeIssues(project: Project, v: Version): Map<string, Issue[]> {
  const plan = project.plan;
  const res = resolveItems(project, v);
  const map = new Map<string, Issue[]>();
  const push = (id: string, i: Issue) => {
    const a = map.get(id) ?? [];
    if (!a.some((x) => x.msg === i.msg)) a.push(i);
    map.set(id, a);
  };
  const walls = solidWallPolys(plan);
  const rooms = plan.rooms.map((r) => r.points);
  const doors = plan.openings.map((o) => ({ o, poly: doorSwingPoly(plan, o) })).filter((x) => x.poly) as { o: Opening; poly: Vec2[] }[];
  for (let i = 0; i < res.length; i++) {
    const A = res[i];
    if (PASS_THROUGH_MODELS.has(A.prod.model)) continue;
    // walls
    for (const wp of walls) {
      if (polyOverlap(A.poly, wp) > 0.6) {
        push(A.it.id, { level: 'bad', msg: '벽과 겹침' });
        break;
      }
    }
    // outside of home
    if (rooms.length && !A.it.locked) {
      const out = A.poly.some((p) => !rooms.some((r) => pointInPoly(p, r) || r.some((_, k) => closestOnSeg(p, r[k], r[(k + 1) % r.length]).d < 1.5)));
      if (out) push(A.it.id, { level: 'bad', msg: '실내 바닥 밖으로 나감' });
    }
    // ceiling
    if (A.y1 > plan.ceiling + 0.5) push(A.it.id, { level: 'bad', msg: `천장(${plan.ceiling}cm)보다 높음` });
    // door swings
    if (A.y0 < 200) {
      for (const dr of doors) {
        if (polyOverlap(A.poly, hull(dr.poly)) > 2) push(A.it.id, { level: 'warn', msg: dr.o.isEntry ? '현관문 열리는 범위를 막음' : '문 열리는 범위를 막음' });
      }
    }
    // other items
    for (let j = i + 1; j < res.length; j++) {
      const B = res[j];
      if (PASS_THROUGH_MODELS.has(B.prod.model)) continue;
      if (A.it.locked && B.it.locked) continue;
      if (A.y1 <= B.y0 + 0.5 || B.y1 <= A.y0 + 0.5) continue;
      // tuck under tables (chairs always may slide under a table/desk)
      if (isTableLike(A) && (B.y1 <= A.y1 - 5 || isChairLike(B))) continue;
      if (isTableLike(B) && (A.y1 <= B.y1 - 5 || isChairLike(A))) continue;
      if (A.prod.mount === 'surface' && A.y0 >= B.y1 - 1) continue;
      if (B.prod.mount === 'surface' && B.y0 >= A.y1 - 1) continue;
      if (polyOverlap(A.poly, B.poly) > 0.6) {
        const na = A.it.label || A.prod.name;
        const nb = B.it.label || B.prod.name;
        push(A.it.id, { level: 'bad', msg: `${nb}와(과) 겹침` });
        push(B.it.id, { level: 'bad', msg: `${na}와(과) 겹침` });
      }
    }
    // clearance zones (use space)
    for (const cz of clearanceRects(A)) {
      for (const wp of walls) {
        if (polyOverlap(cz.poly, wp) > 3) {
          push(A.it.id, { level: 'warn', msg: `${sideKo(cz.side)} 사용 공간(${cz.depth}cm)이 벽에 막힘` });
          break;
        }
      }
      for (const B of res) {
        if (B === A || PASS_THROUGH_MODELS.has(B.prod.model) || isChairLike(B)) continue;
        if (['lighting', 'plant', 'decor'].includes(B.prod.category)) continue;
        if (B.y0 > 150 || B.prod.mount === 'ceiling') continue;
        // the desk or cabinet it stands on is below the drawers/doors, not in their way
        if (B.y1 <= A.y0 + 1) continue;
        if (polyOverlap(cz.poly, B.poly) > 3) {
          push(A.it.id, { level: 'warn', msg: `${sideKo(cz.side)} 사용 공간(${cz.depth}cm)에 ${B.it.label || B.prod.name}` });
        }
      }
    }
  }
  return map;
}

const sideKo = (s: string) => ({ front: '앞', back: '뒤', left: '왼쪽', right: '오른쪽' })[s] ?? s;

/** Distances from the item's sides to the nearest obstacle (walls or other items at overlapping heights). */
export function sideGaps(project: Project, v: Version, id: string): { side: string; from: Vec2; to: Vec2; dist: number }[] {
  const res = resolveItems(project, v);
  const A = res.find((r) => r.it.id === id);
  if (!A) return [];
  const segs = wallSegments(project.plan);
  for (const B of res) {
    if (B === A || PASS_THROUGH_MODELS.has(B.prod.model)) continue;
    if (A.y1 <= B.y0 + 0.5 || B.y1 <= A.y0 + 0.5) continue;
    for (let k = 0; k < 4; k++) segs.push([B.poly[k], B.poly[(k + 1) % 4]]);
  }
  const { ux, uz } = itemAxes(A.it.rot);
  const sides: { side: string; dir: Vec2; along: Vec2; half: number; off: number }[] = [
    { side: 'front', dir: uz, along: ux, half: A.w / 2, off: A.d / 2 },
    { side: 'back', dir: mul(uz, -1), along: ux, half: A.w / 2, off: A.d / 2 },
    { side: 'right', dir: ux, along: uz, half: A.d / 2, off: A.w / 2 },
    { side: 'left', dir: mul(ux, -1), along: uz, half: A.d / 2, off: A.w / 2 },
  ];
  const out: { side: string; from: Vec2; to: Vec2; dist: number }[] = [];
  const c: Vec2 = [A.it.x, A.it.z];
  for (const s of sides) {
    let best = Infinity;
    let bestFrom: Vec2 = c;
    for (const f of [-0.42, 0, 0.42]) {
      // start just inside the item so a wall touching the side reads as 0
      const o = add(add(c, mul(s.dir, s.off - 0.5)), mul(s.along, s.half * f * 2));
      for (const [a, b] of segs) {
        const t = raySeg(o, s.dir, a, b) - 0.5;
        if (t < best) {
          best = Math.max(0, t);
          bestFrom = add(o, mul(s.dir, 0.5));
        }
      }
    }
    if (best < 1000) out.push({ side: s.side, from: bestFrom, to: add(bestFrom, mul(s.dir, best)), dist: best });
  }
  return out;
}

// ---------------------------------------------------------------- passage heatmap
export interface Heatmap {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  rgba: Uint8Array;
  minPass: number;
  unreachable: number; // area in m²
  narrowCells: number;
  /** share of the walkable rooms' floor not covered by furniture */
  freeRatio: number;
}

export function computeHeatmap(project: Project, v: Version, profile: PersonProfile): Heatmap | null {
  const plan = project.plan;
  if (!plan.rooms.length) return null;
  const all = plan.rooms.flatMap((r) => r.points);
  const bb = bboxOf(all);
  const cell = 5;
  const x0 = bb.minX - cell;
  const z0 = bb.minY - cell;
  const nx = Math.ceil((bb.maxX - bb.minX) / cell) + 2;
  const nz = Math.ceil((bb.maxY - bb.minY) / cell) + 2;
  const N = nx * nz;
  const free = new Uint8Array(N);
  const res = resolveItems(project, v).filter((r) => !PASS_THROUGH_MODELS.has(r.prod.model) && r.y0 < 110 && r.y1 > 8 && r.prod.mount !== 'ceiling');
  const walls = plan.walls.map(wallPoly);
  const roomPolys = plan.rooms.filter((r) => !/욕실|보일러|발코니|다용도/.test(r.name)).map((r) => r.points);
  const obstacleBoxes = res.map((r) => ({ poly: r.poly, bb: bboxOf(r.poly) }));
  const wallBoxes = walls.map((p) => ({ poly: p, bb: bboxOf(p) }));
  let roomCells = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const p: Vec2 = [x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell];
      if (!roomPolys.some((r) => pointInPoly(p, r))) continue;
      roomCells++;
      let blocked = false;
      for (const o of wallBoxes) {
        if (p[0] < o.bb.minX || p[0] > o.bb.maxX || p[1] < o.bb.minY || p[1] > o.bb.maxY) continue;
        if (pointInPoly(p, o.poly)) {
          blocked = true;
          break;
        }
      }
      if (!blocked)
        for (const o of obstacleBoxes) {
          if (p[0] < o.bb.minX || p[0] > o.bb.maxX || p[1] < o.bb.minY || p[1] > o.bb.maxY) continue;
          if (pointInPoly(p, o.poly)) {
            blocked = true;
            break;
          }
        }
      if (!blocked) free[j * nx + i] = 1;
    }
  }
  // Euclidean distance transform (in cells) via brute-force-ish two-pass (Felzenszwalb)
  const INF = 1e9;
  const f = new Float64Array(N);
  for (let k = 0; k < N; k++) f[k] = free[k] ? INF : 0;
  const dt1d = (src: Float64Array, n: number) => {
    const d = new Float64Array(n);
    const vv = new Int32Array(n);
    const z = new Float64Array(n + 1);
    let k = 0;
    vv[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (src[q] + q * q - (src[vv[k]] + vv[k] * vv[k])) / (2 * q - 2 * vv[k]);
      while (s <= z[k]) {
        k--;
        s = (src[q] + q * q - (src[vv[k]] + vv[k] * vv[k])) / (2 * q - 2 * vv[k]);
      }
      k++;
      vv[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - vv[k]) * (q - vv[k]) + src[vv[k]];
    }
    return d;
  };
  const col = new Float64Array(nz);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) col[j] = f[j * nx + i];
    const d = dt1d(col, nz);
    for (let j = 0; j < nz; j++) f[j * nx + i] = d[j];
  }
  const row = new Float64Array(nx);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) row[i] = f[j * nx + i];
    const d = dt1d(row, nx);
    for (let i = 0; i < nx; i++) f[j * nx + i] = Math.sqrt(d[i]) * cell; // cm to nearest obstacle (cell centre)
  }
  // local corridor width: largest inscribed circle covering the cell
  const capR = 70;
  const width = new Float32Array(N);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!free[k]) continue;
      const r = Math.min(f[k], capR);
      const rc = Math.floor(r / cell);
      const wv = 2 * r;
      for (let dj = -rc; dj <= rc; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= nz) continue;
        for (let di = -rc; di <= rc; di++) {
          const ii = i + di;
          if (ii < 0 || ii >= nx) continue;
          if ((di * di + dj * dj) * cell * cell > r * r) continue;
          const kk = jj * nx + ii;
          if (free[kk] && width[kk] < wv) width[kk] = wv;
        }
      }
    }
  }
  // reachability from the entry door for the body centre
  const a = anthro(profile.height, profile.shoulder);
  const bodyR = a.shoulderW / 2 + 3;
  const reach = new Uint8Array(N);
  const entry = plan.openings.find((o) => o.isEntry);
  const queue: number[] = [];
  if (entry) {
    const w = plan.walls.find((x) => x.id === entry.wallId);
    if (w) {
      const dir = norm(sub(w.b, w.a));
      const nrm: Vec2 = [-dir[1], dir[0]];
      const c = add(w.a, mul(dir, entry.pos));
      for (const s of [1, -1]) {
        for (let dd = 10; dd < 80; dd += 5) {
          const p = add(c, mul(nrm, s * (w.thickness / 2 + dd)));
          const i = Math.floor((p[0] - x0) / cell);
          const j = Math.floor((p[1] - z0) / cell);
          if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
          const k = j * nx + i;
          if (free[k] && f[k] >= Math.min(bodyR, entry.width / 2 - 2) && !reach[k]) {
            reach[k] = 1;
            queue.push(k);
          }
        }
      }
    }
  }
  const passThr = bodyR - cell * 0.5;
  while (queue.length) {
    const k = queue.pop()!;
    const i = k % nx;
    const j = (k - i) / nx;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const kk = jj * nx + ii;
      if (reach[kk] || !free[kk] || f[kk] < passThr) continue;
      reach[kk] = 1;
      queue.push(kk);
    }
  }
  // accessible = within bodyR + arm reach of a reachable body-centre cell
  const access = new Uint8Array(N);
  const ar = Math.ceil((bodyR + 25) / cell);
  for (let k = 0; k < N; k++) {
    if (!reach[k]) continue;
    const i = k % nx;
    const j = (k - i) / nx;
    for (let dj = -ar; dj <= ar; dj++)
      for (let di = -ar; di <= ar; di++) {
        if (di * di + dj * dj > ar * ar) continue;
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        access[jj * nx + ii] = 1;
      }
  }
  const idl = ideals(profile.height, profile.shoulder);
  const rgba = new Uint8Array(N * 4);
  let minPass = Infinity;
  let unreachable = 0;
  let narrow = 0;
  for (let k = 0; k < N; k++) {
    if (!free[k]) continue;
    const wv = width[k];
    let c: [number, number, number, number];
    if (entry && !access[k]) {
      c = [124, 77, 255, 110];
      unreachable++;
    } else if (wv < idl.passMin) {
      c = [229, 72, 77, 150];
      narrow++;
      if (reach[k] || !entry) minPass = Math.min(minPass, wv);
    } else if (wv < idl.passOk) c = [240, 140, 0, 120];
    else if (wv < idl.passGood) c = [245, 200, 40, 90];
    else c = [48, 164, 108, 40];
    if (wv >= idl.passMin && reach[k]) minPass = Math.min(minPass, wv);
    rgba.set(c, k * 4);
  }
  let freeCells = 0;
  for (let k = 0; k < N; k++) if (free[k]) freeCells++;
  return { x0, z0, cell, nx, nz, rgba, minPass: isFinite(minPass) ? minPass : 0, unreachable: (unreachable * cell * cell) / 10000, narrowCells: narrow, freeRatio: roomCells ? freeCells / roomCells : 1 };
}

// ---------------------------------------------------------------- ergonomic checks
export interface Check {
  id: string;
  itemId?: string;
  level: Level;
  title: string;
  detail: string;
  group: string;
}

function nearestInFront(A: Resolved, cands: Resolved[], maxDist: number): { r: Resolved; gap: number } | null {
  const { uz, ux } = itemAxes(A.it.rot);
  let best: { r: Resolved; gap: number } | null = null;
  for (const B of cands) {
    if (B === A) continue;
    const rel = sub([B.it.x, B.it.z], [A.it.x, A.it.z]);
    const along = rel[0] * uz[0] + rel[1] * uz[1];
    const lat = rel[0] * ux[0] + rel[1] * ux[1];
    if (along <= A.d / 2 - 5 || Math.abs(lat) > A.w / 2 + 20) continue;
    // gap between A's front edge and B's nearest point along uz
    let minProj = Infinity;
    for (const p of B.poly) {
      const r2 = sub(p, [A.it.x, A.it.z]);
      minProj = Math.min(minProj, r2[0] * uz[0] + r2[1] * uz[1]);
    }
    const gap = minProj - A.d / 2;
    if (gap > maxDist) continue;
    if (!best || gap < best.gap) best = { r: B, gap };
  }
  return best;
}

function centreInside(p: Vec2, r: Resolved) {
  return pointInPoly(p, r.poly);
}

export function computeChecks(project: Project, v: Version, profile: PersonProfile, heat: Heatmap | null): Check[] {
  const H = profile.height;
  const a = anthro(H, profile.shoulder);
  const id = ideals(H, profile.shoulder);
  const res = resolveItems(project, v);
  const out: Check[] = [];
  const name = (r: Resolved) => r.it.label || r.prod.name;
  const cm = (x: number) => `${Math.round(x)}cm`;
  const chairs = res.filter((r) => r.prod.ergo === 'chair' || r.prod.ergo === 'officeChair');
  const plan = project.plan;
  const segs = wallSegments(plan);
  const freeRay = (o: Vec2, dir: Vec2, exclude: Resolved[]) => {
    let best = Infinity;
    for (const [p, q] of segs) best = Math.min(best, raySeg(o, dir, p, q));
    for (const B of res) {
      if (exclude.includes(B) || PASS_THROUGH_MODELS.has(B.prod.model) || isChairLike(B) || B.y0 > 100 || B.prod.mount === 'ceiling') continue;
      for (let k = 0; k < 4; k++) best = Math.min(best, raySeg(o, dir, B.poly[k], B.poly[(k + 1) % 4]));
    }
    return Math.max(0, best - 0.5);
  };

  for (const r of res) {
    const role = r.prod.ergo ?? 'none';
    const P = resolveParams(r.prod, r.it);
    const n = name(r);
    switch (role) {
      case 'desk':
      case 'diningTable': {
        const diff = r.h - id.deskH;
        const lvl: Level = Math.abs(diff) <= 3 ? 'ok' : Math.abs(diff) <= 6 ? 'warn' : 'bad';
        out.push({
          id: r.it.id + 'h',
          itemId: r.it.id,
          level: lvl,
          group: role === 'desk' ? '책상' : '식탁',
          title: `${n} 높이 ${cm(r.h)}`,
          detail: `${profile.name}(${H}cm) 권장 ${cm(id.deskH)} 전후 · ${diff > 0 ? '+' : ''}${Math.round(diff)}cm${lvl !== 'ok' ? (diff > 0 ? ' — 의자를 높이거나 발받침' : ' — 낮은 의자 또는 높이 조절') : ''}`,
        });
        const ch = chairs.find((c) => pointInPoly([c.it.x, c.it.z], expand(r, 60)));
        if (ch) {
          const seat = ch.prod.seatH ?? pnum(resolveParams(ch.prod, ch.it), 'seatH', 45);
          const sachuk = r.h - seat;
          const ideal = 0.183 * H - 1;
          const l2: Level = Math.abs(sachuk - ideal) <= 3.5 ? 'ok' : Math.abs(sachuk - ideal) <= 7 ? 'warn' : 'bad';
          const adj = ch.prod.adjust;
          const canFix = adj && r.h - ideal >= adj[0] && r.h - ideal <= adj[1];
          out.push({
            id: r.it.id + 's',
            itemId: ch.it.id,
            level: canFix && l2 !== 'ok' ? 'warn' : l2,
            group: role === 'desk' ? '책상' : '식탁',
            title: `${n} ↔ ${name(ch)} 높이차 ${cm(sachuk)}`,
            detail: `팔이 편한 차이(차척) ${cm(ideal)} ± 3 · ${canFix ? `좌판을 ${cm(r.h - ideal)}로 맞추면 적정` : seat > id.chairSeat + 4 ? '의자가 높아 발이 뜰 수 있음' : '조절 범위 확인'}`,
          });
        }
        if (role === 'diningTable') {
          const { uz } = itemAxes(r.it.rot);
          for (const s of [1, -1]) {
            const o: Vec2 = [r.it.x + uz[0] * (r.d / 2 - 0.5) * s, r.it.z + uz[1] * (r.d / 2 - 0.5) * s];
            const gap = freeRay(o, mul(uz, s), [r]);
            if (gap < 75)
              out.push({
                id: r.it.id + 'pull' + s,
                itemId: r.it.id,
                level: gap < 55 ? 'bad' : 'warn',
                group: '식탁',
                title: `${n} ${s > 0 ? '앞' : '뒤'}쪽 의자 뺄 공간 ${cm(gap)}`,
                detail: '앉고 일어서려면 75cm, 뒤로 지나가려면 90cm 이상 권장',
              });
          }
        }
        if (role === 'desk') {
          const { uz } = itemAxes(r.it.rot);
          const o: Vec2 = [r.it.x + uz[0] * (r.d / 2 - 0.5), r.it.z + uz[1] * (r.d / 2 - 0.5)];
          const gap = freeRay(o, uz, [r]);
          out.push({
            id: r.it.id + 'room',
            itemId: r.it.id,
            level: gap >= 90 ? 'ok' : gap >= 70 ? 'warn' : 'bad',
            group: '책상',
            title: `${n} 앞 의자 공간 ${cm(gap)}`,
            detail: '의자를 빼고 앉으려면 90cm 이상 권장 (최소 70cm)',
          });
        }
        break;
      }
      case 'standingDesk': {
        const adj = r.prod.adjust ?? [65, 125];
        const okSit = id.deskH >= adj[0] - 1 && id.deskH <= adj[1] + 1;
        const okStand = id.standDeskH >= adj[0] - 1 && id.standDeskH <= adj[1] + 1;
        out.push({
          id: r.it.id + 'adj',
          itemId: r.it.id,
          level: okSit && okStand ? 'ok' : okSit || okStand ? 'warn' : 'bad',
          group: '책상',
          title: `${n} 조절 범위 ${adj[0]}~${adj[1]}cm`,
          detail: `앉아서 ${cm(id.deskH)} ${okSit ? '✓' : '✗'} · 서서 ${cm(id.standDeskH)} ${okStand ? '✓' : '✗'}`,
        });
        break;
      }
      case 'chair':
      case 'officeChair': {
        const seat = pnum(P, 'seatH', r.prod.seatH ?? 45);
        if (r.prod.adjust) {
          const ok = id.chairSeat >= r.prod.adjust[0] && id.chairSeat <= r.prod.adjust[1];
          out.push({ id: r.it.id + 'c', itemId: r.it.id, level: ok ? 'ok' : 'warn', group: '의자', title: `${n} 좌판 ${r.prod.adjust[0]}~${r.prod.adjust[1]}cm`, detail: `권장 좌판 높이 ${cm(id.chairSeat)} ${ok ? '— 범위 안' : '— 범위 밖(발받침/방석)'}` });
        } else if (seat < 70) {
          const diff = seat - id.chairSeat;
          out.push({ id: r.it.id + 'c', itemId: r.it.id, level: Math.abs(diff) <= 4 ? 'ok' : Math.abs(diff) <= 7 ? 'warn' : 'info', group: '의자', title: `${n} 좌판 ${cm(seat)}`, detail: `권장 ${cm(id.chairSeat)} (무릎 뒤 높이 기준) · ${diff > 0 ? '+' : ''}${Math.round(diff)}cm` });
        }
        break;
      }
      case 'sofa': {
        const seat = pnum(P, 'seatH', r.prod.seatH ?? 43);
        const [lo, hi] = id.sofaSeat;
        out.push({ id: r.it.id + 'seat', itemId: r.it.id, level: seat >= lo - 2 && seat <= hi + 2 ? 'ok' : 'warn', group: '거실', title: `${n} 좌면 ${cm(seat)}`, detail: `편하게 앉고 일어서기 ${cm(lo)}~${cm(hi)} · 깊이 ${cm(r.d)}` });
        const ct = nearestInFront(r, res.filter((x) => x.prod.ergo === 'coffeeTable'), 120);
        if (ct)
          out.push({
            id: r.it.id + 'ct',
            itemId: ct.r.it.id,
            level: ct.gap >= 30 && ct.gap <= 50 ? 'ok' : ct.gap < 25 ? 'bad' : 'warn',
            group: '거실',
            title: `소파 ↔ ${name(ct.r)} 간격 ${cm(ct.gap)}`,
            detail: '다리 둘 공간 + 손 닿는 거리 30~45cm 권장',
          });
        const tv = nearestInFront(r, res.filter((x) => x.prod.ergo === 'tv'), 600);
        if (tv) {
          const diag = tvDiagFromWidth(tv.r.w);
          const [dmin, dmax] = tvDistance(diag);
          const dist = tv.gap + r.d * 0.6;
          out.push({ id: r.it.id + 'tvd', itemId: tv.r.it.id, level: dist >= dmin * 0.9 && dist <= dmax * 1.15 ? 'ok' : 'warn', group: '거실', title: `TV 시청 거리 약 ${cm(dist)} (${Math.round(diag)}인치)`, detail: `4K 기준 ${cm(dmin)}~${cm(dmax)} 권장` });
          const eye = seat + a.sitEyeH - 5;
          const sy = tv.r.y0 + tv.r.h * (tv.r.prod.params?.stand === 'wall' ? 0.5 : 0.55);
          out.push({ id: r.it.id + 'tvh', itemId: tv.r.it.id, level: Math.abs(sy - eye) <= 12 ? 'ok' : Math.abs(sy - eye) <= 25 ? 'warn' : 'bad', group: '거실', title: `TV 화면 중심 ${cm(sy)} / 앉은 눈높이 ${cm(eye)}`, detail: '화면 중심이 눈높이와 같거나 약간 아래가 목이 편해요' });
        }
        break;
      }
      case 'bed': {
        const style = String(P.style ?? 'platform');
        const top = (style === 'floor' ? Math.max(4, pnum(P, 'frameH', 10)) : pnum(P, 'frameH', 30)) + pnum(P, 'mattressT', 25);
        const [lo, hi] = id.bedTop;
        out.push({ id: r.it.id + 'top', itemId: r.it.id, level: top >= lo && top <= hi ? 'ok' : top < lo - 15 ? 'info' : 'warn', group: '침실', title: `${n} 매트리스 윗면 ${cm(top)}`, detail: `걸터앉기 편한 높이 ${cm(lo)}~${cm(hi)} (무릎 높이 기준)${top < lo - 15 ? ' · 낮은 침대는 일어설 때 무릎 부담' : ''}` });
        const { ux, uz } = itemAxes(r.it.rot);
        const sides: [string, Vec2, number][] = [
          ['왼쪽', mul(ux, -1), r.w / 2],
          ['오른쪽', ux, r.w / 2],
          ['발치', uz, r.d / 2],
        ];
        const gaps = sides.map(([lab, dir, off]) => {
          const o: Vec2 = [r.it.x + dir[0] * (off - 0.5), r.it.z + dir[1] * (off - 0.5)];
          return [lab, freeRay(o, dir, [r])] as const;
        });
        const sideBest = Math.max(gaps[0][1], gaps[1][1]);
        out.push({ id: r.it.id + 'side', itemId: r.it.id, level: sideBest >= 60 ? 'ok' : sideBest >= 45 ? 'warn' : 'bad', group: '침실', title: `${n} 옆 통로 ${gaps.map(([l, g]) => `${l} ${g > 900 ? '∞' : Math.round(g)}`).join(' · ')}cm`, detail: '최소 한쪽은 50~60cm 있어야 오르내리고 이불 정리가 편해요' });
        break;
      }
      case 'counter': {
        const diff = r.h - id.counterH;
        out.push({ id: r.it.id + 'k', itemId: r.it.id, level: Math.abs(diff) <= 3 ? 'ok' : Math.abs(diff) <= 6 ? 'warn' : 'bad', group: '주방', title: `${n} 높이 ${cm(r.h)}`, detail: `권장 (키/2+5) ${cm(id.counterH)} · ${diff > 0 ? '+' : ''}${Math.round(diff)}cm${diff < -3 ? ' — 오래 서서 일하면 허리 숙임' : ''}` });
        break;
      }
      case 'vanity': {
        const diff = r.h - id.basinH;
        out.push({ id: r.it.id + 'v', itemId: r.it.id, level: Math.abs(diff) <= 4 ? 'ok' : 'warn', group: '욕실', title: `${n} 높이 ${cm(r.h)}`, detail: `권장 ${cm(id.basinH)} 전후` });
        break;
      }
      case 'pendant': {
        const bottom = r.y0;
        const table = res.find((t) => (t.prod.ergo === 'diningTable' || t.prod.ergo === 'desk' || t.prod.ergo === 'coffeeTable') && centreInside([r.it.x, r.it.z], t));
        if (table) {
          const gap = bottom - table.y1;
          out.push({ id: r.it.id + 'p', itemId: r.it.id, level: gap >= 60 && gap <= 85 ? 'ok' : 'warn', group: '조명', title: `${n} ↔ ${name(table)} 상판 ${cm(gap)}`, detail: '식탁 위 펜던트는 상판에서 65~80cm가 눈부심 없이 마주 보기 좋아요' });
        } else {
          out.push({ id: r.it.id + 'p', itemId: r.it.id, level: bottom >= H + 10 ? 'ok' : 'bad', group: '조명', title: `${n} 하단 ${cm(bottom)}`, detail: bottom >= H + 10 ? `${profile.name} 머리 위 ${cm(bottom - H)} 여유` : `${profile.name}(${H}cm) 머리에 닿을 수 있음 — 테이블 위로 옮기거나 올리기` });
        }
        break;
      }
      case 'mirror': {
        const need0 = a.eyeH / 2;
        const need1 = (H + a.eyeH) / 2;
        const ok = r.y0 <= need0 + 2 && r.y1 >= need1 - 2;
        out.push({ id: r.it.id + 'm', itemId: r.it.id, level: ok ? 'ok' : 'warn', group: '소품', title: `${n} 전신 비침 ${ok ? '가능' : '부족'}`, detail: `전신을 보려면 거울이 바닥에서 ${cm(need0)}~${cm(need1)} 구간을 덮어야 해요 (현재 ${cm(r.y0)}~${cm(r.y1)})` });
        break;
      }
      case 'wardrobe':
      case 'tallStorage': {
        const top = r.y1 - 10;
        if (top > a.reachUp) out.push({ id: r.it.id + 'r', itemId: r.it.id, level: 'info', group: '수납', title: `${n} 맨 윗칸 ${cm(top)}`, detail: `${profile.name}가 손 뻗어 닿는 높이 약 ${cm(a.reachUp)} — 윗칸은 발판 필요, 자주 쓰는 물건은 ${cm(a.comfortTop)} 아래에` });
        else out.push({ id: r.it.id + 'r', itemId: r.it.id, level: 'ok', group: '수납', title: `${n} 맨 윗칸 ${cm(top)}`, detail: `손 닿는 높이 ${cm(a.reachUp)} 이내` });
        break;
      }
      case 'upperCabinet': {
        out.push({ id: r.it.id + 'u', itemId: r.it.id, level: r.y1 <= a.reachUp ? 'ok' : 'info', group: '주방', title: `${n} 높이 ${cm(r.y0)}~${cm(r.y1)}`, detail: `손 닿는 높이 ${cm(a.reachUp)} · 머리 부딪힘 주의(상부장 하단은 보통 145cm 이상)` });
        break;
      }
    }
    // tilt-up during assembly
    if (r.prod.flatpack && r.h > 170 && !r.it.locked) {
      const diag = tiltUpHeight(r.h, r.d);
      if (diag > plan.ceiling - 1)
        out.push({ id: r.it.id + 'tilt', itemId: r.it.id, level: 'warn', group: '반입·조립', title: `${n} 세울 때 대각선 ${cm(diag)} > 천장 ${cm(plan.ceiling)}`, detail: '눕혀서 조립한 뒤 세우면 천장에 걸려요 — 세운 상태로 조립하거나 낮은 모델 고려' });
    }
    // move-in through the front door
    if (!r.it.locked && !r.prod.flatpack && r.prod.category !== 'textile' && r.prod.category !== 'decor' && r.h > 5) {
      const mi = project.moveIn;
      const okDoor = fitsThrough({ w: r.w, d: r.d, h: r.h }, mi.entryW, mi.entryH);
      if (!okDoor) {
        const win = plan.openings.find((o) => o.type === 'window' || o.type === 'balcony');
        const okWin = win ? fitsThrough({ w: r.w, d: r.d, h: r.h }, win.width, win.height) : false;
        out.push({
          id: r.it.id + 'in',
          itemId: r.it.id,
          level: 'warn',
          group: '반입·조립',
          title: `${n} 현관문(${mi.entryW}×${mi.entryH}) 통과 어려움`,
          detail: `가장 얇은 두 면 ${[r.w, r.d, r.h].sort((x, y) => x - y).slice(0, 2).map(Math.round).join('×')}cm${okWin ? ' · 창문으로는 가능(사다리차)' : ''} · 분해 가능 여부 확인`,
        });
      }
    }
  }
  if (heat) {
    out.push({
      id: 'pass',
      level: heat.narrowCells > 0 && heat.minPass < id.passMin ? 'bad' : heat.minPass < id.passOk ? 'warn' : 'ok',
      group: '동선',
      title: `가장 좁은 통로 약 ${cm(heat.minPass)}`,
      detail: `${profile.name} 어깨폭 약 ${cm(a.shoulderW)} → 한 사람 최소 ${cm(id.passMin)}, 편하게 75, 넉넉히 90cm. '동선' 레이어에서 빨간 곳 확인`,
    });
    if (heat.unreachable > 0.05)
      out.push({ id: 'reach', level: 'warn', group: '동선', title: `현관에서 갈 수 없는 바닥 ${heat.unreachable.toFixed(1)}㎡`, detail: "가구에 막혀 몸이 못 들어가는 공간이에요 ('동선' 레이어의 보라색)" });
  }
  return out;
}

function expand(r: Resolved, pad: number): Vec2[] {
  const { it, w, d } = r;
  return [
    localToWorld(it.x, it.z, it.rot, -w / 2 - pad, -d / 2 - pad),
    localToWorld(it.x, it.z, it.rot, w / 2 + pad, -d / 2 - pad),
    localToWorld(it.x, it.z, it.rot, w / 2 + pad, d / 2 + pad),
    localToWorld(it.x, it.z, it.rot, -w / 2 - pad, d / 2 + pad),
  ];
}

// ---------------------------------------------------------------- snapping helpers
export function nearestWall(plan: FloorPlan, p: Vec2, maxD = 60): { wall: Wall; pt: Vec2; d: number; n: Vec2 } | null {
  let best: { wall: Wall; pt: Vec2; d: number; n: Vec2 } | null = null;
  for (const w of plan.walls) {
    const c = closestOnSeg(p, w.a, w.b);
    const dd = c.d - w.thickness / 2;
    if (dd > maxD) continue;
    const dir = norm(sub(w.b, w.a));
    let n: Vec2 = [-dir[1], dir[0]];
    if ((p[0] - c.pt[0]) * n[0] + (p[1] - c.pt[1]) * n[1] < 0) n = [-n[0], -n[1]];
    if (!best || dd < best.d) best = { wall: w, pt: c.pt, d: dd, n };
  }
  return best;
}

export { clamp };
