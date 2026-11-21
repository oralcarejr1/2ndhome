import { describe, expect, it } from 'vitest';
import { sampleProject } from '../src/catalog/seed';
import { computeIssues, doorSwingPoly } from '../src/lib/analysis';
import { localToWorld, pointInPoly } from '../src/lib/geometry';
import { mirrorCoord, mirrorProject } from '../src/lib/mirror';
import type { Project } from '../src/types';

const issueCount = (p: Project) => p.versions.map((v) => [...computeIssues(p, v).values()].flat().length);
const norm = (p: Project) =>
  JSON.parse(JSON.stringify({ ...p, updatedAt: 0, plan: { ...p.plan, openings: p.plan.openings.map((o) => ({ ...o, side: o.side ?? 1 })) } }));

describe('mirror a home', () => {
  const p = sampleProject(); // 600 × 450: the long axis runs along x

  it('flips across the long axis: plan y, item rotation 180 − r, own mirror toggled', () => {
    expect(mirrorCoord(p.plan, 'long')).toBe('y');
    expect(mirrorCoord(p.plan, 'short')).toBe('x');
    const m = mirrorProject(p, 'long');
    const bed = p.versions[0].items[0];
    const bed2 = m.versions[0].items[0];
    expect(bed2.x).toBe(bed.x);
    expect(bed2.z).toBeCloseTo(450 - bed.z); // headboard wall swaps sides
    expect(bed2.rot).toBe(180);
    expect(bed2.mirror).toBe(true);
    // the item's front still points the mirrored way
    const [fx, fz] = localToWorld(bed.x, bed.z, bed.rot, 0, 10);
    const [mx, mz] = localToWorld(bed2.x, bed2.z, bed2.rot, 0, 10);
    expect(mx).toBeCloseTo(fx);
    expect(mz).toBeCloseTo(450 - fz);
  });

  it('is its own inverse and keeps the layout valid', () => {
    for (const axis of ['long', 'short'] as const) {
      const m = mirrorProject(p, axis);
      expect(issueCount(m)).toEqual(issueCount(p));
      expect(norm(mirrorProject(m, axis))).toEqual(norm(p));
    }
  });

  it('doors keep swinging into the same room', () => {
    const m = mirrorProject(p, 'long');
    const room = p.plan.rooms[0].points;
    const room2 = m.plan.rooms[0].points;
    for (const o of p.plan.openings.filter((x) => x.type === 'door')) {
      const a = doorSwingPoly(p.plan, o)!;
      const b = doorSwingPoly(m.plan, m.plan.openings.find((x) => x.id === o.id)!)!;
      const tipA = a[a.length - 1];
      const tipB = b[b.length - 1];
      expect(pointInPoly(tipA, room)).toBe(pointInPoly(tipB, room2));
      expect(tipB[1]).toBeCloseTo(450 - tipA[1]);
      expect(tipB[0]).toBeCloseTo(tipA[0]);
    }
  });
});
