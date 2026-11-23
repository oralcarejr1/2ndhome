import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applianceDef } from '../src/models/fixtures';

const cabinet = new THREE.MeshBasicMaterial();
const appliance = new THREE.MeshBasicMaterial();
const build = (params: Record<string, string | number | boolean>) => applianceDef.build({
  w: 80, d: 70, h: 260, p: { kind: 'fridge', ...params },
  mat: (slot) => slot === 'enclosure' ? cabinet : appliance,
});

describe('appliance enclosure', () => {
  it('fits one upper compartment and the refrigerator within the total cabinet height', () => {
    const model = build({ enclosure: true, upperH: 55 });
    const bounds = new THREE.Box3().setFromObject(model);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.max.y).toBeCloseTo(260);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(80);

    const refrigerator = model.children.find((child) => child instanceof THREE.Group)!;
    const fridgeBounds = new THREE.Box3().setFromObject(refrigerator);
    expect(fridgeBounds.max.y).toBeCloseTo(205);
    expect(fridgeBounds.min.x).toBeGreaterThan(bounds.min.x);
    expect(fridgeBounds.max.x).toBeLessThan(bounds.max.x);

    const upperDoors = model.children.filter((child) => {
      if (!(child instanceof THREE.Mesh) || child.material !== cabinet) return false;
      const box = new THREE.Box3().setFromObject(child);
      return box.min.y > 205 && box.max.x - box.min.x > 70 && box.min.z > 30;
    });
    expect(upperDoors).toHaveLength(1);
  });

  it('preserves existing freestanding refrigerators unless the enclosure is enabled', () => {
    const original = build({});
    const disabled = build({ enclosure: false, upperH: 55 });
    expect(new THREE.Box3().setFromObject(disabled)).toEqual(new THREE.Box3().setFromObject(original));
    original.traverse((child) => {
      if (child instanceof THREE.Mesh) expect(child.material).not.toBe(cabinet);
    });
  });
});
