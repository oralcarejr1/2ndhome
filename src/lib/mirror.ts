import type { FloorPlan, Project, Vec2 } from '../types';

// Mirror a whole home — plan and every layout — as its mirror-image unit (apartments are often
// built as mirrored pairs of the same plan).
//
// 'long'  = flip across the plan's long axis (looking along the long side, left and right swap)
// 'short' = flip across the short axis
//
// Plan y is three.js z. For a reflection R: an item's rotation r becomes 180 − r (y flip) or −r
// (x flip), and its own left/right `mirror` toggles, because R·Rot(r) = Rot(r')·(local x flip).
// Doors keep their hinge end and swing to the other face (side → −side), since a reflection turns
// a wall's computed normal around.

export type MirrorAxis = 'long' | 'short';

function planBounds(plan: FloorPlan) {
  const pts: Vec2[] = [...plan.walls.flatMap((w) => [w.a, w.b]), ...plan.rooms.flatMap((r) => r.points)];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Which plan coordinate a mirror across the given axis negates. */
export function mirrorCoord(plan: FloorPlan, axis: MirrorAxis): 'x' | 'y' {
  const b = planBounds(plan);
  const longIsX = b.maxX - b.minX >= b.maxY - b.minY;
  // across the long axis (a line along the long side) the other coordinate flips
  return axis === 'long' ? (longIsX ? 'y' : 'x') : longIsX ? 'x' : 'y';
}

const SWINGS = new Set(['door', 'doubleDoor', 'balcony']);
const r2 = (v: number) => Math.round(v * 100) / 100;
const normDeg = (d: number) => r2(((d % 360) + 360) % 360);

export function mirrorProject(p: Project, axis: MirrorAxis = 'long'): Project {
  const coord = mirrorCoord(p.plan, axis);
  const b = planBounds(p.plan);
  const c2 = coord === 'x' ? b.minX + b.maxX : b.minY + b.maxY; // reflect about the plan's centre line
  const pt = ([x, y]: Vec2): Vec2 => (coord === 'x' ? [r2(c2 - x), y] : [x, r2(c2 - y)]);
  const rot = (r: number) => normDeg(coord === 'x' ? -r : 180 - r);

  const plan: FloorPlan = {
    ...p.plan,
    walls: p.plan.walls.map((w) => ({ ...w, a: pt(w.a), b: pt(w.b) })),
    openings: p.plan.openings.map((o) => (SWINGS.has(o.type) ? { ...o, side: (o.side ?? 1) === 1 ? -1 : 1 } : { ...o })),
    // reversed so every room keeps its winding
    rooms: p.plan.rooms.map((r) => ({ ...r, points: r.points.map(pt).reverse() })),
  };

  const versions = p.versions.map((v) => ({
    ...v,
    items: v.items.map((i) => {
      const [x, z] = pt([i.x, i.z]);
      return { ...i, x, z, rot: rot(i.rot), mirror: i.mirror ? undefined : true };
    }),
    people: v.people.map((h) => {
      const [x, z] = pt([h.x, h.z]);
      return { ...h, x, z, rot: rot(h.rot) };
    }),
  }));

  return { ...p, plan, versions, updatedAt: Date.now() };
}
