import * as THREE from 'three';
import { getMaterial } from '../lib/materials';
import type { MatSpec, ParamDef, ParamValue, PlacedItem, Product } from '../types';
import { activityDef, applianceDef, bathDef, kitchenDef, screenDef } from './fixtures';
import { blockDef, curtainDef, decorDef, frameDef, lampDef, mirrorDef, plantDef, rugDef } from './living';
import type { ModelDef } from './parts';
import { benchDef, chairDef, loungeDef, officeDef, sofaDef } from './seating';
import { caseDef, rackDef, shelfDef } from './storage';
import { bedDef, tableDef } from './tables';
import { vanityDef } from './vanity';

export const MODELS: Record<string, ModelDef> = Object.fromEntries(
  [
    sofaDef,
    chairDef,
    officeDef,
    loungeDef,
    benchDef,
    tableDef,
    bedDef,
    caseDef,
    shelfDef,
    rackDef,
    lampDef,
    rugDef,
    curtainDef,
    plantDef,
    frameDef,
    mirrorDef,
    decorDef,
    blockDef,
    applianceDef,
    screenDef,
    kitchenDef,
    bathDef,
    activityDef,
    vanityDef,
  ].map((d) => [d.key, d]),
);

export function itemDims(it: PlacedItem | undefined, p: Product) {
  return it?.dims ?? p.dims;
}

export function resolveParams(p: Product, it?: PlacedItem): Record<string, ParamValue> {
  const def = MODELS[p.model];
  const out: Record<string, ParamValue> = {};
  if (def) for (const pd of def.params) out[pd.key] = pd.default;
  Object.assign(out, p.params ?? {}, it?.params ?? {});
  return out;
}

/** Whether a param control applies to the current values (e.g. fridge-only options). */
export function paramVisible(pd: ParamDef, params: Record<string, ParamValue>) {
  return !pd.when || Object.entries(pd.when).every(([k, vals]) => vals.includes(params[k]));
}

export function resolveMats(p: Product, it?: PlacedItem): Record<string, MatSpec> {
  const def = MODELS[p.model];
  const out: Record<string, MatSpec> = {};
  if (def) for (const [k, s] of Object.entries(def.slots)) out[k] = s.def;
  Object.assign(out, p.mats ?? {}, it?.mats ?? {});
  return out;
}

/** Build the procedural model for a product (units: cm). */
export function buildProcedural(p: Product, it: PlacedItem | undefined, opts: { ghost?: boolean; error?: boolean; imageUrl?: string } = {}) {
  const def = MODELS[p.model] ?? MODELS.block;
  const dims = itemDims(it, p);
  const params = resolveParams(p, it);
  const mats = resolveMats(p, it);
  const root = new THREE.Group();
  let inner: THREE.Object3D;
  try {
    inner = def.build({
      w: dims.w,
      d: dims.d,
      h: dims.h,
      p: params,
      mat: (slot) => getMaterial(mats[slot] ?? { kind: 'plastic', color: '#cccccc' }, opts),
      imageUrl: opts.imageUrl,
    });
  } catch (e) {
    console.warn('model build failed', p.id, e);
    inner = MODELS.block.build({ w: dims.w, d: dims.d, h: dims.h, p: {}, mat: () => getMaterial({ kind: 'plastic', color: '#cccccc' }, opts) });
  }
  if (opts.ghost || opts.error) {
    inner.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m.material as THREE.Material).transparent) {
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        if (opts.ghost) {
          mat.transparent = true;
          mat.opacity = 0.5;
          mat.depthWrite = false;
        }
        if (opts.error && 'emissive' in mat) {
          mat.emissive = new THREE.Color('#ff2a2a');
          mat.emissiveIntensity = 0.35;
        }
        m.material = mat;
      }
    });
  }
  root.add(inner);
  return root; // centimetres — the world group is scaled to metres
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) m.geometry?.dispose();
  });
}
