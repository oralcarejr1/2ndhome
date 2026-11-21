import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { getBlob } from '../store/persistence';
import type { ModelAsset } from '../types';

const cache = new Map<string, Promise<THREE.Object3D>>();

export function detectFormat(fileName: string): ModelAsset['format'] | null {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'glb' || ext === 'gltf' || ext === 'obj' || ext === 'fbx' || ext === 'stl') return ext;
  return null;
}

export function loadRaw(asset: ModelAsset): Promise<THREE.Object3D> {
  const key = asset.blobId;
  if (cache.has(key)) return cache.get(key)!;
  const pr = (async () => {
    const blob = await getBlob(asset.blobId);
    if (!blob) throw new Error('모델 파일을 이 기기에서 찾을 수 없어요');
    const buf = await blob.arrayBuffer();
    switch (asset.format) {
      case 'glb':
      case 'gltf': {
        const loader = new GLTFLoader();
        const gltf = await loader.parseAsync(asset.format === 'gltf' ? new TextDecoder().decode(buf) : buf, '');
        return gltf.scene;
      }
      case 'obj':
        return new OBJLoader().parse(new TextDecoder().decode(buf));
      case 'fbx':
        return new FBXLoader().parse(buf, '');
      case 'stl': {
        const geo = new STLLoader().parse(buf);
        geo.computeVertexNormals();
        return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#cfcac2', roughness: 0.6 }));
      }
    }
  })();
  cache.set(key, pr);
  pr.catch(() => cache.delete(key));
  return pr;
}

/** Clone and fit a raw model into a W×D×H (cm) box: bottom at y=0, centred on x/z, front = +z. Returns object in metres. */
export function fitModel(raw: THREE.Object3D, asset: ModelAsset, dims: { w: number; d: number; h: number }, tint?: THREE.Material): THREE.Object3D {
  const inner = raw.clone(true);
  inner.rotation.set(THREE.MathUtils.degToRad(asset.rotX), THREE.MathUtils.degToRad(asset.rotY), 0);
  const holder = new THREE.Group();
  holder.add(inner);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  const W = dims.w / 100;
  const D = dims.d / 100;
  const H = dims.h / 100;
  let sx = W / (size.x || 1);
  let sy = H / (size.y || 1);
  let sz = D / (size.z || 1);
  if (asset.fit === 'uniform') {
    const s = Math.min(sx, sy, sz);
    sx = sy = sz = s;
  }
  const center = box.getCenter(new THREE.Vector3());
  inner.position.set(-center.x, -box.min.y, -center.z);
  const outer = new THREE.Group();
  outer.add(holder);
  holder.scale.set(sx, sy, sz);
  holder.position.set(0, 0, 0);
  // correct for position offset applied before scale
  inner.position.multiply(new THREE.Vector3(1, 1, 1));
  outer.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      if (tint && !asset.keepMaterials) m.material = tint;
    }
  });
  return outer;
}

/** Measure a raw model's natural bounding box (in its own units, after rotation fix). */
export function measureRaw(raw: THREE.Object3D, rotX: number, rotY: number) {
  const inner = raw.clone(true);
  inner.rotation.set(THREE.MathUtils.degToRad(rotX), THREE.MathUtils.degToRad(rotY), 0);
  const g = new THREE.Group();
  g.add(inner);
  g.updateMatrixWorld(true);
  const s = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  return { x: s.x, y: s.y, z: s.z };
}
