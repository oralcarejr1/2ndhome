import * as THREE from 'three';
import { getMaterial } from '../lib/materials';
import { bb, bool, box, cyl, GenCtx, leg, LEG_OPTIONS, ModelDef, num, opts, rbb, rbox, rod, sphere, str } from './parts';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const BOOK_COLORS = ['#8c5a3c', '#3d5a6c', '#c4b49a', '#6b7b57', '#a8432f', '#2f2f2f', '#d9cfc0', '#5d4b6e', '#e0a458'];

/** Decorative books/boxes for an open compartment. */
function fillShelf(g: THREE.Object3D, x0: number, x1: number, y0: number, h: number, zBack: number, depth: number, seed: number) {
  let x = x0 + 1;
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const kind = rnd();
  if (kind < 0.18) {
    // a basket/box
    const bw = Math.min(x1 - x0 - 2, 30);
    rbox(g, bw, Math.min(h - 3, 24), Math.min(depth - 3, 30), 1.5, getMaterial({ kind: 'rattan', color: '#c9a978' }), (x0 + x1) / 2, y0 + Math.min(h - 3, 24) / 2, zBack + depth / 2);
    return;
  }
  if (kind < 0.3) return; // leave empty
  while (x < x1 - 3) {
    const bw = 2 + rnd() * 3.5;
    const bh = Math.min(h - 2, 18 + rnd() * 12);
    if (x + bw > x1 - 1) break;
    const lean = x > x0 + (x1 - x0) * 0.6 && rnd() < 0.15;
    const m = box(g, bw, bh, Math.min(depth - 3, 16 + rnd() * 6), getMaterial({ kind: 'paper', color: BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)] }), x + bw / 2, y0 + bh / 2, zBack + depth / 2 - 1);
    m.castShadow = false;
    if (lean) {
      m.rotation.z = -0.25;
      m.position.x += 3;
      break;
    }
    x += bw + 0.2;
    if (rnd() < 0.08) x += 6;
  }
}

function buildCase(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const body = c.mat('body');
  const front = c.mat('front');
  const handleM = c.mat('handle');
  const legM = c.mat('legs');
  const cols = Math.max(1, Math.round(num(p, 'cols', 2)));
  const rows = Math.max(1, Math.round(num(p, 'rows', 3)));
  const fill = str(p, 'fill', 'drawers');
  const base = str(p, 'base', 'plinth');
  const legH = base === 'legs' || base === 'hairpin' ? num(p, 'legH', 15) : base === 'plinth' ? 8 : 0;
  const t = num(p, 'frameT', 1.8);
  const handle = str(p, 'handle', 'bar');
  const books = bool(p, 'books', true);
  const back = !bool(p, 'noBack', false);
  const y0 = legH;
  const y1 = h;
  const z0 = -d / 2;
  const z1 = d / 2;
  const isCubes = fill === 'cubes';
  const ft = isCubes ? 3.5 : t;

  // carcass
  bb(g, -w / 2, y0, z0, -w / 2 + ft, y1, z1, body);
  bb(g, w / 2 - ft, y0, z0, w / 2, y1, z1, body);
  bb(g, -w / 2, y1 - ft, z0, w / 2, y1, z1, body);
  bb(g, -w / 2, y0, z0, w / 2, y0 + ft, z1, body);
  if (back) bb(g, -w / 2, y0, z0, w / 2, y1, z0 + 0.6, body);
  if (base === 'plinth') bb(g, -w / 2 + 2, 0, z0 + 2, w / 2 - 2, legH, z1 - 4, body);
  if (base === 'legs' || base === 'hairpin') {
    for (const [x, z] of [
      [-w / 2 + 4, z0 + 4],
      [w / 2 - 4, z0 + 4],
      [-w / 2 + 4, z1 - 4],
      [w / 2 - 4, z1 - 4],
    ])
      leg(g, base === 'hairpin' ? 'hairpin' : str(p, 'legStyle', 'tapered'), x, z, legH, legM, 4);
  }

  const iw = w - ft * 2;
  const ih = y1 - y0 - ft * 2;
  const cw = iw / cols;
  const rh = ih / rows;
  const ix0 = -w / 2 + ft;
  const iy0 = y0 + ft;

  // dividers
  for (let i = 1; i < cols; i++) bb(g, ix0 + i * cw - ft / 2, iy0, z0, ix0 + i * cw + ft / 2, iy0 + ih, z1 - (fill === 'open' || isCubes ? 0 : 1.8), body);

  const isOpenCell = (r: number, col: number) => {
    if (fill === 'open' || isCubes) return true;
    if (fill === 'topOpen') return r > 0; // r=0 is bottom row
    if (fill === 'bottomOpen') return r === 0;
    if (fill === 'tvbench') return col > 0 && col < cols - 1;
    return false;
  };
  const cellFront = (r: number, col: number) => {
    if (fill === 'drawers') return 'drawer';
    if (fill === 'doors' || fill === 'glass') return fill === 'glass' ? 'glass' : 'door';
    if (fill === 'topOpen') return r === 0 ? 'door' : 'open';
    if (fill === 'bottomOpen') return r === 0 ? 'open' : 'door';
    if (fill === 'mixed') return r === 0 ? 'drawer' : 'door';
    if (fill === 'tvbench') return col === 0 || col === cols - 1 ? 'drawer' : 'open';
    if (fill === 'sliding') return 'sliding';
    return 'open';
  };

  // shelves
  for (let col = 0; col < cols; col++) {
    for (let r = 0; r < rows; r++) {
      const cx0 = ix0 + col * cw + (col > 0 ? ft / 2 : 0);
      const cx1 = ix0 + (col + 1) * cw - (col < cols - 1 ? ft / 2 : 0);
      const cy0 = iy0 + r * rh;
      if (r > 0 && (isOpenCell(r, col) || isOpenCell(r - 1, col) || fill === 'doors' || fill === 'glass')) bb(g, cx0, cy0 - ft / 2, z0 + 0.6, cx1, cy0 + ft / 2, z1 - (isOpenCell(r, col) ? 0 : 2), body);
      if (isOpenCell(r, col) && books && rh > 18) fillShelf(g, cx0, cx1, cy0 + ft / 2, rh - ft, z0 + 1, d - 2, col * 31 + r * 7 + Math.round(w));
    }
  }

  // fronts
  const fz = z1 - 1.8;
  if (fill === 'sliding') {
    const n = Math.max(2, cols);
    const pw = iw / n + 2;
    for (let i = 0; i < n; i++) {
      const x = ix0 + (i + 0.5) * (iw / n);
      bb(g, x - pw / 2, iy0, fz - (i % 2) * 2.2, x + pw / 2, iy0 + ih, fz + 1.8 - (i % 2) * 2.2, front);
      bb(g, x + (i % 2 ? -1 : 1) * (pw / 2 - 4) - 0.6, iy0 + ih * 0.35, fz + 1.8 - (i % 2) * 2.2, x + (i % 2 ? -1 : 1) * (pw / 2 - 4) + 0.6, iy0 + ih * 0.6, fz + 2.4 - (i % 2) * 2.2, handleM);
    }
  } else {
    const doorsPair = fill === 'doors' || fill === 'glass';
    for (let col = 0; col < cols; col++) {
      for (let r = 0; r < rows; r++) {
        const kind = cellFront(r, col);
        if (kind === 'open') continue;
        const cx0 = ix0 + col * cw + 0.2;
        const cx1 = ix0 + (col + 1) * cw - 0.2;
        // tall doors span all rows when doors
        let cy0 = iy0 + r * rh + 0.2;
        let cy1 = iy0 + (r + 1) * rh - 0.2;
        if (doorsPair) {
          if (r > 0) continue;
          cy0 = iy0 + 0.2;
          cy1 = iy0 + ih - 0.2;
        }
        if ((fill === 'topOpen' || fill === 'mixed') && kind === 'door' && fill === 'mixed') {
          if (r > 1) continue;
          cy1 = iy0 + ih - 0.2;
        }
        const fm = kind === 'glass' ? getMaterial({ kind: 'glass', color: '#dfe9ec' }) : front;
        if (bool(p, 'open', false) && kind !== 'drawer') {
          // swing the door out ~80° around its hinge to show the space it needs
          const hingeX = col % 2 === 0 ? cx0 : cx1;
          const pivot = new THREE.Group();
          pivot.position.set(hingeX, 0, z1);
          pivot.rotation.y = (col % 2 === 0 ? -1 : 1) * 1.4;
          g.add(pivot);
          bb(pivot, cx0 - hingeX, cy0, fz - z1, cx1 - hingeX, cy1, 0, fm);
          continue;
        }
        bb(g, cx0, cy0, fz, cx1, cy1, z1, fm);
        if (kind === 'glass') {
          // frame around glass
          bb(g, cx0, cy0, fz, cx0 + 2.5, cy1, z1, front);
          bb(g, cx1 - 2.5, cy0, fz, cx1, cy1, z1, front);
          bb(g, cx0, cy0, fz, cx1, cy0 + 2.5, z1, front);
          bb(g, cx0, cy1 - 2.5, fz, cx1, cy1, z1, front);
          if (books) fillShelf(g, cx0 + 1, cx1 - 1, cy0 + 2, Math.min(cy1 - cy0, rh) - 4, z0 + 1, d - 4, col * 13 + r);
        }
        // handles
        if (handle === 'none') continue;
        const hx = kind === 'drawer' ? (cx0 + cx1) / 2 : col % 2 === 0 ? cx1 - 4 : cx0 + 4;
        const hy = kind === 'drawer' ? cy1 - Math.min(6, (cy1 - cy0) / 3) : cy1 > 120 ? Math.min(cy0 + 105, (cy0 + cy1) / 2) : (cy0 + cy1) / 2 + (cy1 - cy0) * 0.2;
        if (handle === 'knob') sphere(g, 1.4, handleM, hx, hy, z1 + 1.2);
        else if (handle === 'long') {
          if (kind === 'drawer') bb(g, cx0 + 4, cy1 - 1.5, z1, cx1 - 4, cy1 - 0.4, z1 + 1.6, handleM);
          else bb(g, hx - 0.6, cy0 + 4, z1, hx + 0.6, cy1 - 4, z1 + 1.8, handleM);
        } else if (handle === 'cutout') {
          bb(g, hx - (kind === 'drawer' ? 6 : 1.2), hy - (kind === 'drawer' ? 1.2 : 6), z1 - 0.2, hx + (kind === 'drawer' ? 6 : 1.2), hy + (kind === 'drawer' ? 1.2 : 6), z1 + 0.05, getMaterial({ kind: 'plastic', color: '#1b1b1b' }));
        } else {
          if (kind === 'drawer') bb(g, hx - 7, hy - 0.6, z1, hx + 7, hy + 0.6, z1 + 2, handleM);
          else bb(g, hx - 0.6, hy - 9, z1, hx + 0.6, hy + 9, z1 + 2, handleM);
        }
      }
    }
  }
  return g;
}

export const caseDef: ModelDef = {
  key: 'case',
  label: '수납장/서랍/옷장',
  slots: {
    body: { label: '몸체', def: { kind: 'lacquer', color: '#f2f0eb' } },
    front: { label: '문/서랍 앞판', def: { kind: 'lacquer', color: '#f2f0eb' } },
    handle: { label: '손잡이', def: { kind: 'metal', color: '#9a9a9a' } },
    legs: { label: '다리', def: { kind: 'wood', color: '#c9a77c' } },
  },
  params: [
    { key: 'cols', label: '가로 칸 수', type: 'number', default: 2, min: 1, max: 8, step: 1 },
    { key: 'rows', label: '세로 칸 수', type: 'number', default: 3, min: 1, max: 10, step: 1 },
    {
      key: 'fill',
      label: '앞면 구성',
      type: 'select',
      default: 'drawers',
      options: opts(
        ['drawers', '전부 서랍'],
        ['doors', '여닫이 문'],
        ['sliding', '미닫이 문'],
        ['glass', '유리문'],
        ['open', '오픈 선반'],
        ['cubes', '큐브(정사각 칸)'],
        ['topOpen', '위 오픈 + 아래 문'],
        ['bottomOpen', '아래 오픈 + 위 문'],
        ['mixed', '아래 서랍 + 위 문'],
        ['tvbench', 'TV장(양끝 서랍)'],
      ),
    },
    { key: 'base', label: '받침', type: 'select', default: 'plinth', options: opts(['plinth', '걸레받이'], ['legs', '다리'], ['hairpin', '헤어핀 다리'], ['none', '없음(바닥)']) },
    { key: 'legH', label: '다리 높이', type: 'number', default: 15, min: 0, max: 40, unit: 'cm' },
    { key: 'legStyle', label: '다리 모양', type: 'select', default: 'tapered', options: LEG_OPTIONS },
    { key: 'handle', label: '손잡이', type: 'select', default: 'bar', options: opts(['bar', '바'], ['knob', '노브'], ['long', '롱 바'], ['cutout', '홈 손잡이'], ['none', '푸시(없음)']) },
    { key: 'frameT', label: '판재 두께', type: 'number', default: 1.8, min: 1, max: 5, unit: 'cm' },
    { key: 'books', label: '오픈칸 소품 표시', type: 'bool', default: true },
    { key: 'noBack', label: '뒷판 없음', type: 'bool', default: false },
    { key: 'open', label: '문 열어 보기', type: 'bool', default: false },
  ],
  build: buildCase,
};

// ---------------------------------------------------------------- Open shelving systems
function buildShelf(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const frame = c.mat('frame');
  const board = c.mat('board');
  const style = str(p, 'style', 'wire');
  const n = Math.max(1, Math.round(num(p, 'shelves', 5)));
  const books = bool(p, 'books', true);
  if (style === 'wire' || style === 'metalRack') {
    for (const [x, z] of [
      [-w / 2 + 1.2, -d / 2 + 1.2],
      [w / 2 - 1.2, -d / 2 + 1.2],
      [-w / 2 + 1.2, d / 2 - 1.2],
      [w / 2 - 1.2, d / 2 - 1.2],
    ])
      cyl(g, 1.2, 1.2, h, frame, x, 0, z, 10);
    for (let i = 0; i < n; i++) {
      const y = 6 + (i * (h - 8)) / Math.max(1, n - 1);
      bb(g, -w / 2, y, -d / 2, w / 2, y + (style === 'wire' ? 0.8 : 2.5), d / 2, style === 'wire' ? frame : board);
      if (books && i < n - 1 && i > 0) fillShelf(g, -w / 2 + 2, w / 2 - 2, y + 1, (h - 8) / Math.max(1, n - 1) - 2, -d / 2 + 1, d - 2, i * 17);
    }
  } else if (style === 'ladder') {
    const tilt = 0.12;
    for (const s of [-1, 1]) rod(g, V(s * (w / 2 - 2), 0, d / 2 - 2), V(s * (w / 2 - 2), h, -d / 2 + 2), 1.6, frame);
    for (let i = 0; i < n; i++) {
      const f = i / Math.max(1, n - 1);
      const y = 10 + f * (h - 25);
      const depth = d * (1 - f * 0.65);
      const zc = d / 2 - 2 - (y / h) * (d - 4) - depth / 2 + 2;
      bb(g, -w / 2 + 3, y, zc - depth / 2, w / 2 - 3, y + 2, zc + depth / 2, board);
      if (books && i > 0) fillShelf(g, -w / 2 + 4, w / 2 - 4, y + 2, 22, zc - depth / 2, depth, i * 7);
    }
    void tilt;
  } else if (style === 'wall') {
    // floating wall shelves: n boards stacked within h
    for (let i = 0; i < n; i++) {
      const y = n === 1 ? 0 : (i * (h - 2.5)) / (n - 1);
      bb(g, -w / 2, y, -d / 2, w / 2, y + 2.5, d / 2, board);
      if (books && i < n - 1) fillShelf(g, -w / 2 + 2, w / 2 - 2, y + 2.5, Math.min(26, (h - 2.5) / Math.max(1, n - 1) - 2), -d / 2, d, i * 11 + 3);
    }
    if (n === 1 && books) fillShelf(g, -w / 2 + 2, w / 2 - 2, 2.5, 22, -d / 2, d, 5);
  } else if (style === 'rail') {
    // wall-mounted rail system with side ladders (String-like)
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 1);
      rod(g, V(x, 0, -d / 2 + 0.5), V(x, h, -d / 2 + 0.5), 0.6, frame, 6);
      rod(g, V(x, 0, -d / 2 + 0.5), V(x, 0, d / 2), 0.6, frame, 6);
      rod(g, V(x, h, -d / 2 + 0.5), V(x, h, d / 2), 0.6, frame, 6);
      rod(g, V(x, 0, d / 2), V(x, h, d / 2), 0.6, frame, 6);
    }
    for (let i = 0; i < n; i++) {
      const y = 1 + (i * (h - 4)) / Math.max(1, n - 1);
      bb(g, -w / 2 + 1, y, -d / 2 + 1, w / 2 - 1, y + 1.5, d / 2 - 0.5, board);
      if (books && i < n - 1) fillShelf(g, -w / 2 + 3, w / 2 - 3, y + 1.5, (h - 4) / Math.max(1, n - 1) - 3, -d / 2 + 1, d - 2, i * 5 + 1);
    }
  } else if (style === 'posts') {
    // wooden post-and-shelf (IVAR-like)
    for (const s of [-1, 1]) {
      for (const zz of [-d / 2 + 2, d / 2 - 2]) bb(g, s * (w / 2) - (s > 0 ? 3 : 0), 0, zz - 1.5, s * (w / 2) + (s < 0 ? 3 : 0), h, zz + 1.5, frame);
      for (let k = 0; k < 6; k++) bb(g, s * (w / 2) - (s > 0 ? 3 : 0), 20 + k * ((h - 40) / 5), -d / 2 + 2, s * (w / 2) + (s < 0 ? 3 : 0), 22 + k * ((h - 40) / 5), d / 2 - 2, frame);
    }
    for (let i = 0; i < n; i++) {
      const y = 8 + (i * (h - 12)) / Math.max(1, n - 1);
      bb(g, -w / 2 + 3, y, -d / 2, w / 2 - 3, y + 2, d / 2, board);
      if (books && i > 0 && i < n - 1) fillShelf(g, -w / 2 + 4, w / 2 - 4, y + 2, (h - 12) / Math.max(1, n - 1) - 3, -d / 2, d, i * 23);
    }
  } else if (style === 'pegboard') {
    bb(g, -w / 2, 0, -d / 2, w / 2, h, -d / 2 + 1.5, board);
    const dot = getMaterial({ kind: 'plastic', color: '#333333' });
    for (let x = -w / 2 + 5; x < w / 2 - 2; x += 5) for (let y = 5; y < h - 2; y += 5) box(g, 0.6, 0.6, 0.1, dot, x, y, -d / 2 + 1.55);
    bb(g, -w / 3, h * 0.45, -d / 2 + 1.5, w / 3, h * 0.45 + 1.5, d / 2, frame);
  }
  return g;
}

export const shelfDef: ModelDef = {
  key: 'shelf',
  label: '선반/랙',
  slots: {
    frame: { label: '프레임/기둥', def: { kind: 'metal', color: '#2b2b2b' } },
    board: { label: '선반판', def: { kind: 'wood', color: '#c9a77c' } },
  },
  params: [
    {
      key: 'style',
      label: '형태',
      type: 'select',
      default: 'wire',
      options: opts(['wire', '와이어(스틸) 랙'], ['metalRack', '철제 앵글+선반판'], ['posts', '원목 기둥 선반'], ['ladder', '사다리 선반'], ['wall', '벽 선반(떠있는)'], ['rail', '벽 레일 시스템'], ['pegboard', '타공판']),
    },
    { key: 'shelves', label: '선반 수', type: 'number', default: 5, min: 1, max: 10, step: 1 },
    { key: 'books', label: '소품 표시', type: 'bool', default: true },
  ],
  build: buildShelf,
};

// ---------------------------------------------------------------- Clothing rack (행거)
const CLOTH = ['#2f3b4a', '#d8d2c6', '#7d8a6a', '#b36b4f', '#f3f1ec', '#3e3e3e', '#a7b8c7', '#c9b28d'];
function buildRack(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const frame = c.mat('frame');
  const style = str(p, 'style', 'single');
  const clothes = bool(p, 'clothes', true);
  const shelfM = c.mat('shelf');
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 1.5);
    rod(g, V(x, 0, 0), V(x, h, 0), 1.3, frame, 10);
    rod(g, V(x, 1.2, -d / 2 + 1), V(x, 1.2, d / 2 - 1), 1.2, frame, 8);
  }
  rod(g, V(-w / 2 + 1.5, h - 2, 0), V(w / 2 - 1.5, h - 2, 0), 1.2, frame, 10);
  if (style === 'double') rod(g, V(-w / 2 + 1.5, h * 0.5, 0), V(w / 2 - 1.5, h * 0.5, 0), 1.2, frame, 10);
  if (style === 'shelf' || style === 'double') bb(g, -w / 2 + 3, 12, -d / 2 + 2, w / 2 - 3, 14, d / 2 - 2, shelfM);
  if (clothes) {
    const n = Math.floor((w - 10) / 7);
    const rows = style === 'double' ? [h - 2, h * 0.5] : [h - 2];
    for (const ry of rows) {
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + 6 + i * 7 + (i % 3);
        const len = (style === 'double' ? 40 : 60 + ((i * 37) % 45)) * 1;
        const cm = getMaterial({ kind: 'fabric', color: CLOTH[(i * 5 + Math.round(ry)) % CLOTH.length] });
        const cl = box(g, 2.2, len, Math.min(d - 6, 46), cm, x, ry - 4 - len / 2, 0);
        cl.rotation.y = ((i % 5) - 2) * 0.03;
        rod(g, V(x, ry - 4, -18), V(x, ry, 0), 0.3, frame, 4);
      }
    }
  }
  return g;
}

export const rackDef: ModelDef = {
  key: 'rack',
  label: '행거',
  slots: {
    frame: { label: '프레임', def: { kind: 'metal', color: '#2b2b2b' } },
    shelf: { label: '하부 선반', def: { kind: 'wood', color: '#c9a77c' } },
  },
  params: [
    { key: 'style', label: '형태', type: 'select', default: 'single', options: opts(['single', '1단'], ['shelf', '1단 + 하부선반'], ['double', '2단 + 선반']) },
    { key: 'clothes', label: '옷 표시', type: 'bool', default: true },
  ],
  build: buildRack,
};
