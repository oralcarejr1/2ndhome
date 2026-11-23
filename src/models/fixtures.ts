import * as THREE from 'three';
import { getMaterial } from '../lib/materials';
import { screenTexture } from '../lib/textures';
import { bb, bool, box, cyl, GenCtx, lathe, ModelDef, num, opts, plane, rbb, rbox, rod, sphere, str, torus } from './parts';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const dark = () => getMaterial({ kind: 'plastic', color: '#1d1d1f' });
const steel = () => getMaterial({ kind: 'chrome', color: '#c9ccd0' });

// ---------------------------------------------------------------- Appliances
function buildAppliance(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const body = c.mat('body');
  const panel = c.mat('panel');
  const kind = str(p, 'kind', 'fridge');
  const gap = 0.4;
  if (kind === 'fridge' && bool(p, 'enclosure', false)) {
    const t = Math.min(1.8, w / 8, d / 8, h / 12);
    const upperH = Math.min(Math.max(t * 3, num(p, 'upperH', 40)), h * 0.8);
    const fridgeH = h - upperH;
    const cabinet = c.mat('enclosure');
    // Overall dimensions include the full-height side panels and one upper compartment.
    bb(g, -w / 2, 0, -d / 2, -w / 2 + t, h, d / 2, cabinet);
    bb(g, w / 2 - t, 0, -d / 2, w / 2, h, d / 2, cabinet);
    bb(g, -w / 2 + t, h - t, -d / 2, w / 2 - t, h, d / 2, cabinet);
    bb(g, -w / 2 + t, fridgeH, -d / 2, w / 2 - t, fridgeH + t, d / 2, cabinet);
    bb(g, -w / 2 + t, fridgeH + t, -d / 2, w / 2 - t, h - t, -d / 2 + t / 3, cabinet);
    bb(g, -w / 2 + t + 0.2, fridgeH + t + 0.2, d / 2 - t, w / 2 - t - 0.2, h - t - 0.2, d / 2, cabinet);
    g.add(buildAppliance({ ...c, w: w - 2 * t, h: fridgeH, p: { ...p, enclosure: false } }));
    return g;
  }
  switch (kind) {
    case 'fridge': {
      const doors = str(p, 'doors', '2');
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2 - 4, 1, body);
      const fz = d / 2 - 4;
      const door = (x0: number, y0: number, x1: number, y1: number, hx: number) => {
        rbb(g, x0 + gap, y0 + gap, fz, x1 - gap, y1 - gap, d / 2, 0.8, panel);
        bb(g, hx - 0.6, (y0 + y1) / 2 - Math.min(20, (y1 - y0) * 0.3), d / 2, hx + 0.6, (y0 + y1) / 2 + Math.min(20, (y1 - y0) * 0.3), d / 2 + 0.8, getMaterial({ kind: 'metal', color: '#8d8d8d' }));
      };
      if (doors === '1') door(-w / 2, 2, w / 2, h, w / 2 - 5);
      else if (doors === '2') {
        door(-w / 2, 2, w / 2, h * 0.32, w / 2 - 5);
        door(-w / 2, h * 0.32, w / 2, h, w / 2 - 5);
      } else if (doors === 'side') {
        door(-w / 2, 2, 0, h, -2);
        door(0, 2, w / 2, h, 2);
      } else {
        // 4-door (Korean style): two upper, two lower
        door(-w / 2, h * 0.42, 0, h, -2);
        door(0, h * 0.42, w / 2, h, 2);
        door(-w / 2, 2, 0, h * 0.42, -2);
        door(0, 2, w / 2, h * 0.42, 2);
      }
      break;
    }
    case 'washer':
    case 'dryer': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 2, body);
      bb(g, -w / 2 + 2, h - 14, d / 2, w / 2 - 2, h - 2, d / 2 + 0.4, panel);
      const r = Math.min(w, h) * 0.3;
      torus(g, r, 2.5, getMaterial({ kind: 'chrome', color: '#b0b4b8' }), 0, h * 0.45, d / 2 + 1);
      const gl = new THREE.Mesh(new THREE.CircleGeometry(r - 1, 40), getMaterial({ kind: 'glass', color: '#2a3540' }));
      gl.position.set(0, h * 0.45, d / 2 + 0.6);
      g.add(gl);
      break;
    }
    case 'tower': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 2, body);
      bb(g, -w / 2 + 2, h * 0.47, d / 2, w / 2 - 2, h * 0.53, d / 2 + 0.6, panel);
      for (const cy of [h * 0.24, h * 0.74]) {
        const r = Math.min(w * 0.32, h * 0.18);
        torus(g, r, 2.5, getMaterial({ kind: 'chrome', color: '#b0b4b8' }), 0, cy, d / 2 + 1);
        const gl = new THREE.Mesh(new THREE.CircleGeometry(r - 1, 40), getMaterial({ kind: 'glass', color: '#2a3540' }));
        gl.position.set(0, cy, d / 2 + 0.6);
        g.add(gl);
      }
      break;
    }
    case 'styler': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2 - 3, 1.5, body);
      rbb(g, -w / 2 + gap, gap, d / 2 - 3, w / 2 - gap, h - gap, d / 2, 1, panel);
      bb(g, w / 2 - 5, h * 0.45, d / 2, w / 2 - 4, h * 0.6, d / 2 + 1, dark());
      break;
    }
    case 'aircon': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, Math.min(w, d) * 0.35, body);
      bb(g, -w / 2 + 3, h * 0.55, d / 2 - 0.5, w / 2 - 3, h * 0.92, d / 2 + 0.1, panel);
      break;
    }
    case 'aircon-wall': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 4, body);
      bb(g, -w / 2 + 3, 1, d / 2 - 6, w / 2 - 3, 4, d / 2 - 1, panel);
      break;
    }
    case 'purifier': {
      if (bool(p, 'round', true)) {
        cyl(g, w / 2, w / 2, h, body, 0, 0, 0, 40);
        cyl(g, w / 2 - 1, w / 2 - 1, 2, panel, 0, h, 0, 40);
      } else {
        rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 3, body);
        bb(g, -w / 2 + 2, h - 2, -d / 2 + 2, w / 2 - 2, h + 0.4, d / 2 - 2, panel);
      }
      break;
    }
    case 'disposer': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 3, body);
      rbb(g, -w / 2 + 1, h - 6, -d / 2 + 1, w / 2 - 1, h + 0.5, d / 2 - 1, 2, panel);
      break;
    }
    case 'microwave': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 1, body);
      bb(g, -w / 2 + 2, 2, d / 2, w / 2 - 12, h - 2, d / 2 + 0.3, getMaterial({ kind: 'glass', color: '#1e2328' }));
      bb(g, w / 2 - 11, 2, d / 2, w / 2 - 2, h - 2, d / 2 + 0.3, panel);
      break;
    }
    case 'vacuum': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 3, body);
      cyl(g, Math.min(w, 34) / 2, Math.min(w, 34) / 2, 9, panel, 0, 0, d / 2 + 14, 40);
      break;
    }
    case 'coffee': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 2, body);
      bb(g, -w / 2 + 3, 2, d / 2 - 1, w / 2 - 3, h * 0.42, d / 2 + 0.4, getMaterial({ kind: 'plastic', color: '#1d1d1f' }));
      cyl(g, 4, 4, 3, panel, -w * 0.12, h * 0.55, d / 2 + 2);
      rod(g, V(-w * 0.12, h * 0.56, d / 2 + 2), V(-w * 0.12, h * 0.56, d / 2 + 12), 0.9, getMaterial({ kind: 'plastic', color: '#1d1d1f' }));
      cyl(g, w * 0.14, w * 0.18, h * 0.22, getMaterial({ kind: 'glass', color: '#3b2c22' }), w * 0.22, h, -d * 0.1);
      break;
    }
    case 'induction': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 0.8, getMaterial({ kind: 'glass', color: '#111214' }));
      break;
    }
    default:
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 1, body);
  }
  return g;
}

export const applianceDef: ModelDef = {
  key: 'appliance',
  label: '가전',
  slots: {
    body: { label: '본체', def: { kind: 'lacquer', color: '#e9e7e2' } },
    panel: { label: '도어/패널', def: { kind: 'lacquer', color: '#dedad3' } },
    enclosure: { label: '붙박이장', def: { kind: 'lacquer', color: '#efede8' } },
  },
  params: [
    {
      key: 'kind',
      label: '종류',
      type: 'select',
      default: 'fridge',
      options: opts(
        ['fridge', '냉장고'],
        ['washer', '드럼세탁기'],
        ['dryer', '건조기'],
        ['tower', '세탁건조 일체형(타워)'],
        ['styler', '의류관리기'],
        ['aircon', '스탠드 에어컨'],
        ['aircon-wall', '벽걸이 에어컨'],
        ['purifier', '공기청정기'],
        ['disposer', '음식물처리기'],
        ['microwave', '전자레인지/오븐'],
        ['vacuum', '로봇청소기 스테이션'],
        ['coffee', '커피머신'],
        ['induction', '인덕션(빌트인)'],
        ['box', '기타(상자형)'],
      ),
    },
    { key: 'doors', label: '냉장고 도어', type: 'select', default: '2', options: opts(['1', '1도어'], ['2', '2도어(상냉장 하냉동)'], ['side', '양문형'], ['4', '4도어']) },
    { key: 'enclosure', label: '냉장고 붙박이장 · 상부 수납칸', type: 'bool', default: false },
    { key: 'upperH', label: '상부 수납칸 높이 (전체 높이에 포함)', type: 'number', default: 40, min: 5, max: 120, unit: 'cm' },
    { key: 'round', label: '원통형(청정기)', type: 'bool', default: true },
  ],
  build: buildAppliance,
};

// ---------------------------------------------------------------- TV / monitor / piano
function buildScreen(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const body = c.mat('body');
  const kind = str(p, 'kind', 'tv');
  const stand = str(p, 'stand', 'feet');
  const screenM = new THREE.MeshStandardMaterial({ map: screenTexture(), roughness: 0.2, metalness: 0.1 });
  if (kind === 'monitor') {
    const sh = h - 12;
    const sw = w;
    rbb(g, -sw / 2, h - sh, -1.5, sw / 2, h, 1, 0.5, dark());
    plane(g, sw - 1.5, sh - 1.5, screenM, 0, h - sh / 2, 1.02);
    rod(g, V(0, h - sh / 2, -1.5), V(0, 2, -d / 2 + 6), 1.5, body);
    rbb(g, -11, 0, -d / 2, 11, 1.5, d / 2 - 2, 1, body);
    return g;
  }
  if (kind === 'piano' || kind === 'digitalPiano') {
    const keysY = kind === 'piano' ? 72 : 74;
    if (kind === 'piano') {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, -d / 2 + d * 0.55, 1, body);
      bb(g, -w / 2, 0, -d / 2, -w / 2 + 5, keysY + 6, d / 2 - 2, body);
      bb(g, w / 2 - 5, 0, -d / 2, w / 2, keysY + 6, d / 2 - 2, body);
      bb(g, -w / 2 + 5, keysY - 4, -d / 2 + d * 0.55, w / 2 - 5, keysY, d / 2 - 4, body);
    } else {
      rbb(g, -w / 2, keysY - 8, -d / 2, w / 2, keysY + 2, d / 2, 1, body);
      bb(g, -w / 2, 0, -d / 2, -w / 2 + 3, keysY - 8, d / 2 - 4, body);
      bb(g, w / 2 - 3, 0, -d / 2, w / 2, keysY - 8, d / 2 - 4, body);
      bb(g, -w / 2 + 3, 0, -d / 2, w / 2 - 3, keysY - 10, -d / 2 + 2, body);
      bb(g, -w / 2 + 2, keysY + 2, -d / 2, w / 2 - 2, h, -d / 2 + 4, body);
    }
    const white = getMaterial({ kind: 'plastic', color: '#f7f7f2' });
    const keyW = (w - 14) / 52;
    bb(g, -w / 2 + 7, keysY, d / 2 - 18, w / 2 - 7, keysY + 2, d / 2 - 3, white);
    for (let i = 0; i < 52; i++) {
      const m = i % 7;
      if (m === 2 || m === 6) continue;
      bb(g, -w / 2 + 7 + (i + 0.7) * keyW, keysY + 2, d / 2 - 18, -w / 2 + 7 + (i + 1.3) * keyW, keysY + 3.2, d / 2 - 9, dark());
    }
    return g;
  }
  // TV
  const panelT = 3;
  let sy = 0;
  if (stand === 'feet' || stand === 'pedestal') sy = 6;
  if (stand === 'easel') sy = h * 0.35;
  const sh = h - sy;
  rbb(g, -w / 2, sy, -panelT / 2, w / 2, h, panelT / 2, 0.4, dark());
  plane(g, w - 1.2, sh - 1.2, screenM, 0, sy + sh / 2, panelT / 2 + 0.02);
  if (stand === 'feet') {
    for (const s of [-1, 1]) {
      rod(g, V(s * w * 0.38, sy, 0), V(s * w * 0.38 - s * 4, 0, d / 2 - 2), 0.8, body);
      rod(g, V(s * w * 0.38, sy, 0), V(s * w * 0.38 - s * 4, 0, -d / 2 + 2), 0.8, body);
    }
  } else if (stand === 'pedestal') {
    rbb(g, -w * 0.15, 0, -d / 2, w * 0.15, 1.5, d / 2, 1, body);
    bb(g, -4, 1.5, -2, 4, sy + 6, 1, body);
  } else if (stand === 'easel') {
    rod(g, V(-w * 0.25, 0, d / 2 - 3), V(0, h * 0.95, -2), 1.2, body);
    rod(g, V(w * 0.25, 0, d / 2 - 3), V(0, h * 0.95, -2), 1.2, body);
    rod(g, V(0, 0, -d / 2 + 3), V(0, h * 0.9, -2), 1.2, body);
  } else if (stand === 'pole') {
    rbb(g, -25, 0, -d / 2, 25, 2, d / 2, 1, body);
    bb(g, -2.5, 0, -4, 2.5, h - 10, -1.5, body);
  }
  return g;
}

export const screenDef: ModelDef = {
  key: 'screen',
  label: 'TV/모니터/피아노',
  slots: { body: { label: '스탠드/바디', def: { kind: 'metal', color: '#2a2a2a' } } },
  params: [
    { key: 'kind', label: '종류', type: 'select', default: 'tv', options: opts(['tv', 'TV'], ['monitor', '모니터'], ['piano', '업라이트 피아노'], ['digitalPiano', '디지털 피아노']) },
    { key: 'stand', label: 'TV 거치', type: 'select', default: 'feet', options: opts(['feet', '스탠드 발'], ['pedestal', '중앙 받침'], ['wall', '벽걸이'], ['easel', '이젤 스탠드'], ['pole', '폴 스탠드']) },
  ],
  build: buildScreen,
};

// ---------------------------------------------------------------- Kitchen
function buildKitchen(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const body = c.mat('body');
  const top = c.mat('top');
  const front = c.mat('front');
  const kind = str(p, 'kind', 'base');
  const topT = 3;
  if (kind === 'upper') {
    bb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2 - 1.8, body);
    const n = Math.max(1, Math.round(w / 45));
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + (w * i) / n + 0.2;
      const x1 = -w / 2 + (w * (i + 1)) / n - 0.2;
      bb(g, x0, 0.2, d / 2 - 1.8, x1, h - 0.2, d / 2, front);
    }
    if (bool(p, 'light', true)) bb(g, -w / 2 + 3, -0.4, -d / 2 + 3, w / 2 - 3, 0, -d / 2 + 6, getMaterial({ kind: 'emissive', color: '#ffffff' }));
    return g;
  }
  const plinth = 10;
  bb(g, -w / 2 + 1, 0, -d / 2 + 1, w / 2 - 1, plinth, d / 2 - 6, getMaterial({ kind: 'plastic', color: '#3a3a3a' }));
  bb(g, -w / 2, plinth, -d / 2, w / 2, h - topT, d / 2 - 2.5, body);
  rbb(g, -w / 2, h - topT, -d / 2, w / 2, h, d / 2, 0.4, top);
  const n = Math.max(1, Math.round(w / 50));
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + (w * i) / n + 0.2;
    const x1 = -w / 2 + (w * (i + 1)) / n - 0.2;
    const drawers = i % 3 === 1;
    if (drawers) {
      for (let k = 0; k < 3; k++) {
        const yy0 = plinth + ((h - topT - plinth) * k) / 3 + 0.2;
        const yy1 = plinth + ((h - topT - plinth) * (k + 1)) / 3 - 0.2;
        bb(g, x0, yy0, d / 2 - 2.5, x1, yy1, d / 2 - 0.5, front);
      }
    } else bb(g, x0, plinth + 0.2, d / 2 - 2.5, x1, h - topT - 0.2, d / 2 - 0.5, front);
  }
  const sinkX = num(p, 'sinkX', -9999);
  if (sinkX > -9999 && Math.abs(sinkX) < w / 2) {
    const sw = num(p, 'sinkW', 60);
    const sd = num(p, 'sinkD', 42);
    bb(g, sinkX - sw / 2, h - 0.1, -sd / 2 + 2, sinkX + sw / 2, h + 0.05, sd / 2 + 2, steel());
    bb(g, sinkX - sw / 2 + 2, h - 18, -sd / 2 + 4, sinkX + sw / 2 - 2, h + 0.06, sd / 2, getMaterial({ kind: 'metal', color: '#9ea3a8' }));
    rod(g, V(sinkX, h, -d / 2 + 6), V(sinkX, h + 30, -d / 2 + 6), 1.2, steel());
    rod(g, V(sinkX, h + 30, -d / 2 + 6), V(sinkX, h + 26, -d / 2 + 22), 1.1, steel());
  }
  const cookX = num(p, 'cookX', -9999);
  if (cookX > -9999 && Math.abs(cookX) < w / 2) {
    const cw = num(p, 'cookW', 58);
    bb(g, cookX - cw / 2, h, -25, cookX + cw / 2, h + 0.6, 25, getMaterial({ kind: 'glass', color: '#111214' }));
    const nb = cw < 40 ? 1 : 2;
    for (let i = 0; i < nb; i++) torus(g, 8, 0.25, getMaterial({ kind: 'plastic', color: '#555555' }), cookX + (nb === 1 ? 0 : (i - 0.5) * (cw / 2)), h + 0.7, 0, Math.PI / 2);
  }
  if (bool(p, 'hood', false)) {
    const hx = cookX > -9999 ? cookX : 0;
    rbb(g, hx - 30, num(p, 'hoodY', 160), -d / 2, hx + 30, num(p, 'hoodY', 160) + 20, -d / 2 + 50, 1, steel());
  }
  return g;
}

export const kitchenDef: ModelDef = {
  key: 'kitchen',
  label: '주방 가구',
  slots: {
    body: { label: '몸체', def: { kind: 'lacquer', color: '#f2f0eb' } },
    front: { label: '도어', def: { kind: 'lacquer', color: '#f2f0eb' } },
    top: { label: '상판', def: { kind: 'stone', color: '#e7e3dc' } },
  },
  params: [
    { key: 'kind', label: '종류', type: 'select', default: 'base', options: opts(['base', '하부장(상판 포함)'], ['upper', '상부장']) },
    { key: 'sinkX', label: '싱크 위치 x(중심 기준)', type: 'number', default: -9999, min: -9999, max: 400, unit: 'cm' },
    { key: 'sinkW', label: '싱크 폭', type: 'number', default: 60, min: 25, max: 120, unit: 'cm' },
    { key: 'sinkD', label: '싱크 깊이', type: 'number', default: 42, min: 25, max: 60, unit: 'cm' },
    { key: 'cookX', label: '쿡탑 위치 x', type: 'number', default: -9999, min: -9999, max: 400, unit: 'cm' },
    { key: 'cookW', label: '쿡탑 폭', type: 'number', default: 58, min: 20, max: 90, unit: 'cm' },
    { key: 'hood', label: '후드', type: 'bool', default: false },
    { key: 'light', label: '상부장 하부 조명', type: 'bool', default: true },
  ],
  build: buildKitchen,
};

// ---------------------------------------------------------------- Bathroom
function buildBath(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const cer = c.mat('ceramic');
  const kind = str(p, 'kind', 'toilet');
  switch (kind) {
    case 'toilet': {
      rbb(g, -w / 2 + 2, h * 0.5, -d / 2, w / 2 - 2, h, -d / 2 + 18, 2, cer);
      const bowl = lathe(g, [[w * 0.22, 0], [w * 0.3, h * 0.35], [w * 0.48, h * 0.52], [w * 0.46, h * 0.54]], cer, 0, 0, d / 2 - d * 0.38);
      bowl.scale.z = 1.3;
      const seat = torus(g, w * 0.36, 2, getMaterial({ kind: 'plastic', color: '#fbfbfb' }), 0, h * 0.55, d / 2 - d * 0.38, Math.PI / 2);
      seat.scale.y = 1.3;
      break;
    }
    case 'basin': {
      const style = str(p, 'style', 'pedestal');
      if (style === 'vanity') {
        bb(g, -w / 2, 10, -d / 2, w / 2, h - 12, d / 2, c.mat('cabinet'));
        rbb(g, -w / 2, h - 12, -d / 2, w / 2, h, d / 2, 1, cer);
      } else if (style === 'wall') {
        rbb(g, -w / 2, h - 18, -d / 2, w / 2, h, d / 2, 4, cer);
      } else {
        lathe(g, [[8, 0], [6, h * 0.6], [w * 0.2, h - 16], [w / 2, h - 2], [w / 2 - 1, h]], cer);
      }
      bb(g, -w / 2 + 6, h - 0.2, -d / 2 + 5, w / 2 - 6, h + 0.05, d / 2 - 4, getMaterial({ kind: 'ceramic', color: '#f3f3f1' }));
      rod(g, V(0, h, -d / 2 + 4), V(0, h + 14, -d / 2 + 4), 1, steel());
      rod(g, V(0, h + 14, -d / 2 + 4), V(0, h + 12, -d / 2 + 12), 0.9, steel());
      break;
    }
    case 'tub': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 3, cer);
      rbb(g, -w / 2 + 6, h * 0.25, -d / 2 + 6, w / 2 - 6, h + 0.1, d / 2 - 6, 8, getMaterial({ kind: 'ceramic', color: '#f6f6f4' }));
      break;
    }
    case 'glass': {
      bb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, getMaterial({ kind: 'glass', color: '#d9ecf2' }));
      bb(g, -w / 2, h - 2, -d / 2 - 0.3, w / 2, h, d / 2 + 0.3, steel());
      bb(g, -w / 2, 0, -d / 2 - 0.3, w / 2, 1.5, d / 2 + 0.3, steel());
      break;
    }
    case 'shower': {
      rod(g, V(0, 0, -d / 2 + 2), V(0, h, -d / 2 + 2), 1.1, steel());
      rod(g, V(0, h, -d / 2 + 2), V(0, h, d / 2 - 10), 0.9, steel());
      cyl(g, 11, 11, 1.5, steel(), 0, h - 2, d / 2 - 10, 32);
      break;
    }
    case 'washstand': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 2, cer);
      break;
    }
  }
  return g;
}

export const bathDef: ModelDef = {
  key: 'bath',
  label: '욕실',
  slots: {
    ceramic: { label: '도기', def: { kind: 'ceramic', color: '#fbfbfa' } },
    cabinet: { label: '하부장', def: { kind: 'wood', color: '#c9a77c' } },
  },
  params: [
    { key: 'kind', label: '종류', type: 'select', default: 'toilet', options: opts(['toilet', '변기'], ['basin', '세면대'], ['tub', '욕조'], ['glass', '유리 파티션'], ['shower', '샤워 수전']) },
    { key: 'style', label: '세면대 형태', type: 'select', default: 'pedestal', options: opts(['pedestal', '긴다리'], ['wall', '벽걸이'], ['vanity', '하부장형']) },
  ],
  build: buildBath,
};

// ---------------------------------------------------------------- Fitness / pets / kids
function buildActivity(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const body = c.mat('body');
  const acc = c.mat('accent');
  const kind = str(p, 'kind', 'treadmill');
  switch (kind) {
    case 'treadmill': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, 16, d / 2, 2, body);
      bb(g, -w / 2 + 6, 16, -d / 2 + 10, w / 2 - 6, 17, d / 2 - 25, dark());
      for (const s of [-1, 1]) rod(g, V(s * (w / 2 - 4), 16, -d / 2 + 14), V(s * (w / 2 - 4), h - 10, -d / 2 + 4), 2, body);
      rbb(g, -w / 2 + 2, h - 14, -d / 2, w / 2 - 2, h, -d / 2 + 18, 2, acc);
      break;
    }
    case 'bike': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, 6, -d / 2 + 10, 2, body);
      rbb(g, -w / 2, 0, d / 2 - 10, w / 2, 6, d / 2, 2, body);
      rod(g, V(0, 6, d / 2 - 8), V(0, h * 0.62, -d / 2 + d * 0.62), 3, body);
      rod(g, V(0, 6, -d / 2 + 8), V(0, h - 8, -d / 2 + 10), 3, body);
      torus(g, 20, 4, acc, 0, 32, -d / 2 + d * 0.3, 0, Math.PI / 2);
      rbox(g, 18, 6, 26, 3, dark(), 0, h * 0.62 + 3, -d / 2 + d * 0.62);
      rod(g, V(-20, h - 6, -d / 2 + 10), V(20, h - 6, -d / 2 + 10), 1.4, dark());
      break;
    }
    case 'mat': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, Math.max(0.6, h), d / 2, 0.3, acc);
      break;
    }
    case 'cattower': {
      rbb(g, -w / 2, 0, -d / 2, w / 2, 4, d / 2, 1, acc);
      const lv = Math.max(2, Math.round(h / 45));
      for (let i = 1; i <= lv; i++) {
        const y = (h / lv) * i;
        const sx = (i % 2 ? -1 : 1) * w * 0.15;
        cyl(g, 5, 5, h / lv, getMaterial({ kind: 'rattan', color: '#c9b08a' }), sx, y - h / lv, 0);
        rbb(g, sx - w * 0.3, y - 3, -d * 0.35, sx + w * 0.3, y, d * 0.35, 1.5, acc);
      }
      break;
    }
    case 'crib': {
      for (const [x, z] of [
        [-w / 2 + 2, -d / 2 + 2],
        [w / 2 - 2, -d / 2 + 2],
        [-w / 2 + 2, d / 2 - 2],
        [w / 2 - 2, d / 2 - 2],
      ])
        bb(g, x - 2, 0, z - 2, x + 2, h, z + 2, body);
      bb(g, -w / 2, 25, -d / 2, w / 2, 30, d / 2, body);
      rbb(g, -w / 2 + 3, 30, -d / 2 + 3, w / 2 - 3, 40, d / 2 - 3, 2, acc);
      for (let x = -w / 2 + 6; x < w / 2 - 3; x += 7) {
        bb(g, x - 0.8, 30, -d / 2 + 1, x + 0.8, h - 3, -d / 2 + 2.6, body);
        bb(g, x - 0.8, 30, d / 2 - 2.6, x + 0.8, h - 3, d / 2 - 1, body);
      }
      bb(g, -w / 2, h - 4, -d / 2, w / 2, h, -d / 2 + 3, body);
      bb(g, -w / 2, h - 4, d / 2 - 3, w / 2, h, d / 2, body);
      break;
    }
    case 'stroller':
    case 'suitcase': {
      rbb(g, -w / 2, 4, -d / 2, w / 2, h * 0.85, d / 2, 4, acc);
      rod(g, V(-w / 4, h * 0.85, -d / 2 + 4), V(-w / 4, h, -d / 2 + 4), 1, dark());
      rod(g, V(w / 4, h * 0.85, -d / 2 + 4), V(w / 4, h, -d / 2 + 4), 1, dark());
      rod(g, V(-w / 4, h, -d / 2 + 4), V(w / 4, h, -d / 2 + 4), 1, dark());
      for (const [x, z] of [
        [-w / 2 + 4, -d / 2 + 4],
        [w / 2 - 4, -d / 2 + 4],
        [-w / 2 + 4, d / 2 - 4],
        [w / 2 - 4, d / 2 - 4],
      ])
        sphere(g, 2.5, dark(), x, 2.5, z);
      break;
    }
    case 'bicycle': {
      for (const z of [-d / 2 + 34, d / 2 - 34]) torus(g, 33, 1.8, dark(), 0, 35, z, 0, Math.PI / 2);
      rod(g, V(0, 35, -d / 2 + 34), V(0, 70, -5), 1.6, acc);
      rod(g, V(0, 70, -5), V(0, 70, d / 2 - 44), 1.6, acc);
      rod(g, V(0, 35, d / 2 - 34), V(0, 80, d / 2 - 44), 1.6, acc);
      rod(g, V(0, 35, -d / 2 + 34), V(0, 35, 5), 1.4, acc);
      rod(g, V(0, 35, 5), V(0, 70, -5), 1.4, acc);
      rod(g, V(0, 35, 5), V(0, 82, 0), 1.4, acc);
      rbox(g, 8, 4, 24, 2, dark(), 0, 84, 0);
      rod(g, V(-24, 92, d / 2 - 44), V(24, 92, d / 2 - 44), 1.2, dark());
      rod(g, V(0, 80, d / 2 - 44), V(0, 92, d / 2 - 44), 1.4, acc);
      break;
    }
  }
  return g;
}

export const activityDef: ModelDef = {
  key: 'activity',
  label: '운동/반려/육아',
  slots: {
    body: { label: '프레임', def: { kind: 'metal', color: '#2a2a2a' } },
    accent: { label: '포인트', def: { kind: 'fabric', color: '#7d8a6a' } },
  },
  params: [
    {
      key: 'kind',
      label: '종류',
      type: 'select',
      default: 'treadmill',
      options: opts(['treadmill', '러닝머신'], ['bike', '실내자전거'], ['mat', '요가매트'], ['bicycle', '자전거'], ['cattower', '캣타워'], ['crib', '아기침대'], ['suitcase', '캐리어'], ['stroller', '유모차(박스)']),
    },
  ],
  build: buildActivity,
};

export { sphere, lathe, box, cyl };
