import { describe, expect, it } from 'vitest';
import { computeIssues } from '../src/lib/analysis';
import { pointInPoly } from '../src/lib/geometry';
import {
  applyCarry,
  bodyOf,
  canStack,
  hostBodies,
  pickSupport,
  planCarry,
  ridersOf,
  stackDragContext,
  topUnder,
} from '../src/lib/stack';
import { sampleProject } from '../src/catalog/seed';
import { getProduct } from '../src/store/store';
import type { PlacedItem, Vec2 } from '../src/types';

const lookup = (id: string) => getProduct(id);
const prod = (id: string) => getProduct(id)!;
const item = (id: string, productId: string, x: number, z: number, extra: Partial<PlacedItem> = {}): PlacedItem => ({ id, productId, x, z, y: 0, rot: 0, ...extra });
const guest = (productId: string) => ({ prod: prod(productId), ...prod(productId).dims });

/** Desk 120×60×72 centred at (200, 100), its back edge at z = 70. */
const desk = () => item('desk', 'gen-desk-120', 200, 100);

describe('what can go on top of what', () => {
  it('small furniture stacks, seating and tall pieces stay on the floor', () => {
    expect(canStack(prod('gen-nightstand'), 50)).toBe(true);
    expect(canStack(prod('gen-dryer'), 99)).toBe(true);
    expect(canStack(prod('gen-monitor-27'), 45)).toBe(true);
    expect(canStack(prod('gen-dining-chair'), 80)).toBe(false); // chairs tuck under desks
    expect(canStack(prod('gen-floor-drum'), 160)).toBe(false);
    expect(canStack(prod('gen-desk-140'), 72)).toBe(false);
    expect(canStack(prod('gen-wallshelf-60'), 2.5)).toBe(false);
  });

  it('desks and cabinets have a top, chairs and lamps do not', () => {
    const items = [desk(), item('c', 'gen-dining-chair', 400, 100), item('l', 'gen-floor-drum', 500, 100), item('s', 'gen-sideboard', 600, 100)];
    expect(hostBodies(items, lookup).map((b) => b.it.id)).toEqual(['desk', 's']);
  });
});

describe('putting things on a desk', () => {
  const ceiling = 240;
  const hosts = () => hostBodies([desk()], lookup);

  it('a nightstand dropped over the desk lands on its top, facing the same way and inside the edges', () => {
    const hit = pickSupport(hosts(), () => [250, 120], guest('gen-nightstand'), 37, ceiling, { faceHost: true })!;
    expect(hit.host.it.id).toBe('desk');
    expect(hit.y).toBe(72);
    expect(hit.rot).toBe(0);
    // 45×40 stays within the 120×60 top: x ≤ 260 - 22.5, z ≤ 130 - 20
    expect(hit.x).toBeCloseTo(237.5); // flush with the right edge
    expect(hit.z).toBeCloseTo(110); // flush with the front edge
  });

  it('snaps flush to the back edge and keeps a slight turn squared to the desk', () => {
    const hit = pickSupport(hosts(), () => [200, 92], guest('gen-nightstand'), 12, ceiling)!;
    expect(hit.rot).toBe(0);
    expect(hit.z).toBeCloseTo(90); // back edge 70 + half depth 20
    expect(hit.x).toBeCloseTo(200);
  });

  it('things that do not fit on the top, or the pointer off the desk, fall through to the floor', () => {
    expect(pickSupport(hosts(), () => [200, 100], guest('gen-sideboard'), 0, ceiling)).toBeNull();
    expect(pickSupport(hosts(), () => [400, 100], guest('gen-nightstand'), 0, ceiling)).toBeNull();
  });

  it('a monitor may overhang a narrow top and is centred on it', () => {
    const shelf = item('sh', 'gen-wallshelf-60', 200, 100, { y: 140 });
    const hit = pickSupport(hostBodies([shelf], lookup), () => [215, 100], guest('gen-monitor-27'), 0, ceiling)!;
    expect(hit.y).toBeCloseTo(142.5);
    expect(hit.x).toBeCloseTo(200); // 61 wide on a 60 shelf
  });

  it('the highest top under the pointer wins (box on a cabinet on a desk)', () => {
    const cab = item('cab', 'gen-nightstand', 200, 100, { y: 72 });
    const hit = pickSupport(hostBodies([desk(), cab], lookup), () => [200, 100], guest('gen-vase'), 0, ceiling)!;
    expect(hit.host.it.id).toBe('cab');
    expect(hit.y).toBe(122);
  });

  it('a dryer goes on a washer, but not when it would hit the ceiling', () => {
    const washer = item('w', 'gen-washer', 100, 100);
    const hit = pickSupport(hostBodies([washer], lookup), () => [100, 100], guest('gen-dryer'), 0, 240)!;
    expect(hit.y).toBe(99);
    expect(pickSupport(hostBodies([washer], lookup), () => [100, 100], guest('gen-dryer'), 0, 190)).toBeNull();
  });

  it('in 3D each top is hit where the pointer ray crosses its height', () => {
    // a ray sloping down toward +z: at height 72 it is over the desk, at the floor it is past it
    const at = (top: number): Vec2 => [200, 100 + (72 - top) * 2];
    expect(pickSupport(hosts(), at, guest('gen-nightstand'), 0, ceiling)?.host.it.id).toBe('desk');
  });
});

describe('dragging', () => {
  it('a drawer unit tucked under the desk stays under it', () => {
    const items = [desk(), item('dr', 'gen-nightstand', 230, 100)];
    const ctx = stackDragContext(items, ['dr'], 'dr', lookup);
    expect(ctx.gravity).toBe(true);
    expect(ctx.exclude.has('desk')).toBe(true);
  });

  it('a lamp on the desk can slide over it, and whatever stands on a dragged piece is not a landing spot', () => {
    const items = [desk(), item('cab', 'gen-nightstand', 200, 90, { y: 72 }), item('lamp', 'gen-table-lamp', 200, 90, { y: 122 })];
    const ctx = stackDragContext(items, ['cab'], 'cab', lookup);
    expect(ctx.gravity).toBe(true);
    expect(ctx.exclude.has('desk')).toBe(false);
    expect(ctx.riders).toEqual(['lamp']);
    expect(ctx.exclude.has('lamp')).toBe(true);
  });

  it('a piece floating at an arbitrary height keeps its height', () => {
    const items = [desk(), item('box', 'gen-nightstand', 500, 100, { y: 30 })];
    expect(stackDragContext(items, ['box'], 'box', lookup).gravity).toBe(false);
  });
});

describe('moving a desk moves what is on it', () => {
  const scene = () => [
    desk(),
    item('mon', 'gen-monitor-27', 200, 80, { y: 72 }),
    item('cab', 'gen-nightstand', 240, 90, { y: 72 }),
    item('lamp', 'gen-table-lamp', 240, 90, { y: 122 }),
    item('chair', 'gen-dining-chair', 200, 140),
    item('fixed', 'gen-vase', 160, 110, { y: 72, locked: true }),
  ];
  const move = (items: PlacedItem[], ids: string[], fn: (it: PlacedItem) => void) => {
    const plan = planCarry(items, new Set(ids), lookup);
    for (const it of items) if (ids.includes(it.id)) fn(it);
    applyCarry(items, plan, lookup);
    return Object.fromEntries(items.map((i) => [i.id, i]));
  };

  it('finds everything standing on the desk, including on top of what stands on it', () => {
    expect([...ridersOf(scene(), ['desk'], lookup)].sort()).toEqual(['cab', 'lamp', 'mon']);
  });

  it('slides and turns them with the desk; the chair and locked pieces stay', () => {
    const r = move(scene(), ['desk'], (it) => {
      it.x += 100;
      it.rot = 90;
    });
    // monitor was 20cm behind the desk centre (−z); after a 90° turn that is −x
    expect(r.mon.x).toBeCloseTo(280);
    expect(r.mon.z).toBeCloseTo(100);
    expect(r.mon.rot).toBe(90);
    expect(r.lamp.x).toBeCloseTo(r.cab.x);
    expect(r.lamp.z).toBeCloseTo(r.cab.z);
    expect(r.lamp.y).toBe(122);
    expect(r.chair.x).toBe(200);
    expect(r.fixed.x).toBe(160);
    const deskBody = bodyOf(r.desk, prod('gen-desk-120'));
    expect(pointInPoly([r.cab.x, r.cab.z], deskBody.poly)).toBe(true);
  });

  it('a standing desk lifts what is on it', () => {
    const items = [item('sd', 'gen-motion', 0, 0), item('mon', 'gen-monitor-27', 0, -15, { y: 73 })];
    const r = move(items, ['sd'], (it) => (it.params = { curH: 110 }));
    expect(r.mon.y).toBe(110);
  });

  it('lifting a cabinet onto a desk lifts the lamp on it', () => {
    const items = [desk(), item('cab', 'gen-nightstand', 400, 100), item('lamp', 'gen-table-lamp', 400, 100, { y: 50 })];
    const r = move(items, ['cab'], (it) => {
      it.x = 200;
      it.y = 72;
    });
    expect(r.lamp.x).toBe(200);
    expect(r.lamp.y).toBe(122);
  });

  it('dragging one desk past another does not pick up the other desk’s lamp', () => {
    // mid-drag the moving desk overlaps desk2 right under its lamp
    const items = [item('desk', 'gen-desk-120', 290, 100), item('desk2', 'gen-desk-120', 320, 100), item('lamp', 'gen-table-lamp', 300, 100, { y: 72 })];
    const r = move(items, ['desk'], (it) => (it.x = 200));
    expect(r.lamp.x).toBe(300);
  });

  it('things moved together are not moved twice', () => {
    const r = move(scene(), ['desk', 'mon'], (it) => (it.x += 10));
    expect(r.mon.x).toBe(210);
    expect(r.cab.x).toBe(250);
  });
});

describe('the 위 button and checks', () => {
  it('finds the top under an item', () => {
    const items = [desk(), item('box', 'gen-nightstand', 210, 95, { y: 10 })];
    expect(topUnder(items, 'box', lookup)?.it.id).toBe('desk');
    expect(topUnder([desk(), item('box', 'gen-nightstand', 500, 95)], 'box', lookup)).toBeNull();
  });

  it('a drawer chest on a desk is not flagged for the desk blocking its drawers or overlapping it', () => {
    const p = sampleProject();
    const v = p.versions[0];
    const desk0 = v.items.find((i) => i.productId === 'gen-desk-120')!;
    const box: PlacedItem = { id: 'box', productId: 'gen-dresser-wide', x: desk0.x, z: desk0.z, y: 72, rot: desk0.rot };
    const issues = computeIssues(p, { ...v, items: [...v.items, box] });
    const mine = (issues.get('box') ?? []).map((i) => i.msg);
    expect(mine.filter((m) => m.includes('책상'))).toEqual([]);
  });
});
