import * as THREE from 'three';
import { getMaterial } from '../lib/materials';
import { bb, bool, cyl, GenCtx, leg, LEG_OPTIONS, ModelDef, num, opts, rbb, str } from './parts';

// 화장대: desk-type with a standing mirror, drawer dresser with a mirror above,
// or the slim rotating "tower" (full-length mirror on one face, mirrored cabinet,
// open shelves and a stool niche on the other, round swivel base).

// A pale glossy surface reads as a mirror in every view; a fully metallic one turns black
// wherever the scene has no environment map (product preview, thumbnails).
function glass() {
  return getMaterial({ kind: 'lacquer', color: '#cbd6dc' });
}

function stool(g: THREE.Object3D, x: number, z: number, top: number, r: number, seatM: THREE.Material, legM: THREE.Material, y0 = 0) {
  cyl(g, r, r, 1.6, seatM, x, top - 1.6, z, 32);
  const lr = r * 0.78;
  for (const a of [0.25, 0.75, 1.25, 1.75]) {
    const lx = x + Math.cos(a * Math.PI) * lr;
    const lz = z + Math.sin(a * Math.PI) * lr;
    cyl(g, 1.1, 1.3, top - 1.6 - y0, legM, lx, y0, lz, 10);
  }
  // stretcher ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(lr, 0.5, 6, 32), legM);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, y0 + (top - y0) * 0.35, z);
  g.add(ring);
}

function buildTower(c: GenCtx, g: THREE.Group) {
  const { w, d, h, p } = c;
  const body = c.mat('body');
  const frame = c.mat('frame');
  const stoolM = c.mat('stool');
  const rotating = bool(p, 'rotating', true);
  const baseH = rotating ? Math.min(7, h * 0.045) : 0;
  const r = Math.min(w, d) / 2;
  if (rotating) {
    cyl(g, r, r, baseH * 0.45, body, 0, 0, 0, 48);
    cyl(g, r * 0.96, r * 0.96, baseH * 0.55, body, 0, baseH * 0.45, 0, 48);
  }
  // square tower inscribed a little inside the disc
  const tw = Math.min(w, d) * (rotating ? 0.72 : 1);
  const x0 = -tw / 2;
  const x1 = tw / 2;
  const z0 = -tw / 2;
  const z1 = tw / 2;
  const y0 = baseH;
  const t = 1.8;
  // sides, top
  bb(g, x0, y0, z0, x0 + t, h, z1, body);
  bb(g, x1 - t, y0, z0, x1, h, z1, body);
  bb(g, x0, h - t, z0, x1, h, z1, body);
  bb(g, x0, y0, z0, x1, y0 + t, z1, body);
  // back face = full-length mirror in a frame
  bb(g, x0, y0, z0, x1, h, z0 + 1.2, frame);
  bb(g, x0 + 2, y0 + 3, z0 - 0.3, x1 - 2, h - 3, z0, glass());

  // front: (top→bottom) mirror-door cabinet, open shelf, slim drawer, stool niche
  const niche = bool(p, 'stool', true) ? Math.min(46, (h - y0) * 0.3) : 0;
  const drawerH = Math.max(6, num(p, 'drawers', 1) > 0 ? 8 : 0);
  const cabTop = h - t - 4;
  const cabBot = y0 + niche + drawerH + (h - y0) * 0.12;
  const shelfY = y0 + niche + drawerH;
  // shelves inside
  for (const y of [shelfY, cabBot, cabBot + (cabTop - cabBot) * 0.33, cabBot + (cabTop - cabBot) * 0.66]) bb(g, x0 + t, y, z0 + 1.2, x1 - t, y + 1.4, z1 - 1, body);
  // drawer front
  if (drawerH > 0) {
    bb(g, x0 + t + 0.3, y0 + niche + 0.3, z1 - 1.6, x1 - t - 0.3, y0 + niche + drawerH - 0.3, z1, c.mat('front'));
    bb(g, -4, y0 + niche + drawerH / 2 - 0.4, z1, 4, y0 + niche + drawerH / 2 + 0.4, z1 + 1.2, frame);
  }
  // mirrored door over the upper cabinet
  bb(g, x0 + t, cabBot, z1 - 1.8, x1 - t, cabTop, z1 - 0.6, frame);
  bb(g, x0 + t + 1.5, cabBot + 1.5, z1 - 0.6, x1 - t - 1.5, cabTop - 1.5, z1 - 0.3, glass());
  // a few cosmetics on the open shelf
  const bottleM = getMaterial({ kind: 'glass', color: '#e9d6c4' });
  for (let i = 0; i < 3; i++) cyl(g, 1.6, 1.6, 7 + i * 2, bottleM, x0 + t + 5 + i * 5, shelfY + 1.4, 0, 12);
  // stool tucked in the niche
  if (niche > 0) {
    const sr = Math.min(tw / 2 - 3, 15);
    stool(g, 0, z1 - sr - 1, y0 + t + Math.min(niche - 3, 42), sr, stoolM, c.mat('legs'), y0 + t);
  }
}

function buildDresser(c: GenCtx, g: THREE.Group) {
  const { w, d, h, p } = c;
  const body = c.mat('body');
  const front = c.mat('front');
  const frame = c.mat('frame');
  const rows = Math.max(1, Math.min(8, Math.round(num(p, 'drawers', 3))));
  const chestH = Math.min(h * 0.55, 18 * rows + 10);
  const base = 6;
  rbb(g, -w / 2, base, -d / 2, w / 2, chestH, d / 2, 0.6, body);
  bb(g, -w / 2 + 2, 0, -d / 2 + 2, w / 2 - 2, base, d / 2 - 3, body);
  const cols = w >= 100 ? 2 : 1;
  const rh = (chestH - base - 3) / rows;
  for (let col = 0; col < cols; col++) {
    const cx0 = -w / 2 + 1.5 + (col * (w - 3)) / cols;
    const cx1 = -w / 2 + 1.5 + ((col + 1) * (w - 3)) / cols;
    for (let r = 0; r < rows; r++) {
      const y = base + 1.5 + r * rh;
      bb(g, cx0 + 0.3, y + 0.3, d / 2, cx1 - 0.3, y + rh - 0.3, d / 2 + 1.6, front);
      bb(g, (cx0 + cx1) / 2 - 5, y + rh / 2 - 0.4, d / 2 + 1.6, (cx0 + cx1) / 2 + 5, y + rh / 2 + 0.4, d / 2 + 2.6, frame);
    }
  }
  // mirror on top, set against the back
  const mw = Math.min(w * 0.8, 90);
  const mh = h - chestH - 2;
  if (mh > 10) {
    bb(g, -mw / 2, chestH, -d / 2 + 1, mw / 2, h, -d / 2 + 4, frame);
    bb(g, -mw / 2 + 2.5, chestH + 2.5, -d / 2 + 4, mw / 2 - 2.5, h - 2.5, -d / 2 + 4.3, glass());
  }
}

function buildDeskVanity(c: GenCtx, g: THREE.Group) {
  const { w, d, h, p } = c;
  const body = c.mat('body');
  const frame = c.mat('frame');
  const legM = c.mat('legs');
  const topY = Math.min(76, h * 0.6);
  const topT = 2.5;
  bb(g, -w / 2, topY - topT, -d / 2, w / 2, topY, d / 2, body);
  // apron with one wide drawer
  bb(g, -w / 2 + 2, topY - 12, -d / 2 + 2, w / 2 - 2, topY - topT, d / 2 - 0.5, body);
  if (num(p, 'drawers', 1) > 0) {
    bb(g, -w / 2 + 6, topY - 11, d / 2 - 0.5, w / 2 - 6, topY - topT - 0.8, d / 2 + 1.2, c.mat('front'));
    bb(g, -5, topY - 7.5, d / 2 + 1.2, 5, topY - 6.7, d / 2 + 2.2, frame);
  }
  const ls = str(p, 'legs', 'tapered');
  for (const [x, z] of [
    [-w / 2 + 3, -d / 2 + 3],
    [w / 2 - 3, -d / 2 + 3],
    [-w / 2 + 3, d / 2 - 3],
    [w / 2 - 3, d / 2 - 3],
  ])
    leg(g, ls, x, z, topY - 12, legM, 4);
  // mirror: standing frame on the top (or LED round)
  const mirror = str(p, 'mirror', 'stand');
  const mh = h - topY - 1;
  if (mh > 8 && mirror !== 'none') {
    const mw = Math.min(w * 0.6, mh * 0.85);
    if (mirror === 'led') {
      const rr = Math.min(mw, mh) / 2;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 1.2, 48), glass());
      disc.rotation.x = Math.PI / 2;
      disc.position.set(0, topY + mh - rr, -d / 2 + 6);
      g.add(disc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.9, 8, 48), getMaterial({ kind: 'emissive', color: '#fff4df' }));
      ring.position.copy(disc.position);
      g.add(ring);
      bb(g, -4, topY, -d / 2 + 4, 4, topY + mh - 2 * rr + 2, -d / 2 + 8, frame);
    } else {
      bb(g, -mw / 2, topY, -d / 2 + 3, mw / 2, topY + mh, -d / 2 + 5.5, frame);
      bb(g, -mw / 2 + 2, topY + 2, -d / 2 + 5.5, mw / 2 - 2, topY + mh - 2, -d / 2 + 5.8, glass());
    }
  }
  if (bool(p, 'stool', false)) {
    const sr = Math.min(17, d / 2 - 3, w / 4);
    stool(g, 0, d / 2 - sr - 1, Math.min(45, topY - 16), sr, c.mat('stool'), legM);
  }
}

function buildVanity(c: GenCtx) {
  const g = new THREE.Group();
  const style = str(c.p, 'style', 'table');
  if (style === 'tower') buildTower(c, g);
  else if (style === 'dresser') buildDresser(c, g);
  else buildDeskVanity(c, g);
  return g;
}

export const vanityDef: ModelDef = {
  key: 'vanity',
  label: '화장대',
  slots: {
    body: { label: '몸체/상판', def: { kind: 'lacquer', color: '#f2f0eb' } },
    front: { label: '서랍 앞판', def: { kind: 'lacquer', color: '#f2f0eb' } },
    frame: { label: '거울 테·손잡이', def: { kind: 'lacquer', color: '#f2f0eb' } },
    legs: { label: '다리', def: { kind: 'wood', color: '#c9a77c' } },
    stool: { label: '스툴 좌판', def: { kind: 'wood', color: '#c9a77c' } },
  },
  params: [
    {
      key: 'style',
      label: '형태',
      type: 'select',
      default: 'table',
      options: opts(['table', '책상형 + 스탠드 거울'], ['dresser', '서랍장 + 거울'], ['tower', '거울 수납장(회전/전신)']),
    },
    { key: 'drawers', label: '서랍 수', type: 'number', default: 1, min: 0, max: 8, step: 1 },
    { key: 'mirror', label: '거울', type: 'select', default: 'stand', options: opts(['stand', '사각 거울'], ['led', 'LED 원형'], ['full', '전신 거울'], ['none', '없음']) },
    { key: 'stool', label: '스툴 포함', type: 'bool', default: false },
    { key: 'rotating', label: '회전 받침', type: 'bool', default: false },
    { key: 'legs', label: '다리', type: 'select', default: 'tapered', options: LEG_OPTIONS },
  ],
  build: buildVanity,
};
