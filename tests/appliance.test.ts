import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '../src/catalog/products';
import { paramVisible, resolveParams } from '../src/models';
import { applianceDef, fridgeEnclosureLayout } from '../src/models/fixtures';

const cabinet = new THREE.MeshBasicMaterial();
const appliance = new THREE.MeshBasicMaterial();
const build = (params: Record<string, string | number | boolean>, dims = { w: 64, d: 70, h: 240 }) =>
  applianceDef.build({ ...dims, p: { kind: 'fridge', ...params }, mat: (slot) => (slot === 'enclosure' ? cabinet : appliance) });
const boxOf = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
};

describe('refrigerator cabinet (enclosure)', () => {
  it('keeps the cabinet as the overall size and the refrigerator at its real size inside it', () => {
    const model = build({ enclosure: true, fridgeW: 59.5, fridgeH: 185.3, fridgeD: 66.9 });
    const bounds = boxOf(model);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeCloseTo(240);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(64);

    const fridge = boxOf(model.children.find((child) => child instanceof THREE.Group)!);
    expect(fridge.max.x - fridge.min.x).toBeCloseTo(59.5);
    expect(fridge.max.y).toBeCloseTo(185.3);
    // body + doors span the real depth; the door faces sit at the cabinet front (handles stick out)
    expect(fridge.min.z).toBeCloseTo(35 - 66.9);

    const upperDoors = model.children.filter((child) => {
      if (!(child instanceof THREE.Mesh) || child.material !== cabinet) return false;
      const box = boxOf(child);
      return box.min.y > 185.3 && box.max.x - box.min.x > 50 && box.min.z > 30;
    });
    expect(upperDoors).toHaveLength(1);
  });

  it('reports clearances and when the refrigerator does not fit', () => {
    const ok = fridgeEnclosureLayout(64, 70, 240, { fridgeW: 59.5, fridgeH: 185.3, fridgeD: 66.9 });
    expect(ok.fitsW && ok.fitsH && ok.fitsD).toBe(true);
    expect(ok.sideGap).toBeGreaterThanOrEqual(0.4);
    expect(ok.hasUpper).toBe(true);

    const narrow = fridgeEnclosureLayout(62, 70, 240, { fridgeW: 59.5, fridgeH: 185.3, fridgeD: 66.9 });
    expect(narrow.fitsW).toBe(false); // 62 − 2×1.8cm side panels is narrower than 59.5cm
    const short = fridgeEnclosureLayout(64, 70, 186, { fridgeW: 59.5, fridgeH: 185.3, fridgeD: 66.9 });
    expect(short.fitsH).toBe(false);
    expect(short.hasUpper).toBe(false);
    const shallow = fridgeEnclosureLayout(64, 60, 240, { fridgeW: 59.5, fridgeH: 185.3, fridgeD: 66.9 });
    expect(shallow.fitsD).toBe(false);
  });

  it('preserves existing freestanding refrigerators unless the enclosure is enabled', () => {
    const original = build({});
    const disabled = build({ enclosure: false, fridgeW: 40 });
    expect(boxOf(disabled)).toEqual(boxOf(original));
    original.traverse((child) => {
      if (child instanceof THREE.Mesh) expect(child.material).not.toBe(cabinet);
    });
  });

  it('shows refrigerator-only options only for refrigerators', () => {
    const byKey = Object.fromEntries(applianceDef.params.map((pd) => [pd.key, pd]));
    const fridge = { kind: 'fridge', enclosure: false };
    expect(paramVisible(byKey.enclosure, fridge)).toBe(true);
    expect(paramVisible(byKey.fridgeW, fridge)).toBe(false);
    expect(paramVisible(byKey.fridgeW, { ...fridge, enclosure: true })).toBe(true);
    expect(paramVisible(byKey.enclosure, { kind: 'washer' })).toBe(false);
    expect(paramVisible(byKey.doors, { kind: 'washer' })).toBe(false);
    expect(paramVisible(byKey.kind, { kind: 'washer' })).toBe(true);
  });

  it('offers a slim 59.5cm two-door refrigerator in the catalog', () => {
    const slim = PRODUCTS.find((p) => p.id === 'gen-fridge-slim-2')!;
    expect(slim.dims).toEqual({ w: 59.5, d: 66.9, h: 185.3 });
    expect(resolveParams(slim).doors).toBe('2');
  });
});
