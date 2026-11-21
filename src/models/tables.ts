import * as THREE from 'three';
import { bb, bool, box, cyl, GenCtx, leg, LEG_OPTIONS, ModelDef, num, opts, rbb, rbox, rod, str } from './parts';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function topShape(g: THREE.Object3D, shape: string, w: number, d: number, y0: number, t: number, m: THREE.Material) {
  if (shape === 'round' || shape === 'oval') {
    const me = cyl(g, w / 2, w / 2, t, m, 0, y0, 0, 48);
    me.scale.z = d / w;
    return me;
  }
  if (shape === 'pill') {
    const r = d / 2;
    const s = new THREE.Shape();
    s.absarc(-w / 2 + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
    s.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
    const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 24 });
    geo.rotateX(Math.PI / 2);
    const me = new THREE.Mesh(geo, m);
    me.position.y = y0 + t;
    me.castShadow = me.receiveShadow = true;
    g.add(me);
    return me;
  }
  return rbox(g, w, t, d, Math.min(0.8, t / 2 - 0.05), m, 0, y0 + t / 2, 0);
}

function buildTable(c: GenCtx) {
  const { w, d, p } = c;
  let h = c.h;
  const g = new THREE.Group();
  const top = c.mat('top');
  const legM = c.mat('legs');
  const shape = str(p, 'shape', 'rect');
  const base = str(p, 'base', 'four');
  const legStyle = str(p, 'legStyle', 'square');
  const t = num(p, 'topT', 3);
  const legS = num(p, 'legS', 5);
  const inset = num(p, 'inset', 4);
  const apron = bool(p, 'apron', false);
  const shelf = bool(p, 'shelf', false);
  const drawers = str(p, 'drawers', 'none');
  if (base === 'standing') h = num(p, 'curH', h);
  const y0 = h - t;
  topShape(g, shape, w, d, y0, t, top);
  const round = shape === 'round' || shape === 'oval';
  const lx = round ? w * 0.33 : w / 2 - inset - legS / 2;
  const lz = round ? d * 0.33 : d / 2 - inset - legS / 2;
  const legH = y0 - (apron ? 0 : 0);

  switch (base) {
    case 'pedestal':
    case 'tulip': {
      const ped = cyl(g, base === 'tulip' ? 4 : 6, base === 'tulip' ? 10 : 6, y0, legM, 0, 0, 0, 32);
      void ped;
      if (base === 'tulip') cyl(g, 10, Math.min(w, d) * 0.28, 4, legM, 0, 0, 0, 40);
      else cyl(g, Math.min(w, d) * 0.3, Math.min(w, d) * 0.3, 2.5, legM, 0, 0, 0, 40);
      break;
    }
    case 'trestle': {
      for (const x of [-w / 2 + inset + 10, w / 2 - inset - 10]) {
        bb(g, x - 3, 0, -d / 2 + 6, x + 3, 4, d / 2 - 6, legM);
        bb(g, x - 3, y0 - 4, -d / 2 + 8, x + 3, y0, d / 2 - 8, legM);
        bb(g, x - 3, 4, -4, x + 3, y0 - 4, 4, legM);
      }
      bb(g, -w / 2 + inset + 10, y0 * 0.45, -2, w / 2 - inset - 10, y0 * 0.45 + 6, 2, legM);
      break;
    }
    case 'panel':
    case 'waterfall': {
      const pt = base === 'waterfall' ? t : 3;
      for (const s of [-1, 1]) bb(g, s * (w / 2) - (s > 0 ? pt : 0), 0, -d / 2 + (base === 'waterfall' ? 0 : 4), s * (w / 2) + (s < 0 ? pt : 0), y0, d / 2 - (base === 'waterfall' ? 0 : 4), base === 'waterfall' ? top : legM);
      if (base === 'panel') bb(g, -w / 2 + 3, y0 - 30, -d / 2 + 6, w / 2 - 3, y0 - 1, -d / 2 + 8, legM);
      break;
    }
    case 'aframe': {
      for (const s of [-1, 1]) {
        const x = s * lx;
        rod(g, V(x, y0, -2), V(x, 0, -lz - 3), legS / 2.2, legM);
        rod(g, V(x, y0, 2), V(x, 0, lz + 3), legS / 2.2, legM);
      }
      bb(g, -lx, y0 - 5, -2, lx, y0, 2, legM);
      break;
    }
    case 'x': {
      for (const s of [-1, 1]) {
        rod(g, V(s * lx, y0, -lz), V(s * lx, 0, lz), 2, legM);
        rod(g, V(s * lx, y0, lz), V(s * lx, 0, -lz), 2, legM);
      }
      bb(g, -lx, y0 / 2 - 2, -2, lx, y0 / 2 + 2, 2, legM);
      break;
    }
    case 'cross': {
      // four legs from a central hub (round tables)
      cyl(g, 5, 5, 8, legM, 0, y0 - 8, 0);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        rod(g, V(Math.cos(a) * 4, y0 - 4, Math.sin(a) * 4), V(Math.cos(a) * w * 0.38, 0, Math.sin(a) * d * 0.38), legS / 2, legM);
      }
      break;
    }
    case 'standing':
    case 'tframe': {
      const fx = w / 2 - Math.min(14, w * 0.1);
      for (const s of [-1, 1]) {
        bb(g, s * fx - 3, 0, -d / 2 + 4, s * fx + 3, 3, d / 2 - 4, legM);
        bb(g, s * fx - 3.5, 3, -4, s * fx + 3.5, y0 - 3, 4, legM);
        bb(g, s * fx - 3, y0 - 3, -d / 2 + 6, s * fx + 3, y0, d / 2 - 6, legM);
      }
      bb(g, -fx, y0 - 6, -3, fx, y0 - 2, 3, legM);
      if (base === 'standing') box(g, 10, 2.5, 5, legM, w / 2 - 22, y0 - 1.5, d / 2 - 4);
      break;
    }
    case 'gateleg': {
      bb(g, -w / 2 + 6, 0, -d / 2 + 6, w / 2 - 6, y0, d / 2 - 6, legM);
      break;
    }
    case 'sled': {
      for (const s of [-1, 1]) {
        const x = s * lx;
        rod(g, V(x, 0.8, -lz), V(x, 0.8, lz), 1.3, legM);
        rod(g, V(x, 0.8, -lz), V(x, y0, -lz), 1.3, legM);
        rod(g, V(x, 0.8, lz), V(x, y0, lz), 1.3, legM);
        rod(g, V(x, y0 - 1, -lz), V(x, y0 - 1, lz), 1.3, legM);
      }
      break;
    }
    default: {
      const pts: [number, number][] = round
        ? [0, 1, 2, 3].map((i) => [Math.cos((i / 4) * Math.PI * 2 + Math.PI / 4) * w * 0.32, Math.sin((i / 4) * Math.PI * 2 + Math.PI / 4) * d * 0.32])
        : [
            [-lx, -lz],
            [lx, -lz],
            [-lx, lz],
            [lx, lz],
          ];
      if (!round && w > 220) pts.push([0, -lz], [0, lz]);
      for (const [x, z] of pts) leg(g, legStyle, x, z, legH, legM, legS);
    }
  }
  if (apron && !round) {
    const ah = 8;
    bb(g, -lx, y0 - ah, -lz - 1, lx, y0, -lz + 1, legM);
    bb(g, -lx, y0 - ah, lz - 1, lx, y0, lz + 1, legM);
    bb(g, -lx - 1, y0 - ah, -lz, -lx + 1, y0, lz, legM);
    bb(g, lx - 1, y0 - ah, -lz, lx + 1, y0, lz, legM);
  }
  if (shelf) {
    if (round) cyl(g, w * 0.36, w * 0.36, 2, top, 0, Math.min(15, y0 * 0.35), 0, 40).scale.set(1, 1, d / w);
    else bb(g, -lx, Math.min(14, y0 * 0.3), -lz, lx, Math.min(14, y0 * 0.3) + 2, lz, top);
  }
  if (drawers !== 'none') {
    const dw = Math.min(42, w * 0.32);
    const sides = drawers === 'both' ? [-1, 1] : drawers === 'left' ? [-1] : drawers === 'right' ? [1] : [];
    for (const s of sides) {
      const cx = s * (w / 2 - dw / 2 - 1);
      bb(g, cx - dw / 2, 0, -d / 2 + 2, cx + dw / 2, y0, d / 2 - 2, legM);
      for (let i = 0; i < 3; i++) {
        const yy = (y0 / 3) * i;
        bb(g, cx - dw / 2 + 1, yy + 1, d / 2 - 2, cx + dw / 2 - 1, yy + y0 / 3 - 1, d / 2 - 0.5, legM);
        box(g, 10, 1, 1.5, c.mat('legs'), cx, yy + y0 / 3 - 5, d / 2);
      }
    }
    if (drawers === 'one') {
      bb(g, -w * 0.25, y0 - 9, -d / 2 + 4, w * 0.25, y0, d / 2 - 1.5, legM);
    }
  }
  return g;
}

const tableParams = [
  { key: 'shape', label: '상판 모양', type: 'select' as const, default: 'rect', options: opts(['rect', '사각'], ['round', '원형'], ['oval', '타원'], ['pill', '라운드 사각(필)']) },
  {
    key: 'base',
    label: '다리 구조',
    type: 'select' as const,
    default: 'four',
    options: opts(
      ['four', '네 다리'],
      ['pedestal', '원기둥 받침'],
      ['tulip', '튤립 받침'],
      ['trestle', '트레슬'],
      ['panel', '판형 다리'],
      ['waterfall', '워터폴(상판 연장)'],
      ['aframe', 'A자 다리'],
      ['x', 'X자 다리'],
      ['cross', '크로스(원형용)'],
      ['sled', '썰매형'],
      ['tframe', 'T자 프레임'],
      ['standing', '높이조절(모션)'],
    ),
  },
  { key: 'legStyle', label: '다리 모양', type: 'select' as const, default: 'square', options: LEG_OPTIONS },
  { key: 'legS', label: '다리 굵기', type: 'number' as const, default: 5, min: 1, max: 15, unit: 'cm' },
  { key: 'inset', label: '다리 안쪽 들임', type: 'number' as const, default: 4, min: 0, max: 40, unit: 'cm' },
  { key: 'topT', label: '상판 두께', type: 'number' as const, default: 3, min: 1, max: 10, unit: 'cm' },
  { key: 'apron', label: '에이프런(상판 테두리)', type: 'bool' as const, default: false },
  { key: 'shelf', label: '하부 선반', type: 'bool' as const, default: false },
  { key: 'drawers', label: '서랍', type: 'select' as const, default: 'none', options: opts(['none', '없음'], ['one', '얇은 서랍 1'], ['left', '왼쪽 서랍장'], ['right', '오른쪽 서랍장'], ['both', '양쪽 서랍장']) },
  { key: 'curH', label: '현재 높이(모션데스크)', type: 'number' as const, default: 73, min: 55, max: 130, unit: 'cm' },
];

export const tableDef: ModelDef = {
  key: 'table',
  label: '테이블/책상',
  slots: {
    top: { label: '상판', def: { kind: 'wood', color: '#c9a77c' } },
    legs: { label: '다리/프레임', def: { kind: 'wood', color: '#c9a77c' } },
  },
  params: tableParams,
  build: buildTable,
};

// ---------------------------------------------------------------- Bed
function buildBed(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const frame = c.mat('frame');
  const head = c.mat('headboard');
  const mat = c.mat('mattress');
  const bed = c.mat('bedding');
  const legM = c.mat('legs');
  const style = str(p, 'style', 'platform');
  const mT = num(p, 'mattressT', 25);
  const frameH = num(p, 'frameH', 30); // top of slats (mattress bottom)
  const footH = num(p, 'footH', 0);
  const legH = num(p, 'legH', 10);
  const mw = Math.min(num(p, 'mattressW', w - 6), w);
  const ml = Math.min(num(p, 'mattressL', d - 9), d);
  const headT = style === 'floor' ? 0 : num(p, 'headT', 8);
  const bedding = bool(p, 'bedding', true);
  const zHeadIn = -d / 2 + headT;
  const mz0 = zHeadIn + 1;
  const mz1 = Math.min(mz0 + ml, d / 2 - (footH > 0 ? 3 : 0));
  const railTop = frameH;

  if (style === 'floor') {
    // low platform / mattress on floor frame
    rbb(g, -w / 2, 0, -d / 2, w / 2, Math.max(4, frameH), d / 2, 1, frame);
  } else if (style === 'storage') {
    rbb(g, -w / 2, 0, zHeadIn, w / 2, railTop, d / 2, 1, frame);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const z0 = zHeadIn + 20 + i * ((d - 40) / 2);
        bb(g, s * (w / 2) - (s > 0 ? 0.6 : 0), 4, z0 + 2, s * (w / 2) + (s < 0 ? 0.6 : 0), railTop - 4, z0 + (d - 40) / 2 - 2, legM);
      }
    }
  } else {
    const railH = Math.min(18, railTop - legH);
    const y0 = railTop - railH;
    const sideM = style === 'upholstered' ? head : frame;
    rbb(g, -w / 2, y0, zHeadIn, -w / 2 + 4, railTop + 2, d / 2, 0.8, sideM);
    rbb(g, w / 2 - 4, y0, zHeadIn, w / 2, railTop + 2, d / 2, 0.8, sideM);
    rbb(g, -w / 2, y0, d / 2 - 4, w / 2, railTop + 2, d / 2, 0.8, sideM);
    bb(g, -w / 2 + 4, railTop - 3, zHeadIn, w / 2 - 4, railTop - 1, d / 2 - 4, frame);
    for (const [x, z] of [
      [-w / 2 + 4, zHeadIn + 4],
      [w / 2 - 4, zHeadIn + 4],
      [-w / 2 + 4, d / 2 - 4],
      [w / 2 - 4, d / 2 - 4],
    ])
      leg(g, str(p, 'legs', 'square'), x, z, y0, legM, 6);
    if (w > 140) leg(g, 'square', 0, 0, y0, legM, 5);
  }
  // headboard
  if (headT > 0) {
    const hb = style === 'upholstered' ? 6 : 1;
    if (style === 'upholstered') {
      rbb(g, -w / 2, 0, -d / 2, w / 2, h, zHeadIn, hb, head);
      const ch = h - railTop - mT;
      if (ch > 18 && bool(p, 'tufted', false)) {
        const n = Math.max(2, Math.round(w / 30));
        for (let i = 0; i < n; i++) rbox(g, w / n - 2, ch - 4, 4, 2, head, -w / 2 + (i + 0.5) * (w / n), railTop + mT + ch / 2, zHeadIn + 1);
      }
    } else {
      bb(g, -w / 2, 0, -d / 2, -w / 2 + 5, h, zHeadIn, frame);
      bb(g, w / 2 - 5, 0, -d / 2, w / 2, h, zHeadIn, frame);
      rbb(g, -w / 2 + 5, railTop - 5, -d / 2 + 1, w / 2 - 5, h - 2, zHeadIn - 1, 0.8, head);
    }
  }
  if (footH > 0) rbb(g, -w / 2, 0, d / 2 - 4, w / 2, footH, d / 2, 0.8, style === 'upholstered' ? head : frame);
  // mattress
  const mx = mw / 2;
  rbb(g, -mx, railTop, mz0, mx, railTop + mT, mz1, 4, mat);
  const top = railTop + mT;
  if (bedding) {
    // duvet covering lower 70%, pillows at head
    const dz0 = mz0 + (mz1 - mz0) * 0.28;
    rbb(g, -mx - 2, top - mT * 0.6, dz0, mx + 2, top + 5, mz1 + 2, 4, bed);
    rbb(g, -mx + 2, top + 4, dz0 - 4, mx - 2, top + 8, dz0 + 18, 4, bed);
    const n = mw >= 120 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const pw = Math.min(60, mw / n - 8);
      const px = n === 1 ? 0 : (i === 0 ? -1 : 1) * (mw / 4);
      const pm = rbox(g, pw, 12, 38, 6, c.mat('pillow'), px, top + 6, mz0 + 22);
      pm.rotation.x = -0.15;
    }
  }
  return g;
}

export const bedDef: ModelDef = {
  key: 'bed',
  label: '침대',
  slots: {
    frame: { label: '프레임', def: { kind: 'wood', color: '#c9a77c' } },
    headboard: { label: '헤드보드', def: { kind: 'wood', color: '#c9a77c' } },
    mattress: { label: '매트리스', def: { kind: 'fabric', color: '#f4f2ee' } },
    bedding: { label: '이불', def: { kind: 'fabric', color: '#e9e4da' } },
    pillow: { label: '베개', def: { kind: 'fabric', color: '#fbfaf7' } },
    legs: { label: '다리/서랍', def: { kind: 'wood', color: '#b8956a' } },
  },
  params: [
    {
      key: 'style',
      label: '프레임 형태',
      type: 'select',
      default: 'platform',
      options: opts(['platform', '평상형(원목)'], ['upholstered', '패브릭 헤드'], ['storage', '수납형(서랍)'], ['floor', '저상형/깔판']),
    },
    { key: 'mattressW', label: '매트리스 폭', type: 'number', default: 150, min: 80, max: 220, unit: 'cm' },
    { key: 'mattressL', label: '매트리스 길이', type: 'number', default: 200, min: 180, max: 220, unit: 'cm' },
    { key: 'mattressT', label: '매트리스 두께', type: 'number', default: 25, min: 5, max: 40, unit: 'cm' },
    { key: 'frameH', label: '프레임 높이(매트 아래)', type: 'number', default: 30, min: 0, max: 60, unit: 'cm' },
    { key: 'headT', label: '헤드보드 두께', type: 'number', default: 8, min: 0, max: 30, unit: 'cm' },
    { key: 'footH', label: '발판 높이', type: 'number', default: 0, min: 0, max: 80, unit: 'cm' },
    { key: 'legH', label: '다리 높이', type: 'number', default: 10, min: 0, max: 40, unit: 'cm' },
    { key: 'legs', label: '다리', type: 'select', default: 'square', options: LEG_OPTIONS },
    { key: 'tufted', label: '헤드 패널 분할', type: 'bool', default: false },
    { key: 'bedding', label: '침구 표시', type: 'bool', default: true },
  ],
  build: buildBed,
};
