import type { PlacedItem, Vec2, Wall } from '../types';

export const uid = (prefix = '') =>
  prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const deg2rad = (d: number) => (d * Math.PI) / 180;
export const rad2deg = (r: number) => (r * 180) / Math.PI;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const snap = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);
export const normDeg = (d: number) => ((d % 360) + 360) % 360;

export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const mul = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
export const len = (a: Vec2) => Math.hypot(a[0], a[1]);
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const norm = (a: Vec2): Vec2 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};

/** Local (lx, lz) → world plan coords for an item rotated by `rot` degrees (matches three.js rotation.y). */
export function localToWorld(x: number, z: number, rot: number, lx: number, lz: number): Vec2 {
  const r = deg2rad(rot);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

export function worldToLocal(x: number, z: number, rot: number, wx: number, wz: number): Vec2 {
  const r = deg2rad(rot);
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = wx - x;
  const dz = wz - z;
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Item local axes in world space: ux = +x (width), uz = +z (front). */
export function itemAxes(rot: number): { ux: Vec2; uz: Vec2 } {
  const r = deg2rad(rot);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { ux: [c, -s], uz: [s, c] };
}

export interface OBB {
  c: Vec2;
  hw: number;
  hd: number;
  rot: number;
}

export function obbCorners(o: OBB): Vec2[] {
  return [
    localToWorld(o.c[0], o.c[1], o.rot, -o.hw, -o.hd),
    localToWorld(o.c[0], o.c[1], o.rot, o.hw, -o.hd),
    localToWorld(o.c[0], o.c[1], o.rot, o.hw, o.hd),
    localToWorld(o.c[0], o.c[1], o.rot, -o.hw, o.hd),
  ];
}

function projectPoly(poly: Vec2[], axis: Vec2): [number, number] {
  let mn = Infinity;
  let mx = -Infinity;
  for (const p of poly) {
    const v = dot(p, axis);
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return [mn, mx];
}

/** Separating-axis overlap depth for two convex polygons (returns 0 when not overlapping). */
export function polyOverlap(a: Vec2[], b: Vec2[]): number {
  let minDepth = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const axis = norm([-(p2[1] - p1[1]), p2[0] - p1[0]]);
      const [a0, a1] = projectPoly(a, axis);
      const [b0, b1] = projectPoly(b, axis);
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return 0;
      if (o < minDepth) minDepth = o;
    }
  }
  return minDepth;
}

export function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const hit = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function polyArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

export function polyCentroid(poly: Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

/** Closest point on segment ab to p, with parameter t in [0,1]. */
export function closestOnSeg(p: Vec2, a: Vec2, b: Vec2): { pt: Vec2; t: number; d: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab) || 1;
  const t = clamp(dot(sub(p, a), ab) / l2, 0, 1);
  const pt: Vec2 = [a[0] + ab[0] * t, a[1] + ab[1] * t];
  return { pt, t, d: dist(p, pt) };
}

/** Ray (origin o, dir d normalised) vs segment ab; returns distance along ray or Infinity. */
export function raySeg(o: Vec2, d: Vec2, a: Vec2, b: Vec2): number {
  const v1 = sub(o, a);
  const v2 = sub(b, a);
  const v3: Vec2 = [-d[1], d[0]];
  const den = dot(v2, v3);
  if (Math.abs(den) < 1e-9) return Infinity;
  const t1 = cross(v2, v1) / den;
  const t2 = dot(v1, v3) / den;
  if (t1 >= 0 && t2 >= 0 && t2 <= 1) return t1;
  return Infinity;
}

/** Wall as a thick rectangle polygon (4 corners). */
export function wallPoly(w: Wall): Vec2[] {
  const dir = norm(sub(w.b, w.a));
  const n: Vec2 = [-dir[1], dir[0]];
  const h = w.thickness / 2;
  return [add(w.a, mul(n, h)), add(w.b, mul(n, h)), add(w.b, mul(n, -h)), add(w.a, mul(n, -h))];
}

export function wallLength(w: Wall) {
  return dist(w.a, w.b);
}

export function wallAngleDeg(w: Wall) {
  return rad2deg(Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]));
}

export function itemFootprint(it: Pick<PlacedItem, 'x' | 'z' | 'rot'>, w: number, d: number, pad = 0): Vec2[] {
  return obbCorners({ c: [it.x, it.z], hw: w / 2 + pad, hd: d / 2 + pad, rot: it.rot });
}

export function bboxOf(points: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

export const fmtCm = (v: number) => `${Math.round(v)}`;
export const fmtM = (cm: number) => `${(cm / 100).toFixed(2)}m`;
export const fmtWon = (n?: number) => (n == null ? '-' : '₩' + Math.round(n).toLocaleString('ko-KR'));
export const pyeong = (cm2: number) => cm2 / 10000 / 3.3058;
