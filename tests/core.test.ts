import { describe, expect, it } from 'vitest';
import { sampleProject } from '../src/catalog/seed';
import { PRODUCTS } from '../src/catalog/products';
import { getProduct, registerProducts, withOwnProducts } from '../src/store/store';
import type { Product } from '../src/types';
import { computeChecks, computeHeatmap, computeIssues, sideGaps } from '../src/lib/analysis';
import { anthro, fitsThrough, ideals, tiltUpHeight } from '../src/lib/ergonomics';
import { localToWorld, pointInPoly, polyArea, polyOverlap, raySeg, worldToLocal } from '../src/lib/geometry';
import { MODELS } from '../src/models';

describe('geometry', () => {
  it('local/world round trip matches three.js rotation.y', () => {
    const [wx, wz] = localToWorld(100, 50, 90, 0, 10); // front (+z local) of an item rotated 90°
    expect(wx).toBeCloseTo(110);
    expect(wz).toBeCloseTo(50);
    const [lx, lz] = worldToLocal(100, 50, 90, wx, wz);
    expect(lx).toBeCloseTo(0);
    expect(lz).toBeCloseTo(10);
  });
  it('overlap / containment / rays', () => {
    const a: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const b: [number, number][] = [[8, 8], [18, 8], [18, 18], [8, 18]];
    const c: [number, number][] = [[10, 0], [20, 0], [20, 10], [10, 10]];
    expect(polyOverlap(a, b)).toBeCloseTo(2);
    expect(polyOverlap(a, c)).toBe(0); // touching is not overlapping
    expect(pointInPoly([5, 5], a)).toBe(true);
    expect(polyArea(a)).toBe(100);
    expect(raySeg([0, 5], [1, 0], [20, 0], [20, 10])).toBeCloseTo(20);
  });
});

describe('ergonomics', () => {
  it('ideal heights for 170cm', () => {
    const i = ideals(170);
    expect(i.chairSeat).toBeCloseTo(41.5, 1);
    expect(i.deskH).toBeGreaterThan(70);
    expect(i.deskH).toBeLessThan(75);
    expect(i.counterH).toBe(90);
    expect(anthro(170).eyeH).toBeCloseTo(159.1, 0);
  });
  it('move-in and tilt-up', () => {
    expect(fitsThrough({ w: 228, d: 95, h: 83 }, 61, 210)).toBe(false);
    expect(fitsThrough({ w: 228, d: 95, h: 83 }, 90, 210)).toBe(true);
    expect(tiltUpHeight(236, 58)).toBeGreaterThan(240); // PAX 236 can't be tilted up under a 240 ceiling
  });
});

describe('catalog', () => {
  it('ids are unique and every product has a generator', () => {
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length);
    for (const p of PRODUCTS) {
      expect(MODELS[p.model], p.id).toBeTruthy();
      expect(p.dims.w > 0 && p.dims.d > 0 && p.dims.h > 0, p.id).toBe(true);
    }
  });
  it('a home’s own products travel with its project and repair older copies', () => {
    const own: Product = { ...getProduct('gen-sofa-2')!, id: 'home-sofa', name: '우리 집 소파', builtin: false };
    const restored = sampleProject();
    restored.customProducts = [own];
    const older = sampleProject(); // same home saved before the definition travelled with it
    older.versions[0].items[0].productId = 'home-sofa';
    expect(getProduct('home-sofa', older)).toBeUndefined();
    registerProducts([restored]);
    const fixed = withOwnProducts(older);
    expect(fixed.customProducts.map((p) => p.id)).toEqual(['home-sofa']);
    expect(withOwnProducts(fixed)).toBe(fixed); // nothing left to add
  });
});

describe('sample room', () => {
  const p = sampleProject();
  it('layouts have no collisions or blocked doors', () => {
    for (const v of p.versions) {
      const issues = computeIssues(p, v);
      const bad = [...issues.entries()].filter(([, l]) => l.some((x) => x.level === 'bad'));
      expect(bad.map(([id, l]) => `${v.name} ${v.items.find((i) => i.id === id)?.productId}: ${l.map((x) => x.msg).join(', ')}`)).toEqual([]);
    }
  });
  it('heatmap and checks run', () => {
    const v = p.versions[0];
    const heat = computeHeatmap(p, v, p.profiles[0])!;
    expect(heat.nx * heat.nz).toBeGreaterThan(1000);
    expect(heat.minPass).toBeGreaterThan(0);
    const checks = computeChecks(p, v, p.profiles[0], heat);
    expect(checks.length).toBeGreaterThan(5);
    const bed = v.items.find((i) => i.productId === 'gen-bed-q')!;
    const gaps = sideGaps(p, v, bed.id);
    expect(gaps.find((g) => g.side === 'back')!.dist).toBeLessThan(2); // headboard against the wall
  });
});
