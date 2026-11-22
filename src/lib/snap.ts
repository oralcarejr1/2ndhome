import { computeIssues } from './analysis';
import { deg2rad, itemAxes, normDeg, pointInPoly, rad2deg, snap as snapTo } from './geometry';
import { getProduct } from '../store/store';
import type { FloorPlan, PlacedItem, Product, Project, Vec2, Version } from '../types';

export interface SnapGuide {
  a: Vec2;
  b: Vec2;
  kind?: 'align' | 'wall';
}

export interface SnapConfig {
  grid: number;
  walls: boolean;
  objects: boolean;
  angle: number;
}

export interface SnapOptions {
  /** 'faceRoom' = auto-orient back-to-wall during ghost placement; 'nearest90' = square tilted items when pushed against a wall. */
  autoOrient?: 'none' | 'faceRoom' | 'nearest90';
  /** Allow wall soft-barrier clamp (resists pushing straight through walls up to ~22cm). Default true. */
  softWallClamp?: boolean;
}

export function effectiveItemDims(it: PlacedItem, prod: Product) {
  const d = it.dims ?? prod.dims;
  let h = d.h;
  if (prod.model === 'table' && (it.params?.base ?? prod.params?.base) === 'standing') {
    h = Number(it.params?.curH ?? prod.params?.curH ?? h);
  }
  return { w: d.w, d: d.d, h };
}

function nearestOrthoAngle(currentRot: number, wallRot: number): number {
  const cands = [0, 90, 180, 270].map((o) => normDeg(wallRot + o));
  let best = cands[0];
  let bestDiff = 360;
  for (const c of cands) {
    let diff = Math.abs(normDeg(currentRot - c));
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

interface WallCand {
  wall: FloorPlan['walls'][number];
  n: Vec2;
  wallRot: number;
  sd: number;
  absSd: number;
  dir: Vec2;
  L: number;
}

function candidateWalls(plan: FloorPlan, x: number, z: number): WallCand[] {
  const out: WallCand[] = [];
  for (const w of plan.walls) {
    const dx = w.b[0] - w.a[0];
    const dz = w.b[1] - w.a[1];
    const L = Math.hypot(dx, dz);
    if (L < 1) continue;
    const tt = ((x - w.a[0]) * dx + (z - w.a[1]) * dz) / (L * L);
    if (tt < -0.06 || tt > 1.06) continue;
    const dir: Vec2 = [dx / L, dz / L];
    const nRaw: Vec2 = [-dz / L, dx / L];
    const sdRaw = (x - w.a[0]) * nRaw[0] + (z - w.a[1]) * nRaw[1];
    const sign = sdRaw >= 0 ? 1 : -1;
    const n: Vec2 = [nRaw[0] * sign, nRaw[1] * sign];
    const sd = Math.abs(sdRaw);
    const wallRot = normDeg(rad2deg(Math.atan2(n[0], n[1])));
    out.push({ wall: w, n, wallRot, sd, absSd: sd, dir, L });
  }
  return out;
}

/**
 * Shared floor snapping for both 3D viewport and 2D plan editor:
 * - Grid snap
 * - Auto-orientation to walls (faceRoom for ghost placement, nearest90 for tilted items)
 * - Wall flush snap with soft-barrier resistance (clamps cleanly up to 22cm push into wall, releases beyond)
 * - Edge & center alignment snap against neighboring items with guide lines
 */
export function snapFloorItem(
  project: Project,
  dims: { w: number; d: number; h: number },
  x: number,
  z: number,
  rot: number,
  others: PlacedItem[],
  st: SnapConfig,
  opts: SnapOptions = {},
): { x: number; z: number; rot: number; guides: SnapGuide[] } {
  const guides: SnapGuide[] = [];
  const autoOrient = opts.autoOrient ?? 'nearest90';
  const softWallClamp = opts.softWallClamp ?? true;

  if (st.grid > 0) {
    x = snapTo(x, st.grid);
    z = snapTo(z, st.grid);
  }

  let snappedX = false;
  let snappedZ = false;

  if (st.walls) {
    const cands = candidateWalls(project.plan, x, z);

    // 1. Optional auto-orientation toward a nearby wall
    if (autoOrient !== 'none' && cands.length > 0) {
      const reach = autoOrient === 'faceRoom' ? 24 : 14;
      const nearby = cands
        .map((c) => {
          const minHalf = Math.min(dims.w, dims.d) / 2;
          const gap = c.sd - (c.wall.thickness / 2 + minHalf);
          return { c, gap };
        })
        .filter((e) => e.gap <= reach && e.gap >= -20)
        .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));

      if (nearby.length > 0) {
        const primary = nearby[0].c;
        if (autoOrient === 'faceRoom') {
          // If inside a corner (two perpendicular nearby walls), still face room along the closest wall
          rot = primary.wallRot;
        } else if (autoOrient === 'nearest90') {
          // Only adjust rotation when the item is NOT already orthogonal to this wall
          const aligned = nearestOrthoAngle(rot, primary.wallRot);
          let diff = Math.abs(normDeg(rot - aligned));
          if (diff > 180) diff = 360 - diff;
          if (diff > 0.5 && diff <= 22) {
            rot = aligned;
          }
        }
      }
    }

    // 2. Wall flush snap (with soft resistance against pushing through walls)
    const { ux, uz } = itemAxes(rot);
    const snapPull = 10; // pulls flush from up to 10cm away
    const softPush = softWallClamp ? 22 : 10; // resists pushing through wall up to 22cm

    let bx = 0;
    let bz = 0;
    let bestScoreX = Infinity;
    let bestScoreZ = Infinity;
    let wallGuideX: SnapGuide | null = null;
    let wallGuideZ: SnapGuide | null = null;

    for (const c of cands) {
      const w = c.wall;
      const dotX = Math.abs(ux[0] * c.n[0] + ux[1] * c.n[1]);
      const dotZ = Math.abs(uz[0] * c.n[0] + uz[1] * c.n[1]);
      if (Math.max(dotX, dotZ) < 0.985) continue;

      const ext = (dims.w / 2) * dotX + (dims.d / 2) * dotZ;
      const faceDist = w.thickness / 2 + ext;
      // Signed gap from wall face: >0 outside wall, <0 penetrating into wall
      const gap = c.sd - faceDist;
      if (gap > snapPull || gap < -softPush) continue;

      const delta = faceDist - c.sd; // positive pushes away from wall along c.n
      const score = Math.abs(gap);
      const mx = c.n[0] * delta;
      const mz = c.n[1] * delta;

      const guideSpan = Math.max(dims.w, dims.d) / 2 + 24;
      const alongPos = (x - w.a[0]) * c.dir[0] + (z - w.a[1]) * c.dir[1];
      const s0 = Math.max(0, alongPos - guideSpan);
      const s1 = Math.min(c.L, alongPos + guideSpan);
      const faceOff = w.thickness / 2 + 0.5;
      const guide: SnapGuide = {
        a: [w.a[0] + c.dir[0] * s0 + c.n[0] * faceOff, w.a[1] + c.dir[1] * s0 + c.n[1] * faceOff],
        b: [w.a[0] + c.dir[0] * s1 + c.n[0] * faceOff, w.a[1] + c.dir[1] * s1 + c.n[1] * faceOff],
        kind: 'wall',
      };

      if (Math.abs(c.n[0]) > Math.abs(c.n[1])) {
        if (score < bestScoreX) {
          bestScoreX = score;
          bx = mx;
          wallGuideX = guide;
        }
      } else {
        if (score < bestScoreZ) {
          bestScoreZ = score;
          bz = mz;
          wallGuideZ = guide;
        }
      }
    }

    if (wallGuideX) {
      x += bx;
      snappedX = true;
      guides.push(wallGuideX);
    }
    if (wallGuideZ) {
      z += bz;
      snappedZ = true;
      guides.push(wallGuideZ);
    }
  }

  // 3. Object edge / center alignment snap (never overrides a wall-snapped axis)
  if (st.objects && Math.abs(Math.sin(deg2rad(rot) * 2)) < 0.01) {
    const hw = Math.abs(Math.cos(deg2rad(rot))) > 0.5 ? dims.w / 2 : dims.d / 2;
    const hd = Math.abs(Math.cos(deg2rad(rot))) > 0.5 ? dims.d / 2 : dims.w / 2;
    const myX = [x - hw, x, x + hw];
    const myZ = [z - hd, z, z + hd];
    let bestX = { d: 5, v: 0, line: null as SnapGuide | null };
    let bestZ = { d: 5, v: 0, line: null as SnapGuide | null };

    for (const o of others) {
      const op = getProduct(o.productId, project);
      if (!op || Math.abs(Math.sin(deg2rad(o.rot) * 2)) > 0.01) continue;
      const od = effectiveItemDims(o, op);
      const ohw = Math.abs(Math.cos(deg2rad(o.rot))) > 0.5 ? od.w / 2 : od.d / 2;
      const ohd = Math.abs(Math.cos(deg2rad(o.rot))) > 0.5 ? od.d / 2 : od.w / 2;
      const near = Math.abs(o.z - z) < hd + ohd + 160 && Math.abs(o.x - x) < hw + ohw + 160;
      if (!near) continue;

      if (!snappedX) {
        const ox = [o.x - ohw, o.x, o.x + ohw];
        for (const a of myX) {
          for (const b of ox) {
            const d = Math.abs(a - b);
            if (d < bestX.d) {
              bestX = {
                d,
                v: b - a,
                line: { a: [b, Math.min(z - hd, o.z - ohd) - 10], b: [b, Math.max(z + hd, o.z + ohd) + 10], kind: 'align' },
              };
            }
          }
        }
      }
      if (!snappedZ) {
        const oz = [o.z - ohd, o.z, o.z + ohd];
        for (const a of myZ) {
          for (const b of oz) {
            const d = Math.abs(a - b);
            if (d < bestZ.d) {
              bestZ = {
                d,
                v: b - a,
                line: { a: [Math.min(x - hw, o.x - ohw) - 10, b], b: [Math.max(x + hw, o.x + ohw) + 10, b], kind: 'align' },
              };
            }
          }
        }
      }
    }

    if (bestX.line) {
      x += bestX.v;
      guides.push(bestX.line);
    }
    if (bestZ.line) {
      z += bestZ.v;
      guides.push(bestZ.line);
    }
  }

  return { x, z, rot, guides };
}

/**
 * Find a non-overlapping spot near (prefX, prefZ) inside the home's rooms for instant placement
 * (used on touch devices or quick-place fallback so new items never stack blindly on top of each other).
 */
export function findFreeSpot(
  project: Project,
  v: Version,
  prod: Product,
  prefX: number,
  prefZ: number,
  y = 0,
  rot = 0,
): { x: number; z: number } {
  const rooms = project.plan.rooms.map((r) => r.points);
  const testId = '__probe__';
  const isOk = (x: number, z: number) => {
    if (rooms.length && !rooms.some((r) => pointInPoly([x, z], r))) return false;
    const probe: PlacedItem = { id: testId, productId: prod.id, x, z, y, rot };
    const issues = computeIssues(project, { ...v, items: [...v.items, probe] });
    const mine = issues.get(testId);
    return !mine || !mine.some((i) => i.level === 'bad');
  };

  if (isOk(prefX, prefZ)) return { x: prefX, z: prefZ };

  const step = 30;
  for (let ring = 1; ring <= 10; ring++) {
    const r = ring * step;
    const samples = ring * 8;
    for (let k = 0; k < samples; k++) {
      const ang = (k / samples) * Math.PI * 2;
      const tx = Math.round(prefX + Math.cos(ang) * r);
      const tz = Math.round(prefZ + Math.sin(ang) * r);
      if (isOk(tx, tz)) return { x: tx, z: tz };
    }
  }
  return { x: prefX, z: prefZ };
}
