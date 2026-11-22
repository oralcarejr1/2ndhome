import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '../src/catalog/products';
import { sampleProject } from '../src/catalog/seed';
import { findFreeSpot, snapFloorItem } from '../src/lib/snap';
import { getProduct } from '../src/store/store';
import { ergoReport, layoutTotals } from '../src/ui/ergo';

describe('shared 2D/3D floor snapping', () => {
  const project = sampleProject();
  const v = project.versions[0];
  const snapCfg = { grid: 1, walls: true, objects: true, angle: 15 };
  // In sampleProject(), roomPlan(600, 450) places wall centerlines at -7.5 with thickness 15 -> inner wall faces at x=0 and y=0.

  it('auto-orients ghost placement back-to-wall and snaps flush when approaching a side wall', () => {
    const dims = { w: 180, d: 80, h: 80 };
    // West wall inner face at x=0; flush x = d/2 = 40. Approaching at x=47 (7cm away) auto-orients to 90° and snaps flush to 40.
    const sn = snapFloorItem(project, dims, 47, 220, 0, [], snapCfg, { autoOrient: 'faceRoom' });
    expect(sn.rot).toBe(90);
    expect(sn.x).toBeCloseTo(40, 0);
    expect(sn.guides.some((g) => g.kind === 'wall')).toBe(true);
  });

  it('resists pushing furniture straight through a wall (soft wall clamp) and releases when dragged far past', () => {
    const dims = { w: 160, d: 80, h: 80 };
    // North wall inner face at y=0 -> flush z = d/2 = 40.
    // Pushing 12cm into the wall (z = 28) clamps cleanly back to 40.
    const clamped = snapFloorItem(project, dims, 200, 28, 0, [], snapCfg, { autoOrient: 'nearest90' });
    expect(clamped.z).toBeCloseTo(40, 0);
    expect(clamped.guides.some((g) => g.kind === 'wall')).toBe(true);

    // Dragging 30cm past flush (z = 10, beyond 22cm soft barrier) releases across the wall.
    const released = snapFloorItem(project, dims, 200, 10, 0, [], snapCfg, { autoOrient: 'nearest90' });
    expect(released.z).toBeCloseTo(10, 0);
  });

  it('squares up slightly tilted furniture against a wall without flipping orthogonal items', () => {
    const dims = { w: 160, d: 80, h: 80 };
    // Slightly tilted 12° item pushed near north wall squares cleanly to 0° and flushes at z=40.
    const squared = snapFloorItem(project, dims, 200, 46, 12, [], snapCfg, { autoOrient: 'nearest90' });
    expect(squared.rot).toBe(0);
    expect(squared.z).toBeCloseTo(40, 0);

    // Already orthogonal item (rot = 90°) pushed near north wall stays 90° and flushes its side (w/2 = 80).
    const sideFlush = snapFloorItem(project, dims, 200, 86, 90, [], snapCfg, { autoOrient: 'nearest90' });
    expect(sideFlush.rot).toBe(90);
    expect(sideFlush.z).toBeCloseTo(80, 0);
  });

  it('aligns edges with nearby items and emits alignment guides', () => {
    const dims = { w: 100, d: 60, h: 75 };
    const neighbor = { id: 'n1', productId: 'gen-desk-120', x: 250, z: 250, y: 0, rot: 0 };
    // Place test item 3cm off the neighbor's center z=250.
    const sn = snapFloorItem(project, dims, 100, 253, 0, [neighbor], { ...snapCfg, walls: false }, { autoOrient: 'none' });
    expect(sn.z).toBeCloseTo(250, 0);
    expect(sn.guides.some((g) => g.kind === 'align')).toBe(true);
  });

  it('findFreeSpot avoids stacking new items on top of an occupied spot', () => {
    const chair = getProduct('gen-dining-chair', project)!;
    const occupied = v.items[0];
    const spot = findFreeSpot(project, v, chair, occupied.x, occupied.z, 0, 0);
    expect(Math.hypot(spot.x - occupied.x, spot.z - occupied.z)).toBeGreaterThan(10);
  });
});

describe('lightweight layoutTotals', () => {
  it('matches ergoReport totals and counts without invoking computeHeatmap', () => {
    const project = sampleProject();
    const priced = PRODUCTS.find((p) => (p.price ?? 0) > 0 && p.mount !== 'ceiling' && p.model !== 'rug')!;
    const v = {
      ...project.versions[0],
      items: [...project.versions[0].items, { id: 'priced-1', productId: priced.id, x: 300, z: 220, y: 0, rot: 0 }],
    };
    const fast = layoutTotals(project, v);
    const full = ergoReport(project, v);
    expect(fast.itemCount).toBe(full.itemCount);
    expect(fast.total).toBe(full.total);
    expect(fast.total).toBe(priced.price);
    expect(fast.floorArea).toBeCloseTo(full.floorArea, 5);
  });
});
