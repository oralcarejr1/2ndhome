import * as THREE from 'three';
import { bb, bool, box, cyl, GenCtx, leg, LEG_OPTIONS, ModelDef, num, opts, rbb, rbox, rod, sphere, str, torus } from './parts';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- Sofa
interface Cell {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  // back direction: 'z' (back at -z) or 'x' (back at +x)
  dir: 'z' | 'x';
}

function buildSofa(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const body = c.mat('body');
  const cush = c.mat('cushion');
  const legM = c.mat('legs');
  const pil = c.mat('pillow');
  const layout = str(p, 'layout', 'straight');
  const armStyle = str(p, 'arm', 'track');
  let armW = armStyle === 'none' ? 0 : num(p, 'armW', 15);
  if (armStyle === 'slim') armW = Math.min(armW, 9);
  const armH = Math.min(num(p, 'armH', 62), h);
  const seatH = num(p, 'seatH', 43);
  const legsStyle = str(p, 'legs', 'block');
  const legH = legsStyle === 'none' || legsStyle === 'plinth' ? 0 : num(p, 'legH', 12);
  const backT = num(p, 'backT', 18);
  const loose = str(p, 'cushion', 'loose');
  const backCush = bool(p, 'backCushions', true);
  const bcT = backCush ? 16 : 0;
  const cushT = loose === 'tight' ? 4 : 13;
  const baseTop = seatH - cushT;
  const mainD = layout === 'straight' ? d : Math.min(num(p, 'mainD', 95), d);
  const seats = Math.max(1, Math.round(num(p, 'seats', 3)));
  const r = 3;
  const x0 = -w / 2;
  const x1 = w / 2;
  const zb = -d / 2; // back edge
  const zMainF = zb + mainD;

  // plinth / base volumes
  const baseRects: [number, number, number, number][] = [[x0, zb, x1, zMainF]];
  const cells: Cell[] = [];
  const armL = armStyle !== 'none';
  const armR = armStyle !== 'none';

  if (layout === 'straight' || layout === 'chaiseL' || layout === 'chaiseR') {
    const ix0 = x0 + (armL ? armW : 0);
    const ix1 = x1 - (armR ? armW : 0);
    const cw = (ix1 - ix0) / seats;
    for (let i = 0; i < seats; i++) {
      const isChaise = (layout === 'chaiseL' && i === 0) || (layout === 'chaiseR' && i === seats - 1);
      cells.push({ x0: ix0 + i * cw, x1: ix0 + (i + 1) * cw, z0: zb + backT + bcT, z1: isChaise ? d / 2 : zMainF, dir: 'z' });
      if (isChaise) baseRects.push([ix0 + i * cw - (layout === 'chaiseL' ? armW : 0), zMainF, ix0 + (i + 1) * cw + (layout === 'chaiseR' ? armW : 0), d / 2]);
    }
  } else {
    // corner sectional: back along -z and along +x (cornerR) / -x (cornerL)
    const right = layout === 'cornerR';
    const sx = right ? 1 : -1;
    const backX = right ? x1 : x0; // outer side with back
    const endX = right ? x0 : x1; // free end with arm
    // main row
    const rowA0 = endX + (right ? armW : -armW);
    const rowA1 = backX - sx * (backT + bcT);
    const nA = Math.max(1, seats);
    const lo = Math.min(rowA0, rowA1);
    const hi = Math.max(rowA0, rowA1);
    const cwA = (hi - lo) / nA;
    for (let i = 0; i < nA; i++) cells.push({ x0: lo + i * cwA, x1: lo + (i + 1) * cwA, z0: zb + backT + bcT, z1: zMainF, dir: 'z' });
    // return row
    const rx0 = right ? x1 - mainD : x0 + backT + bcT;
    const rx1 = right ? x1 - backT - bcT : x0 + mainD;
    const rz0 = zMainF;
    const rz1 = d / 2 - armW;
    const nB = Math.max(1, Math.round((rz1 - rz0) / 75));
    const ch = (rz1 - rz0) / nB;
    for (let i = 0; i < nB; i++) cells.push({ x0: rx0, x1: rx1, z0: rz0 + i * ch, z1: rz0 + (i + 1) * ch, dir: 'x' });
    baseRects.push([right ? x1 - mainD : x0, zMainF, right ? x1 : x0 + mainD, d / 2]);
    // back along side
    bb(g, backX - (right ? backT : 0), legH, zb, backX + (right ? 0 : backT), h - r, d / 2, body);
    rbb(g, backX - (right ? backT : 0), h - 8, zb, backX + (right ? 0 : backT), h, d / 2, r, body);
    // arms: free end of main row, and end of return row
    if (armStyle !== 'none') {
      armBox(g, endX + (right ? 0 : -armW), endX + (right ? armW : 0), zb + backT, zMainF, legH, armH, armStyle, body);
      const ax0 = right ? x1 - mainD : x0;
      const ax1 = right ? x1 - backT : x0 + mainD;
      rbb(g, ax0, legH, d / 2 - armW, ax1, armH, d / 2, 3, body);
    }
  }

  // base boxes
  for (const [a, b, c2, e] of baseRects) {
    rbb(g, a, legH, b, c2, Math.max(legH + 2, baseTop), e, 2, body);
  }
  // back along -z
  rbb(g, x0, legH, zb, x1, h, zb + backT, r, body);

  // arms for straight/chaise
  if (armStyle !== 'none' && (layout === 'straight' || layout.startsWith('chaise'))) {
    const leftEnd = layout === 'chaiseL' ? d / 2 : zMainF;
    const rightEnd = layout === 'chaiseR' ? d / 2 : zMainF;
    armBox(g, x0, x0 + armW, zb + backT * 0.5, leftEnd, legH, armH, armStyle, body);
    armBox(g, x1 - armW, x1, zb + backT * 0.5, rightEnd, legH, armH, armStyle, body);
  }

  // cushions
  if (loose === 'bench' && layout === 'straight') {
    const a = cells[0];
    const b = cells[cells.length - 1];
    rbb(g, a.x0 + 0.5, baseTop, a.z0, b.x1 - 0.5, seatH, a.z1 - 0.5, 5, cush);
  } else {
    for (const cl of cells) {
      rbb(g, cl.x0 + 0.6, baseTop, cl.z0, cl.x1 - 0.6, seatH, cl.z1 - 0.6, loose === 'tight' ? 2 : 5, cush);
    }
  }
  if (backCush) {
    for (const cl of cells) {
      if (cl.dir === 'z') {
        if (cl.z0 > zb + backT + bcT + 1 && layout.startsWith('corner')) continue;
        const top = Math.min(h - 3, seatH + (h - seatH) * 0.92);
        const bc = rbb(g, cl.x0 + 1, seatH - 1, zb + backT - 1, cl.x1 - 1, top, zb + backT + bcT + 2, 6, cush);
        bc.rotation.x = -0.08;
      } else {
        const right = layout === 'cornerR';
        const bx = right ? w / 2 - backT : -w / 2 + backT;
        const top = Math.min(h - 3, seatH + (h - seatH) * 0.92);
        const bc = rbb(g, right ? bx - bcT - 2 : bx - 1, seatH - 1, cl.z0 + 1, right ? bx + 1 : bx + bcT + 2, top, cl.z1 - 1, 6, cush);
        bc.rotation.z = right ? 0.08 : -0.08;
      }
    }
  }
  // throw pillows
  const np = Math.round(num(p, 'pillows', 2));
  for (let i = 0; i < np && cells.length; i++) {
    const cl = i % 2 === 0 ? cells[0] : cells[cells.length - 1];
    if (cl.dir !== 'z') continue;
    const px = i % 2 === 0 ? cl.x0 + 22 : cl.x1 - 22;
    const pz = cl.z0 + 8;
    const pm = rbox(g, 40, 40, 13, 6, pil, px, seatH + 20, pz);
    pm.rotation.set(-0.25, i % 2 === 0 ? 0.15 : -0.15, 0);
  }

  // legs
  if (legsStyle === 'plinth') {
    // recessed plinth already handled by base reaching floor
    for (const [a, b, c2, e] of baseRects) bb(g, a + 3, 0, b + 3, c2 - 3, 2, e - 3, legM);
  } else if (legH > 0) {
    const pts: [number, number][] = [];
    const ins = 6;
    for (const [a, b, c2, e] of baseRects) {
      pts.push([a + ins, b + ins], [c2 - ins, b + ins], [a + ins, e - ins], [c2 - ins, e - ins]);
    }
    if (w > 200 && layout === 'straight') pts.push([0, zb + ins], [0, d / 2 - ins]);
    const uniq = pts.filter((pt, i) => pts.findIndex((q) => Math.hypot(q[0] - pt[0], q[1] - pt[1]) < 10) === i);
    for (const [lx, lz] of uniq) leg(g, legsStyle === 'metal' ? 'metal' : legsStyle, lx, lz, legH, legM, legsStyle === 'metal' ? 4 : 5);
  }
  return g;
}

function armBox(g: THREE.Object3D, x0: number, x1: number, z0: number, z1: number, y0: number, armH: number, style: string, m: THREE.Material) {
  const w = x1 - x0;
  if (style === 'round') {
    rbb(g, x0, y0, z0, x1, armH, z1, Math.min(w / 2 - 0.1, 9), m);
  } else if (style === 'rolled') {
    bb(g, x0 + 1, y0, z0, x1 - 1, armH - w * 0.35, z1, m);
    const cm = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.62, w * 0.62, z1 - z0, 20), m);
    cm.rotation.x = Math.PI / 2;
    cm.position.set((x0 + x1) / 2, armH - w * 0.55, (z0 + z1) / 2);
    cm.castShadow = cm.receiveShadow = true;
    g.add(cm);
  } else {
    rbb(g, x0, y0, z0, x1, armH, z1, 3, m);
  }
}

export const sofaDef: ModelDef = {
  key: 'sofa',
  label: '소파',
  slots: {
    body: { label: '프레임/커버', def: { kind: 'fabric', color: '#c9c2b6' } },
    cushion: { label: '쿠션', def: { kind: 'fabric', color: '#cfc8bc' } },
    legs: { label: '다리', def: { kind: 'woodDark', color: '#5b4636' } },
    pillow: { label: '쿠션(장식)', def: { kind: 'fabric', color: '#9a8b78' } },
  },
  params: [
    { key: 'seats', label: '좌석 수', type: 'number', default: 3, min: 1, max: 6, step: 1 },
    {
      key: 'layout',
      label: '형태',
      type: 'select',
      default: 'straight',
      options: opts(['straight', '일자형'], ['chaiseL', '카우치(왼쪽)'], ['chaiseR', '카우치(오른쪽)'], ['cornerL', '코너 L(왼쪽)'], ['cornerR', '코너 L(오른쪽)']),
    },
    { key: 'mainD', label: '본체 깊이', type: 'number', default: 95, min: 60, max: 130, unit: 'cm' },
    {
      key: 'arm',
      label: '팔걸이',
      type: 'select',
      default: 'track',
      options: opts(['track', '각진(트랙)'], ['round', '둥근'], ['slim', '슬림'], ['rolled', '롤'], ['none', '없음']),
    },
    { key: 'armW', label: '팔걸이 폭', type: 'number', default: 15, min: 5, max: 40, unit: 'cm' },
    { key: 'armH', label: '팔걸이 높이', type: 'number', default: 62, min: 35, max: 90, unit: 'cm' },
    { key: 'seatH', label: '좌면 높이', type: 'number', default: 43, min: 25, max: 55, unit: 'cm' },
    { key: 'backT', label: '등판 두께', type: 'number', default: 18, min: 6, max: 40, unit: 'cm' },
    { key: 'cushion', label: '좌방석', type: 'select', default: 'loose', options: opts(['loose', '분리형'], ['tight', '일체형'], ['bench', '벤치형 한 장']) },
    { key: 'backCushions', label: '등쿠션', type: 'bool', default: true },
    { key: 'legs', label: '다리', type: 'select', default: 'block', options: [...LEG_OPTIONS, { value: 'plinth', label: '좌대' }] },
    { key: 'legH', label: '다리 높이', type: 'number', default: 12, min: 0, max: 30, unit: 'cm' },
    { key: 'pillows', label: '장식 쿠션', type: 'number', default: 2, min: 0, max: 4, step: 1 },
  ],
  build: buildSofa,
};

// ---------------------------------------------------------------- Chairs
function buildChair(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const frame = c.mat('frame');
  const seat = c.mat('seat');
  const style = str(p, 'style', 'dining');
  const seatH = num(p, 'seatH', 45);
  const arms = bool(p, 'arms', false);
  const legStyle = str(p, 'legs', 'four');
  const sw = w - (arms ? 8 : 2);
  const sd = Math.min(d * 0.85, 48);
  const seatT = style === 'upholstered' ? 8 : 3;
  const sz = d / 2 - sd / 2 - (d - sd) * 0.15; // seat centre z
  const backZ = -d / 2 + 3;
  const lx = sw / 2 - 2.5;
  const lzF = sz + sd / 2 - 2.5;
  const lzB = -d / 2 + 3;

  // seat
  if (style === 'stool' || style === 'barstool') {
    cyl(g, Math.min(w, d) / 2, Math.min(w, d) / 2 - 1, 4, seat, 0, seatH - 4, 0, 32);
    const rr = Math.min(w, d) / 2 - 5;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      rod(g, V(Math.cos(a) * (rr - 3), seatH - 4, Math.sin(a) * (rr - 3)), V(Math.cos(a) * (rr + 3), 0, Math.sin(a) * (rr + 3)), 1.6, frame);
    }
    if (style === 'barstool') torus(g, rr - 1, 0.8, frame, 0, seatH * 0.33, 0, Math.PI / 2);
    if (h > seatH + 10) {
      // low back for stools with back
      rbb(g, -w / 2 + 4, seatH + 8, -d / 2 + 1, w / 2 - 4, h, -d / 2 + 4, 1.5, seat);
      rod(g, V(-w / 2 + 8, seatH, -d / 2 + 3), V(-w / 2 + 8, seatH + 10, -d / 2 + 3), 1, frame);
      rod(g, V(w / 2 - 8, seatH, -d / 2 + 3), V(w / 2 - 8, seatH + 10, -d / 2 + 3), 1, frame);
    }
    return g;
  }

  if (style === 'shell') {
    // moulded shell seat+back in one
    const shell = new THREE.Group();
    rbox(shell, sw, 3, sd, 1.5, seat, 0, seatH - 1.5, sz);
    const back = rbox(shell, sw * 0.95, h - seatH - 2, 3, 1.5, seat, 0, seatH + (h - seatH) / 2, -d / 2 + 6);
    back.rotation.x = -0.18;
    if (arms) {
      rbb(shell, -sw / 2, seatH, sz - sd / 2, -sw / 2 + 2.5, seatH + 18, sz + sd / 4, 1, seat);
      rbb(shell, sw / 2 - 2.5, seatH, sz - sd / 2, sw / 2, seatH + 18, sz + sd / 4, 1, seat);
    }
    g.add(shell);
  } else {
    rbox(g, sw, seatT, sd, style === 'upholstered' ? 3 : 1, seat, 0, seatH - seatT / 2, sz);
  }

  // legs
  const legTop = seatH - seatT;
  if (legStyle === 'eiffel') {
    const top = V(0, legTop - 1, sz);
    for (const [x, z] of [
      [-lx, lzF],
      [lx, lzF],
      [-lx, lzB + 2],
      [lx, lzB + 2],
    ]) {
      rod(g, V(x * 0.5, legTop - 2, sz + (z - sz) * 0.5), V(x, 0, z), 0.7, frame, 8);
    }
    rod(g, V(-lx, 8, lzF), V(lx, 8, lzB + 2), 0.4, frame, 6);
    rod(g, V(lx, 8, lzF), V(-lx, 8, lzB + 2), 0.4, frame, 6);
    void top;
  } else if (legStyle === 'sled') {
    for (const x of [-lx, lx]) {
      rod(g, V(x, 0.8, lzF), V(x, 0.8, lzB), 0.9, frame);
      rod(g, V(x, 0, lzF), V(x, legTop, lzF - 2), 0.9, frame);
      rod(g, V(x, 0, lzB), V(x, legTop, lzB + 4), 0.9, frame);
    }
  } else if (legStyle === 'pedestal') {
    cyl(g, 2.5, 2.5, legTop, frame, 0, 0, sz);
    cyl(g, 22, 24, 1.5, frame, 0, 0, sz, 32);
  } else if (legStyle === 'cantilever') {
    for (const x of [-lx, lx]) {
      rod(g, V(x, 0.8, lzF + 2), V(x, 0.8, lzB), 1, frame);
      rod(g, V(x, 0.8, lzF + 2), V(x, legTop - 1, lzF), 1, frame);
      rod(g, V(x, legTop - 1, lzF), V(x, legTop - 1, lzB + 2), 1, frame);
    }
  } else {
    const ls = style === 'wishbone' || style === 'windsor' ? 'round' : 'square';
    const sz2 = legStyle === 'metal' ? 2 : 3.2;
    for (const [x, z] of [
      [-lx, lzF],
      [lx, lzF],
    ])
      leg(g, legStyle === 'metal' ? 'metal' : ls, x, z, legTop, frame, sz2);
    // back legs go up to form back posts for wood chairs
    const postTop = style === 'dining' || style === 'windsor' || style === 'ladder' ? h : legTop;
    for (const x of [-lx, lx]) {
      if (legStyle === 'metal') leg(g, 'metal', x, lzB, legTop, frame, 2);
      else rod(g, V(x, 0, lzB), V(x, postTop, lzB - (postTop > legTop ? 3 : 0)), sz2 / 2, frame, 10);
    }
    if (legStyle !== 'metal') {
      // stretchers
      bb(g, -lx, 14, lzF - 1, lx, 16, lzF + 1, frame);
      bb(g, -lx - 1, 18, lzB, -lx + 1, 20, lzF, frame);
      bb(g, lx - 1, 18, lzB, lx + 1, 20, lzF, frame);
    }
  }

  // backrest
  if (style === 'dining' || style === 'ladder') {
    const n = style === 'ladder' ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const y = h - 4 - i * ((h - seatH) / 3.2);
      bb(g, -lx, y - (style === 'ladder' ? 4 : 9), lzB - 3, lx, y, lzB - 1, frame);
    }
  } else if (style === 'windsor') {
    bb(g, -lx - 1, h - 5, lzB - 4, lx + 1, h, lzB - 1, frame);
    for (let i = 0; i < 6; i++) {
      const x = -lx + ((i + 0.5) / 6) * lx * 2;
      rod(g, V(x, seatH, lzB), V(x, h - 4, lzB - 2.5), 0.6, frame, 6);
    }
  } else if (style === 'wishbone') {
    torus(g, sw / 2 - 2, 1.4, frame, 0, seatH + 12, sz - 2, Math.PI / 2, 0, Math.PI);
    g.children[g.children.length - 1].rotation.set(-Math.PI / 2, 0, 0);
    g.children[g.children.length - 1].position.set(0, h - 4, sz - 2);
    rod(g, V(0, seatH, lzB + 2), V(0, h - 6, -sd / 2 + sz - 6), 1.5, frame);
    for (const x of [-lx, lx]) rod(g, V(x, 0, lzB), V(x * 0.95, h - 4, sz - 6), 1.6, frame, 10);
  } else if (style === 'upholstered') {
    const bk = rbox(g, sw, h - seatH, 7, 3, seat, 0, seatH + (h - seatH) / 2, -d / 2 + 4);
    bk.rotation.x = -0.1;
  } else if (style === 'folding') {
    bb(g, -lx, h - 12, lzB - 2, lx, h - 2, lzB, frame);
  }
  if (arms && style !== 'shell') {
    for (const x of [-sw / 2 - 2, sw / 2 + 2]) {
      bb(g, x - 2, seatH + 18, lzB, x + 2, seatH + 21, lzF, frame);
      rod(g, V(x, seatH - seatT, lzF - 3), V(x, seatH + 18, lzF - 3), 1.2, frame);
    }
  }
  return g;
}

export const chairDef: ModelDef = {
  key: 'chair',
  label: '의자',
  slots: {
    frame: { label: '프레임', def: { kind: 'wood', color: '#c8a77e' } },
    seat: { label: '좌판/쉘', def: { kind: 'wood', color: '#c8a77e' } },
  },
  params: [
    {
      key: 'style',
      label: '스타일',
      type: 'select',
      default: 'dining',
      options: opts(
        ['dining', '원목 식탁의자'],
        ['ladder', '래더백'],
        ['windsor', '윈저(살대)'],
        ['wishbone', '위시본(Y)'],
        ['shell', '쉘(플라스틱)'],
        ['upholstered', '패브릭 등받이'],
        ['folding', '접이식'],
        ['stool', '스툴'],
        ['barstool', '바 스툴'],
      ),
    },
    { key: 'seatH', label: '좌면 높이', type: 'number', default: 45, min: 20, max: 85, unit: 'cm' },
    { key: 'arms', label: '팔걸이', type: 'bool', default: false },
    {
      key: 'legs',
      label: '다리',
      type: 'select',
      default: 'four',
      options: opts(['four', '네 다리'], ['metal', '메탈 다리'], ['eiffel', '에펠(와이어)'], ['sled', '썰매형'], ['cantilever', '캔틸레버'], ['pedestal', '외다리']),
    },
  ],
  build: buildChair,
};

// ---------------------------------------------------------------- Office chair
function buildOffice(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const frame = c.mat('frame');
  const seat = c.mat('seat');
  const back = c.mat('back');
  const seatH = num(p, 'seatH', 47);
  const head = bool(p, 'headrest', false);
  const arms = bool(p, 'arms', true);
  const R = Math.min(w, d) / 2 - 2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const ex = Math.cos(a) * R;
    const ez = Math.sin(a) * R;
    rod(g, V(0, 9, 0), V(ex, 6, ez), 1.6, frame, 8);
    sphere(g, 2.6, frame, ex, 2.6, ez, 1, 1, 1);
  }
  cyl(g, 2.6, 3.2, seatH - 18, frame, 0, 8, 0, 16);
  const sw = Math.min(w * 0.75, 52);
  const sd = Math.min(d * 0.75, 50);
  rbox(g, sw, 7, sd, 3, seat, 0, seatH - 3.5, 2);
  const bh = h - seatH - (head ? 14 : 4);
  const bk = rbox(g, sw * 0.92, bh, 5, 3, back, 0, seatH + 6 + bh / 2, -sd / 2 - 1);
  bk.rotation.x = -0.12;
  rod(g, V(0, seatH - 4, -sd / 2 + 2), V(0, seatH + 12, -sd / 2 - 4), 1.8, frame, 8);
  if (head) {
    const hr = rbox(g, sw * 0.5, 11, 5, 2.5, back, 0, h - 6, -sd / 2 - 6);
    hr.rotation.x = -0.12;
  }
  if (arms) {
    for (const x of [-sw / 2 - 3, sw / 2 + 3]) {
      rod(g, V(x * 0.9, seatH - 2, 0), V(x, seatH + 20, -2), 1.3, frame, 8);
      rbox(g, 6, 3, 24, 1.4, frame, x, seatH + 21, 0);
    }
  }
  return g;
}

export const officeDef: ModelDef = {
  key: 'office',
  label: '사무용 의자',
  slots: {
    frame: { label: '프레임/베이스', def: { kind: 'plastic', color: '#2b2b2b' } },
    seat: { label: '좌판', def: { kind: 'fabric', color: '#3a3a3a' } },
    back: { label: '등판(메쉬)', def: { kind: 'fabric', color: '#2f2f2f' } },
  },
  params: [
    { key: 'seatH', label: '현재 좌면 높이', type: 'number', default: 47, min: 35, max: 60, unit: 'cm' },
    { key: 'headrest', label: '헤드레스트', type: 'bool', default: false },
    { key: 'arms', label: '팔걸이', type: 'bool', default: true },
  ],
  build: buildOffice,
};

// ---------------------------------------------------------------- Lounge chairs
function buildLounge(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const frame = c.mat('frame');
  const cush = c.mat('cushion');
  const style = str(p, 'style', 'bentwood');
  const seatH = num(p, 'seatH', 40);
  if (style === 'bentwood') {
    for (const x of [-w / 2 + 3, w / 2 - 3]) {
      // ribbon frame: base runner + armrest loop
      rod(g, V(x, 1.5, d / 2 - 4), V(x, 1.5, -d / 2 + 8), 1.4, frame);
      rod(g, V(x, 1.5, d / 2 - 4), V(x, seatH + 18, d / 2 - 10), 1.4, frame);
      rod(g, V(x, seatH + 18, d / 2 - 10), V(x, seatH + 20, -d / 2 + 18), 1.4, frame);
      rod(g, V(x, seatH + 20, -d / 2 + 18), V(x, 1.5, -d / 2 + 8), 1.4, frame);
    }
    const cs = new THREE.Group();
    rbox(cs, w - 12, 8, d * 0.55, 4, cush, 0, 0, 0);
    cs.position.set(0, seatH - 2, d * 0.1);
    cs.rotation.x = 0.12;
    g.add(cs);
    const bk = rbox(g, w - 12, (h - seatH) * 1.05, 9, 4, cush, 0, seatH + (h - seatH) / 2 + 2, -d / 2 + 14);
    bk.rotation.x = -0.35;
  } else if (style === 'wingback') {
    rbb(g, -w / 2 + 6, 10, -d / 2 + 6, w / 2 - 6, seatH - 10, d / 2 - 4, 2, frame);
    rbb(g, -w / 2 + 14, seatH - 12, -d / 2 + 18, w / 2 - 14, seatH, d / 2 - 4, 4, cush);
    rbb(g, -w / 2 + 6, 10, -d / 2, w / 2 - 6, h, -d / 2 + 18, 5, frame);
    for (const s of [-1, 1]) {
      rbb(g, s * (w / 2) - (s > 0 ? 14 : 0), 10, -d / 2 + 6, s * (w / 2) + (s < 0 ? 14 : 0), seatH + 22, d / 2 - 6, 5, frame);
      rbb(g, s * (w / 2) - (s > 0 ? 12 : 0), seatH + 10, -d / 2 + 2, s * (w / 2) + (s < 0 ? 12 : 0), h - 6, -d / 2 + 30, 5, frame);
    }
    for (const [x, z] of [
      [-w / 2 + 10, -d / 2 + 10],
      [w / 2 - 10, -d / 2 + 10],
      [-w / 2 + 10, d / 2 - 10],
      [w / 2 - 10, d / 2 - 10],
    ])
      leg(g, 'tapered', x, z, 10, c.mat('legs'), 4.5);
  } else if (style === 'egg') {
    const sh = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.62), frame);
    m.scale.set(1, (h - 30) / (w / 2) / 1.35, d / w);
    m.rotation.x = -Math.PI / 2 + 0.25;
    m.position.set(0, h * 0.62, -d * 0.05);
    (m.material as THREE.Material).side = THREE.DoubleSide;
    m.castShadow = true;
    sh.add(m);
    g.add(sh);
    rbox(g, w * 0.6, 10, d * 0.5, 4, cush, 0, seatH - 4, d * 0.08);
    cyl(g, 2.5, 2.5, seatH - 12, c.mat('legs'), 0, 0, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      rod(g, V(0, 2, 0), V(Math.cos(a) * 32, 1, Math.sin(a) * 32), 1.4, c.mat('legs'));
    }
  } else if (style === 'togo') {
    // pleated low lounge: stacked rounded slabs
    rbb(g, -w / 2, 0, -d / 2 + 10, w / 2, seatH, d / 2, 12, cush);
    const bk = rbb(g, -w / 2 + 2, seatH - 8, -d / 2, w / 2 - 2, h, -d / 2 + 34, 14, cush);
    bk.rotation.x = -0.15;
    for (let i = 0; i < 4; i++) rbox(g, w - 4, 4, 4, 2, cush, 0, seatH * (0.25 + i * 0.2), d / 2 - 1 - i);
  } else if (style === 'beanbag') {
    sphere(g, Math.min(w, d) / 2, cush, 0, h * 0.42, 0, 1, (h * 0.9) / Math.min(w, d), d / Math.min(w, d));
  } else if (style === 'floor') {
    // 좌식의자: folding floor chair
    rbb(g, -w / 2, 0, -d / 2 + 6, w / 2, 8, d / 2, 3, cush);
    const bk = rbb(g, -w / 2 + 1, 4, -d / 2, w / 2 - 1, h, -d / 2 + 8, 3, cush);
    bk.rotation.x = -0.25;
    bk.position.z += 4;
  } else if (style === 'shell') {
    // shell lounge w/ wood + leather cushions (Eames-like silhouette, generic)
    const base = c.mat('legs');
    cyl(g, 3, 3, seatH - 10, base, 0, 0, -2);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      rod(g, V(0, 4, -2), V(Math.cos(a) * w * 0.42, 2, Math.sin(a) * d * 0.42 - 2), 1.5, base);
    }
    const s1 = rbox(g, w - 8, 12, d * 0.62, 5, frame, 0, seatH - 6, d * 0.12);
    s1.rotation.x = 0.1;
    const s2 = rbox(g, w - 10, 14, d * 0.6, 6, cush, 0, seatH + 2, d * 0.12);
    s2.rotation.x = 0.1;
    const b1 = rbox(g, w - 14, (h - seatH) * 0.62, 12, 5, frame, 0, seatH + 22, -d * 0.32);
    b1.rotation.x = -0.32;
    const b2 = rbox(g, w - 16, (h - seatH) * 0.6, 12, 6, cush, 0, seatH + 22, -d * 0.27);
    b2.rotation.x = -0.32;
    const h1 = rbox(g, w - 22, 18, 10, 5, cush, 0, h - 10, -d * 0.42);
    h1.rotation.x = -0.4;
    for (const s of [-1, 1]) rbox(g, 8, 4, d * 0.5, 2, base, s * (w / 2 - 5), seatH + 16, 0);
  }
  return g;
}

export const loungeDef: ModelDef = {
  key: 'lounge',
  label: '라운지 체어',
  slots: {
    frame: { label: '프레임/쉘', def: { kind: 'wood', color: '#d2b48c' } },
    cushion: { label: '쿠션', def: { kind: 'fabric', color: '#e6dccb' } },
    legs: { label: '다리/베이스', def: { kind: 'metal', color: '#2a2a2a' } },
  },
  params: [
    {
      key: 'style',
      label: '스타일',
      type: 'select',
      default: 'bentwood',
      options: opts(
        ['bentwood', '벤트우드(곡목) 라운지'],
        ['wingback', '윙백 암체어'],
        ['shell', '쉘 라운지(가죽+우드)'],
        ['egg', '에그 체어'],
        ['togo', '로우 주름형 라운지'],
        ['beanbag', '빈백'],
        ['floor', '좌식의자'],
      ),
    },
    { key: 'seatH', label: '좌면 높이', type: 'number', default: 40, min: 5, max: 50, unit: 'cm' },
  ],
  build: buildLounge,
};

// ---------------------------------------------------------------- Bench / Ottoman
function buildBench(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const top = c.mat('top');
  const legM = c.mat('legs');
  const style = str(p, 'style', 'wood');
  if (style === 'ottoman') {
    rbb(g, -w / 2, 6, -d / 2, w / 2, h, d / 2, 6, top);
    for (const [x, z] of [
      [-w / 2 + 6, -d / 2 + 6],
      [w / 2 - 6, -d / 2 + 6],
      [-w / 2 + 6, d / 2 - 6],
      [w / 2 - 6, d / 2 - 6],
    ])
      leg(g, 'tapered', x, z, 6, legM, 3.5);
  } else if (style === 'pouf') {
    cyl(g, w / 2 - 1, w / 2, h, top, 0, 0, 0, 32);
  } else {
    rbb(g, -w / 2, h - 4, -d / 2, w / 2, h, d / 2, 1, top);
    for (const [x, z] of [
      [-w / 2 + 5, -d / 2 + 4],
      [w / 2 - 5, -d / 2 + 4],
      [-w / 2 + 5, d / 2 - 4],
      [w / 2 - 5, d / 2 - 4],
    ])
      leg(g, str(p, 'legs', 'splayed'), x, z, h - 4, legM, 4);
  }
  return g;
}

export const benchDef: ModelDef = {
  key: 'bench',
  label: '벤치/오토만',
  slots: {
    top: { label: '상판/커버', def: { kind: 'wood', color: '#c8a77e' } },
    legs: { label: '다리', def: { kind: 'wood', color: '#c8a77e' } },
  },
  params: [
    { key: 'style', label: '스타일', type: 'select', default: 'wood', options: opts(['wood', '원목 벤치'], ['ottoman', '오토만'], ['pouf', '푸프(원형)']) },
    { key: 'legs', label: '다리', type: 'select', default: 'splayed', options: LEG_OPTIONS },
  ],
  build: buildBench,
};
