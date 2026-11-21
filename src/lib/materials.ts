import * as THREE from 'three';
import type { MatKind, MatSpec } from '../types';
import { stoneTexture, weaveTexture, woodTexture } from './textures';

export const MAT_KINDS: { value: MatKind; label: string }[] = [
  { value: 'fabric', label: '패브릭' },
  { value: 'boucle', label: '부클레' },
  { value: 'velvet', label: '벨벳' },
  { value: 'leather', label: '가죽' },
  { value: 'wood', label: '원목(밝은)' },
  { value: 'woodDark', label: '원목(진한)' },
  { value: 'lacquer', label: '도장/락카' },
  { value: 'plastic', label: '플라스틱' },
  { value: 'metal', label: '메탈(무광)' },
  { value: 'chrome', label: '크롬' },
  { value: 'brass', label: '황동' },
  { value: 'glass', label: '유리' },
  { value: 'stone', label: '석재' },
  { value: 'marble', label: '대리석' },
  { value: 'ceramic', label: '세라믹' },
  { value: 'rattan', label: '라탄' },
  { value: 'paper', label: '한지/종이' },
  { value: 'mirror', label: '거울' },
  { value: 'emissive', label: '발광' },
  { value: 'foliage', label: '식물' },
];

const cache = new Map<string, THREE.Material>();
const glowMats = new Set<THREE.MeshStandardMaterial>();
let lampsOn = false;

export function setLampGlow(on: boolean) {
  lampsOn = on;
  for (const m of glowMats) {
    m.emissiveIntensity = on ? 1.6 : 0.0;
  }
}

export function getMaterial(spec: MatSpec, opts: { selected?: boolean; ghost?: boolean; error?: boolean } = {}): THREE.Material {
  const key = `${spec.kind}|${spec.color}|${opts.ghost ? 'g' : ''}${opts.error ? 'e' : ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const color = new THREE.Color(spec.color);
  let m: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  switch (spec.kind) {
    case 'fabric':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, map: weaveTexture('fabric') });
      break;
    case 'boucle':
      m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, map: weaveTexture('boucle') });
      break;
    case 'velvet':
      m = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.85,
        sheen: 1,
        sheenRoughness: 0.4,
        sheenColor: color.clone().lerp(new THREE.Color('#ffffff'), 0.35),
        map: weaveTexture('velvet'),
      });
      break;
    case 'leather':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, clearcoat: 0.2, map: weaveTexture('leather') });
      break;
    case 'wood':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, map: woodTexture(false) });
      break;
    case 'woodDark':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, map: woodTexture(true) });
      break;
    case 'lacquer':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 });
      break;
    case 'plastic':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0 });
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.75 });
      break;
    case 'chrome':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 1 });
      break;
    case 'brass':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 1 });
      break;
    case 'glass':
      m = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.28,
        clearcoat: 1,
        depthWrite: false,
      });
      break;
    case 'mirror':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.02, metalness: 1 });
      break;
    case 'stone':
    case 'marble':
      m = new THREE.MeshPhysicalMaterial({
        color,
        roughness: spec.kind === 'marble' ? 0.25 : 0.7,
        clearcoat: spec.kind === 'marble' ? 0.5 : 0,
        map: stoneTexture(spec.kind === 'marble' ? 'marble' : 'concrete'),
      });
      break;
    case 'ceramic':
      m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.7 });
      break;
    case 'rattan':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, map: weaveTexture('rattan') });
      break;
    case 'paper': {
      const pm = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        map: weaveTexture('paper'),
        emissive: color.clone().lerp(new THREE.Color('#ffd9a0'), 0.6),
        emissiveIntensity: lampsOn ? 1.6 : 0,
        side: THREE.DoubleSide,
      });
      glowMats.add(pm);
      m = pm;
      break;
    }
    case 'emissive': {
      const em = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.4,
        emissive: new THREE.Color('#fff1d6'),
        emissiveIntensity: lampsOn ? 1.6 : 0,
      });
      glowMats.add(em);
      m = em;
      break;
    }
    case 'foliage':
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, side: THREE.DoubleSide });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  }
  if (opts.ghost) {
    m.transparent = true;
    m.opacity = 0.45;
    m.depthWrite = false;
  }
  if (opts.error) {
    m.emissive = new THREE.Color('#ff2a2a');
    m.emissiveIntensity = 0.35;
  }
  cache.set(key, m);
  return m;
}

/** Plain helper material for UI overlays */
export function flatMat(color: string, opacity = 1) {
  const key = `flat|${color}|${opacity}`;
  if (cache.has(key)) return cache.get(key)!;
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
  });
  cache.set(key, m);
  return m;
}

export const PALETTE_PRESETS: { name: string; colors: string[] }[] = [
  { name: '웜 미니멀', colors: ['#f3efe8', '#d9cfc1', '#b59a7a', '#7a6650', '#2f2a26'] },
  { name: '재팬디', colors: ['#ece6dc', '#c8b9a2', '#8c7a5f', '#5a5c4f', '#1f1f1d'] },
  { name: '미드센추리', colors: ['#e9dfcf', '#c96d3b', '#e2a53a', '#2f5d50', '#4a3426'] },
  { name: '모던 모노톤', colors: ['#f5f5f4', '#cfcfcf', '#8a8a8a', '#3b3b3b', '#121212'] },
  { name: '프렌치 빈티지', colors: ['#f4ece1', '#dcc6b0', '#9aa38f', '#6d7c8c', '#5b3a2e'] },
  { name: '스칸디', colors: ['#fafafa', '#e6e1d8', '#c9d3d6', '#9fb5a8', '#3d4a52'] },
];
