import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { MatSpec, ParamDef, ParamValue } from '../types';

// All generator units are centimetres; the caller scales the root by 0.01.

export interface GenCtx {
  w: number;
  d: number;
  h: number;
  p: Record<string, ParamValue>;
  mat: (slot: string) => THREE.Material;
  imageUrl?: string;
}

export interface ModelDef {
  key: string;
  label: string;
  slots: Record<string, { label: string; def: MatSpec }>;
  params: ParamDef[];
  build: (c: GenCtx) => THREE.Object3D;
}

/** Re-project UVs so textures keep a real-world scale (cm per tile). */
export function planarUV(geo: THREE.BufferGeometry, scale = 60) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  if (!pos || !nor) return geo;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material) {
  const me = new THREE.Mesh(geo, m);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

/** Box by size, centred at (x, y, z). */
export function box(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const me = mesh(planarUV(new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01))), m);
  me.position.set(x, y, z);
  g.add(me);
  return me;
}

/** Box from min/max corners. */
export function bb(g: THREE.Object3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: THREE.Material) {
  return box(g, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** Rounded box by size, centred. */
export function rbox(g: THREE.Object3D, w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const rr = Math.max(0.1, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
  const geo = new RoundedBoxGeometry(Math.max(w, 0.2), Math.max(h, 0.2), Math.max(d, 0.2), 3, rr);
  const me = mesh(planarUV(geo), m);
  me.position.set(x, y, z);
  g.add(me);
  return me;
}

export function rbb(g: THREE.Object3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, m: THREE.Material) {
  return rbox(g, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), r, m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** Vertical cylinder; y is the bottom. */
export function cyl(g: THREE.Object3D, rTop: number, rBot: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 24) {
  const me = mesh(planarUV(new THREE.CylinderGeometry(rTop, rBot, Math.max(h, 0.01), seg), 30), m);
  me.position.set(x, y + h / 2, z);
  g.add(me);
  return me;
}

/** Cylinder between two points. */
export function rod(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, seg = 12) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const L = dir.length();
  const me = mesh(new THREE.CylinderGeometry(r, r, L, seg), m);
  me.position.copy(a).add(b).multiplyScalar(0.5);
  me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.add(me);
  return me;
}

export function sphere(g: THREE.Object3D, r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const me = mesh(new THREE.SphereGeometry(r, 24, 16), m);
  me.position.set(x, y, z);
  me.scale.set(sx, sy, sz);
  g.add(me);
  return me;
}

export function lathe(g: THREE.Object3D, pts: [number, number][], m: THREE.Material, x = 0, y = 0, z = 0, seg = 32) {
  const geo = new THREE.LatheGeometry(
    pts.map(([r, yy]) => new THREE.Vector2(Math.max(0.001, r), yy)),
    seg,
  );
  const me = mesh(geo, m);
  me.position.set(x, y, z);
  g.add(me);
  return me;
}

export function torus(g: THREE.Object3D, R: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0, rotX = 0, rotY = 0, arc = Math.PI * 2) {
  const me = mesh(new THREE.TorusGeometry(R, r, 10, 40, arc), m);
  me.position.set(x, y, z);
  me.rotation.set(rotX, rotY, 0);
  g.add(me);
  return me;
}

/** Thin plane facing +z (for screens / images). */
export function plane(g: THREE.Object3D, w: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  me.position.set(x, y, z);
  g.add(me);
  return me;
}

export type LegStyle = 'square' | 'round' | 'tapered' | 'metal' | 'hairpin' | 'block' | 'bun' | 'none' | 'splayed';

/** A leg whose foot stands at (x, 0, z) and reaches height h. size = thickness. */
export function leg(g: THREE.Object3D, style: LegStyle | string, x: number, z: number, h: number, m: THREE.Material, size = 4, y0 = 0) {
  if (h <= 0.2 || style === 'none') return;
  switch (style) {
    case 'round':
      cyl(g, size / 2, size / 2, h, m, x, y0, z, 16);
      break;
    case 'tapered':
      cyl(g, size / 2, size / 3.2, h, m, x, y0, z, 16);
      break;
    case 'splayed': {
      const dx = Math.sign(x) * Math.min(4, h * 0.12);
      const dz = Math.sign(z) * Math.min(4, h * 0.12);
      rod(g, new THREE.Vector3(x - dx, y0 + h, z - dz), new THREE.Vector3(x, y0, z), size / 2.6, m);
      break;
    }
    case 'metal':
      cyl(g, size / 4, size / 4, h, m, x, y0, z, 10);
      break;
    case 'hairpin': {
      const r = 0.6;
      rod(g, new THREE.Vector3(x - 3, y0 + h, z), new THREE.Vector3(x, y0, z), r, m, 6);
      rod(g, new THREE.Vector3(x + 3, y0 + h, z), new THREE.Vector3(x, y0, z), r, m, 6);
      break;
    }
    case 'block':
      box(g, size * 1.6, h, size * 1.6, m, x, y0 + h / 2, z);
      break;
    case 'bun':
      sphere(g, Math.max(h / 2, 2), m, x, y0 + h / 2, z, 1.3, 1, 1.3);
      break;
    default:
      box(g, size, h, size, m, x, y0 + h / 2, z);
  }
}

export function num(p: Record<string, ParamValue>, k: string, def: number) {
  const v = p[k];
  return typeof v === 'number' && isFinite(v) ? v : def;
}
export function str(p: Record<string, ParamValue>, k: string, def: string) {
  const v = p[k];
  return typeof v === 'string' ? v : def;
}
export function bool(p: Record<string, ParamValue>, k: string, def: boolean) {
  const v = p[k];
  return typeof v === 'boolean' ? v : def;
}

export const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const LEG_OPTIONS = opts(
  ['square', '각진 다리'],
  ['round', '원형 다리'],
  ['tapered', '테이퍼드'],
  ['splayed', '벌어진 다리'],
  ['metal', '얇은 메탈'],
  ['hairpin', '헤어핀'],
  ['block', '블록'],
  ['bun', '번(공)'],
  ['none', '없음(바닥)'],
);
