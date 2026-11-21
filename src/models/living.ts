import * as THREE from 'three';
import { getMaterial } from '../lib/materials';
import { imageTexture, rugTexture, type RugPattern } from '../lib/textures';
import { bb, bool, box, cyl, GenCtx, lathe, ModelDef, num, opts, plane, rbb, rbox, rod, sphere, str, torus } from './parts';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- Lamps
function shade(g: THREE.Object3D, style: string, r: number, hh: number, m: THREE.Material, y: number, x = 0, z = 0) {
  switch (style) {
    case 'globe':
      return sphere(g, r, m, x, y + r, z);
    case 'dome':
      return lathe(g, [[0.5, hh], [r * 0.35, hh * 0.95], [r * 0.8, hh * 0.55], [r, 0], [r * 0.98, 0]], m, x, y, z);
    case 'cone':
      return lathe(g, [[1.2, hh], [r, 0], [r - 0.2, 0]], m, x, y, z);
    case 'drum':
      return lathe(g, [[r, hh], [r, 0]], m, x, y, z);
    case 'mushroom':
      return lathe(g, [[0.5, hh], [r * 0.7, hh * 0.85], [r, hh * 0.35], [r * 0.95, 0.2]], m, x, y, z);
    case 'layered': {
      lathe(g, [[1, hh], [r * 0.35, hh * 0.8], [r * 0.45, hh * 0.65]], m, x, y, z);
      lathe(g, [[r * 0.45, hh * 0.72], [r * 0.7, hh * 0.38], [r * 0.73, hh * 0.32]], m, x, y, z);
      return lathe(g, [[r * 0.6, hh * 0.45], [r, hh * 0.05], [r * 0.97, 0]], m, x, y, z);
    }
    case 'paper':
      return sphere(g, r, m, x, y + hh / 2, z, 1, hh / (2 * r), 1);
    case 'pleat':
      return lathe(g, [[r * 0.6, hh], [r, 0]], m, x, y, z, 18);
    default:
      return lathe(g, [[r * 0.75, hh], [r, 0]], m, x, y, z);
  }
}

function buildLamp(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const body = c.mat('body');
  const sh = c.mat('shade');
  const kind = str(p, 'kind', 'floor');
  const style = str(p, 'shade', 'drum');
  const r = Math.min(w, d) / 2;
  if (kind === 'pendant') {
    // h = total drop from ceiling mount (item y is bottom of shade)
    const sh0 = num(p, 'shadeH', Math.min(30, h * 0.4));
    shade(g, style, r, sh0, sh, 0);
    rod(g, V(0, sh0, 0), V(0, h - 1, 0), 0.25, body, 6);
    cyl(g, 5, 5, 1.5, body, 0, h - 1.5, 0);
    sphere(g, 4, getMaterial({ kind: 'emissive', color: '#fff6e0' }), 0, sh0 * 0.4, 0);
  } else if (kind === 'linear') {
    const sh0 = 6;
    rbb(g, -w / 2, 0, -d / 2, w / 2, sh0, d / 2, 1.5, sh);
    bb(g, -w / 2 + 2, -0.2, -d / 2 + 1, w / 2 - 2, 0.3, d / 2 - 1, getMaterial({ kind: 'emissive', color: '#ffffff' }));
    for (const s of [-1, 1]) rod(g, V(s * (w / 2 - 10), sh0, 0), V(s * (w / 2 - 10), h - 1, 0), 0.15, body, 4);
  } else if (kind === 'ceiling') {
    // flush ceiling panel (y is bottom)
    if (style === 'square') rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 1, sh);
    else cyl(g, r, r * 0.97, h, sh, 0, 0, 0, 48);
    sphere(g, 1, getMaterial({ kind: 'emissive', color: '#ffffff' }), 0, -0.2, 0, r, 0.1, r);
  } else if (kind === 'wall') {
    bb(g, -4, h * 0.3, -d / 2, 4, h * 0.7, -d / 2 + 1.5, body);
    rod(g, V(0, h * 0.5, -d / 2 + 1), V(0, h * 0.5, d / 2 - r), 0.8, body);
    shade(g, style, Math.min(r, h / 2), Math.min(h * 0.6, 20), sh, h * 0.25, 0, d / 2 - r);
  } else if (kind === 'table') {
    const base = str(p, 'base', 'stem');
    const sh0 = Math.min(h * 0.45, num(p, 'shadeH', h * 0.4));
    if (base === 'ceramic') {
      lathe(g, [[0.1, 0], [r * 0.5, 0.5], [r * 0.7, (h - sh0) * 0.4], [r * 0.4, (h - sh0) * 0.95], [1, h - sh0]], body);
    } else if (base === 'mushroom') {
      cyl(g, r * 0.25, r * 0.4, h - sh0, body, 0, 0, 0);
    } else {
      cyl(g, r * 0.6, r * 0.65, 2, body, 0, 0, 0, 32);
      rod(g, V(0, 2, 0), V(0, h - sh0 * 0.6, 0), 0.8, body);
    }
    shade(g, style, r, sh0, sh, h - sh0);
  } else if (kind === 'task') {
    cyl(g, 9, 10, 2.5, body, -w / 2 + 10, 0, 0);
    rod(g, V(-w / 2 + 10, 2, 0), V(-w / 2 + 16, h * 0.55, 0), 0.8, body);
    rod(g, V(-w / 2 + 16, h * 0.55, 0), V(w / 2 - 8, h - 6, 0), 0.8, body);
    const s = shade(g, 'cone', 7, 12, sh, h - 14, w / 2 - 8, 0);
    s.rotation.z = -0.6;
  } else {
    // floor lamps
    const base = str(p, 'base', 'stem');
    const sh0 = num(p, 'shadeH', 35);
    if (base === 'arc') {
      cyl(g, 18, 20, 4, getMaterial({ kind: 'marble', color: '#f1efe9' }), -w / 2 + 20, 0, 0);
      const curve = new THREE.QuadraticBezierCurve3(V(-w / 2 + 20, 4, 0), V(-w / 2 + 25, h * 1.25, 0), V(w / 2 - r, h - sh0 - 4, 0));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.9, 8, false), body);
      tube.castShadow = true;
      g.add(tube);
      shade(g, 'dome', r, sh0, sh, h - sh0 - 6, w / 2 - r, 0);
    } else if (base === 'tripod') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        rod(g, V(Math.cos(a) * r * 0.9, 0, Math.sin(a) * r * 0.9), V(0, h - sh0 - 5, 0), 1.1, body);
      }
      shade(g, style, r * 0.8, sh0, sh, h - sh0);
    } else if (base === 'paper') {
      cyl(g, 10, 10, 1.5, body, 0, 0, 0);
      rod(g, V(0, 0, 0), V(0, h * 0.25, 0), 0.6, body);
      shade(g, 'paper', r, h * 0.72, sh, h * 0.26);
    } else {
      cyl(g, Math.min(r * 0.7, 16), Math.min(r * 0.75, 17), 2.5, body, 0, 0, 0, 32);
      rod(g, V(0, 2, 0), V(0, h - sh0 * 0.7, 0), 1, body);
      shade(g, style, r, sh0, sh, h - sh0);
    }
  }
  return g;
}

export const lampDef: ModelDef = {
  key: 'lamp',
  label: '조명',
  slots: {
    body: { label: '몸체', def: { kind: 'metal', color: '#2b2b2b' } },
    shade: { label: '갓', def: { kind: 'paper', color: '#f3eee4' } },
  },
  params: [
    {
      key: 'kind',
      label: '종류',
      type: 'select',
      default: 'floor',
      options: opts(['floor', '플로어(장스탠드)'], ['table', '테이블 램프'], ['task', '작업등(스탠드)'], ['pendant', '펜던트'], ['linear', '리니어 펜던트'], ['ceiling', '천장 직부등'], ['wall', '벽등']),
    },
    {
      key: 'shade',
      label: '갓 모양',
      type: 'select',
      default: 'drum',
      options: opts(['drum', '드럼'], ['taper', '테이퍼'], ['dome', '돔'], ['globe', '구'], ['cone', '콘'], ['mushroom', '머쉬룸'], ['layered', '겹갓'], ['pleat', '주름'], ['paper', '종이등'], ['square', '사각(직부)']),
    },
    { key: 'base', label: '받침', type: 'select', default: 'stem', options: opts(['stem', '스틱'], ['tripod', '삼각대'], ['arc', '아크'], ['paper', '종이등 받침'], ['ceramic', '세라믹 바디'], ['mushroom', '원통 바디']) },
    { key: 'shadeH', label: '갓 높이', type: 'number', default: 30, min: 5, max: 120, unit: 'cm' },
    { key: 'glow', label: '불 켜면 빛 내기', type: 'bool', default: true },
  ],
  build: buildLamp,
};

// ---------------------------------------------------------------- Rug
function buildRug(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const shape = str(p, 'shape', 'rect');
  const pattern = str(p, 'pattern', 'solid') as RugPattern;
  const c1 = str(p, 'c1', '#d8cfc0');
  const c2 = str(p, 'c2', '#8c7b65');
  const tex = rugTexture(pattern, c1, c2, w, d);
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  const t = Math.max(0.4, h);
  let me: THREE.Mesh;
  if (shape === 'round' || shape === 'oval') {
    me = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, t, 64), m);
    me.scale.z = d / w;
    // map uv for top cap uses default cylinder mapping which is fine
  } else if (shape === 'organic') {
    const s = new THREE.Shape();
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = 1 + 0.08 * Math.sin(a * 3) + 0.05 * Math.cos(a * 5);
      const x = (Math.cos(a) * rr * w) / 2;
      const y = (Math.sin(a) * rr * d) / 2;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -t / 2, 0);
    const pos = geo.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / w + 0.5;
      uv[i * 2 + 1] = pos.getZ(i) / d + 0.5;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    me = new THREE.Mesh(geo, m);
  } else {
    me = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), m);
  }
  me.position.y = t / 2;
  me.receiveShadow = true;
  g.add(me);
  return g;
}

export const rugDef: ModelDef = {
  key: 'rug',
  label: '러그',
  slots: {},
  params: [
    { key: 'shape', label: '모양', type: 'select', default: 'rect', options: opts(['rect', '사각'], ['round', '원형'], ['oval', '타원'], ['organic', '비정형']) },
    {
      key: 'pattern',
      label: '패턴',
      type: 'select',
      default: 'solid',
      options: opts(['solid', '단색'], ['border', '테두리'], ['stripe', '스트라이프'], ['check', '체크'], ['abstract', '추상'], ['persian', '페르시안'], ['gradient', '그라데이션']),
    },
    { key: 'c1', label: '주 색상', type: 'color', default: '#d8cfc0' },
    { key: 'c2', label: '보조 색상', type: 'color', default: '#8c7b65' },
  ],
  build: buildRug,
};

// ---------------------------------------------------------------- Curtains & blinds
function buildCurtain(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const fab = c.mat('fabric');
  const rodM = c.mat('rod');
  const style = str(p, 'style', 'pleat');
  const open = num(p, 'open', 0.7);
  if (style === 'roller' || style === 'blind') {
    cyl(g, 2.5, 2.5, w, rodM, 0, 0, 0).rotation.z = Math.PI / 2;
    g.children[g.children.length - 1].position.set(0, h - 3, 0);
    const dl = h * (1 - open * 0.85);
    if (style === 'blind') {
      const n = Math.floor(dl / 2.5);
      for (let i = 0; i < n; i++) bb(g, -w / 2 + 1, h - 6 - i * 2.5, -1.2, w / 2 - 1, h - 6 - i * 2.5 + 0.3, 1.2, fab);
    } else bb(g, -w / 2 + 1, h - 5 - dl, -0.2, w / 2 - 1, h - 5, 0.2, fab);
    return g;
  }
  rod(g, V(-w / 2, h - 2, 0), V(w / 2, h - 2, 0), 1, rodM);
  const sheer = style === 'sheer' || style === 'double';
  const panels = (m: THREE.Material, z: number, op: number) => {
    const panelW = (w / 2) * (1 - op * 0.75);
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -w / 2 : w / 2 - panelW;
      const folds = Math.max(3, Math.round(panelW / 10));
      const fw = panelW / folds;
      for (let i = 0; i < folds; i++) {
        const x = x0 + (i + 0.5) * fw;
        const me = new THREE.Mesh(new THREE.CylinderGeometry(fw * 0.62, fw * 0.62, h - 4, 10, 1, true, 0, Math.PI), m);
        me.position.set(x, (h - 4) / 2, z);
        me.rotation.y = i % 2 ? Math.PI : 0;
        me.scale.z = 0.5;
        me.castShadow = true;
        g.add(me);
      }
    }
  };
  if (sheer) panels(getMaterial({ kind: 'glass', color: '#f7f4ee' }), -d / 4, style === 'double' ? 0 : open);
  if (style !== 'sheer') panels(fab, d / 4, open);
  return g;
}

export const curtainDef: ModelDef = {
  key: 'curtain',
  label: '커튼/블라인드',
  slots: {
    fabric: { label: '원단', def: { kind: 'fabric', color: '#e9e3d6' } },
    rod: { label: '레일/봉', def: { kind: 'metal', color: '#bcbcbc' } },
  },
  params: [
    { key: 'style', label: '형태', type: 'select', default: 'pleat', options: opts(['pleat', '주름 커튼'], ['sheer', '쉬폰(속지)'], ['double', '속지+암막'], ['roller', '롤스크린'], ['blind', '블라인드']) },
    { key: 'open', label: '열림 정도(0~1)', type: 'number', default: 0.7, min: 0, max: 1, step: 0.1 },
  ],
  build: buildCurtain,
};

// ---------------------------------------------------------------- Plants
function leafMesh(g: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, size: number, ry: number, rx: number) {
  const geo = new THREE.SphereGeometry(size, 8, 6);
  geo.scale(1, 0.12, 0.55);
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.rotation.set(rx, ry, 0);
  me.castShadow = true;
  g.add(me);
}

function buildPlant(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const pot = c.mat('pot');
  const leaf = c.mat('foliage');
  const stem = getMaterial({ kind: 'wood', color: '#6b5236' });
  const style = str(p, 'style', 'fiddle');
  const potStyle = str(p, 'pot', 'round');
  const pr = Math.min(w, d) * 0.28;
  const ph = Math.min(h * 0.3, num(p, 'potH', pr * 1.6));
  if (potStyle === 'basket') lathe(g, [[pr * 0.8, 0], [pr, ph], [pr * 1.02, ph]], getMaterial({ kind: 'rattan', color: '#c9a978' }));
  else if (potStyle === 'stand') {
    lathe(g, [[pr * 0.7, ph * 0.6], [pr, ph], [pr * 1.02, ph]], pot);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      rod(g, V(Math.cos(a) * pr * 0.7, ph * 0.62, Math.sin(a) * pr * 0.7), V(Math.cos(a) * pr * 0.9, 0, Math.sin(a) * pr * 0.9), 0.8, stem);
    }
  } else lathe(g, [[pr * 0.75, 0], [pr, ph * 0.95], [pr * 1.05, ph], [pr * 0.95, ph]], pot);
  cyl(g, pr * 0.95, pr * 0.95, 1, getMaterial({ kind: 'stone', color: '#4a3a2c' }), 0, ph - 2, 0);
  const top = h;
  let s = 7;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  if (style === 'fiddle' || style === 'olive') {
    rod(g, V(0, ph, 0), V(2, top * 0.55, 1), style === 'olive' ? 1.2 : 1.6, stem);
    const n = style === 'olive' ? 70 : 24;
    for (let i = 0; i < n; i++) {
      const yy = top * 0.4 + rnd() * top * 0.58;
      const a = rnd() * Math.PI * 2;
      const rr = (w / 2) * (0.25 + rnd() * 0.7) * (1 - Math.abs(yy - top * 0.72) / (top * 0.6));
      leafMesh(g, leaf, Math.cos(a) * rr, yy, Math.sin(a) * rr, style === 'olive' ? 4 : 13, a, (rnd() - 0.5) * 1.2);
    }
  } else if (style === 'monstera') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rnd();
      const rr = (w / 2) * (0.5 + rnd() * 0.45);
      const yy = ph + (top - ph) * (0.45 + rnd() * 0.5);
      rod(g, V(0, ph, 0), V(Math.cos(a) * rr * 0.8, yy, Math.sin(a) * rr * 0.8), 0.5, leaf, 6);
      leafMesh(g, leaf, Math.cos(a) * rr, yy, Math.sin(a) * rr, Math.min(22, w * 0.22), -a, -0.4);
    }
  } else if (style === 'palm') {
    for (let i = 0; i < 3; i++) rod(g, V(i * 2 - 2, ph, 0), V(i * 4 - 4, top * 0.6, i - 1), 1, stem);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const len = w * 0.45;
      const base = V(((i % 3) - 1) * 4, top * 0.6, (i % 3) - 1);
      const tip = V(base.x + Math.cos(a) * len, top * (0.75 + rnd() * 0.25), base.z + Math.sin(a) * len);
      rod(g, base, tip, 0.4, leaf, 4);
      for (let k = 1; k < 7; k++) {
        const t = k / 7;
        const pt = base.clone().lerp(tip, t);
        leafMesh(g, leaf, pt.x, pt.y - t * 6, pt.z, 6, -a + Math.PI / 2, 0.6);
      }
    }
  } else if (style === 'snake') {
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = pr * 0.6 * rnd();
      const hh = (top - ph) * (0.55 + rnd() * 0.45);
      const geo = new THREE.ConeGeometry(2.6, hh, 4);
      geo.scale(1, 1, 0.35);
      const me = new THREE.Mesh(geo, leaf);
      me.position.set(Math.cos(a) * rr, ph + hh / 2, Math.sin(a) * rr);
      me.rotation.set((rnd() - 0.5) * 0.25, a, (rnd() - 0.5) * 0.25);
      me.castShadow = true;
      g.add(me);
    }
  } else if (style === 'hanging') {
    for (let i = 0; i < 20; i++) {
      const a = rnd() * Math.PI * 2;
      const yy = ph - rnd() * h * 0.6;
      leafMesh(g, leaf, Math.cos(a) * pr * 1.1, yy, Math.sin(a) * pr * 1.1, 4, a, 1.2);
    }
  } else {
    // bush / succulent
    const n = style === 'succulent' ? 14 : 30;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = (Math.min(w, d) / 2) * rnd() * 0.8;
      const yy = ph + rnd() * (top - ph) * 0.85;
      if (style === 'succulent') leafMesh(g, leaf, Math.cos(a) * rr * 0.6, ph + 2 + rnd() * 6, Math.sin(a) * rr * 0.6, 4, a, -0.8);
      else sphere(g, Math.min(w, d) * 0.16, leaf, Math.cos(a) * rr, yy, Math.sin(a) * rr);
    }
  }
  return g;
}

export const plantDef: ModelDef = {
  key: 'plant',
  label: '식물',
  slots: {
    pot: { label: '화분', def: { kind: 'ceramic', color: '#e9e4dc' } },
    foliage: { label: '잎', def: { kind: 'foliage', color: '#4f7a45' } },
  },
  params: [
    {
      key: 'style',
      label: '종류',
      type: 'select',
      default: 'fiddle',
      options: opts(['fiddle', '떡갈고무나무'], ['olive', '올리브나무'], ['monstera', '몬스테라'], ['palm', '야자(아레카)'], ['snake', '산세베리아'], ['bush', '관엽(덤불)'], ['succulent', '다육'], ['hanging', '행잉 플랜트']),
    },
    { key: 'pot', label: '화분', type: 'select', default: 'round', options: opts(['round', '원형 화분'], ['basket', '라탄 바구니'], ['stand', '화분 스탠드']) },
    { key: 'potH', label: '화분 높이', type: 'number', default: 30, min: 5, max: 80, unit: 'cm' },
  ],
  build: buildPlant,
};

// ---------------------------------------------------------------- Decor: art frame / mirror / misc
function buildFrame(c: GenCtx) {
  const { w, h, d, p } = c;
  const g = new THREE.Group();
  const fm = c.mat('frame');
  const ft = num(p, 'frameW', 2.5);
  const mat = bool(p, 'mat', true);
  bb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, fm);
  const inner = mat ? 0.12 : 0;
  const iw = w - ft * 2;
  const ih = h - ft * 2;
  plane(g, iw, ih, getMaterial({ kind: 'paper', color: '#f7f5f0' }), 0, h / 2, d / 2 + 0.05);
  const art = c.imageUrl
    ? new THREE.MeshStandardMaterial({ map: imageTexture(c.imageUrl), roughness: 0.8 })
    : getMaterial({ kind: 'plastic', color: str(p, 'artColor', '#c76b4a') });
  plane(g, iw * (1 - inner * 2), ih * (1 - inner * 2), art, 0, h / 2, d / 2 + 0.1);
  if (bool(p, 'leaning', false)) g.rotation.x = -0.08;
  return g;
}

export const frameDef: ModelDef = {
  key: 'frame',
  label: '액자/포스터',
  slots: { frame: { label: '프레임', def: { kind: 'wood', color: '#b8956a' } } },
  params: [
    { key: 'frameW', label: '프레임 폭', type: 'number', default: 2.5, min: 0.5, max: 10, unit: 'cm' },
    { key: 'mat', label: '매트(여백)', type: 'bool', default: true },
    { key: 'artColor', label: '이미지 없을 때 색', type: 'color', default: '#c76b4a' },
    { key: 'leaning', label: '기대어 세움', type: 'bool', default: false },
  ],
  build: buildFrame,
};

function buildMirror(c: GenCtx) {
  const { w, h, d, p } = c;
  const g = new THREE.Group();
  const fm = c.mat('frame');
  const mm = getMaterial({ kind: 'mirror', color: '#dfe6ea' });
  const shape = str(p, 'shape', 'rect');
  const stand = str(p, 'stand', 'wall');
  const fw = num(p, 'frameW', 2);
  const tilt = stand === 'lean' ? -0.12 : 0;
  const grp = new THREE.Group();
  if (shape === 'round') {
    const r = Math.min(w, h) / 2;
    cyl(grp, r, r, d, fm, 0, -d / 2, 0, 48).rotation.x = Math.PI / 2;
    grp.children[grp.children.length - 1].position.set(0, h / 2, 0);
    const mmesh = new THREE.Mesh(new THREE.CircleGeometry(r - fw, 48), mm);
    mmesh.position.set(0, h / 2, d / 2 + 0.05);
    grp.add(mmesh);
  } else if (shape === 'arch') {
    const s = new THREE.Shape();
    const r = w / 2;
    s.moveTo(-r, 0);
    s.lineTo(r, 0);
    s.lineTo(r, h - r);
    s.absarc(0, h - r, r, 0, Math.PI, false);
    s.lineTo(-r, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 24 });
    geo.translate(0, 0, -d / 2);
    const me = new THREE.Mesh(geo, fm);
    me.castShadow = true;
    grp.add(me);
    const s2 = new THREE.Shape();
    const r2 = r - fw;
    s2.moveTo(-r2, fw);
    s2.lineTo(r2, fw);
    s2.lineTo(r2, h - r);
    s2.absarc(0, h - r, r2, 0, Math.PI, false);
    s2.lineTo(-r2, fw);
    const m2 = new THREE.Mesh(new THREE.ShapeGeometry(s2, 24), mm);
    m2.position.z = d / 2 + 0.05;
    grp.add(m2);
  } else {
    bb(grp, -w / 2, 0, -d / 2, w / 2, h, d / 2, fm);
    plane(grp, w - fw * 2, h - fw * 2, mm, 0, h / 2, d / 2 + 0.05);
  }
  grp.rotation.x = tilt;
  if (stand === 'lean') grp.position.z = -Math.sin(-tilt) * h * 0.5 + d;
  g.add(grp);
  if (stand === 'stand') {
    rod(g, V(0, h * 0.5, -d / 2), V(0, 0, -d / 2 - 30), 1, fm);
  }
  return g;
}

export const mirrorDef: ModelDef = {
  key: 'mirror',
  label: '거울',
  slots: { frame: { label: '프레임', def: { kind: 'metal', color: '#2b2b2b' } } },
  params: [
    { key: 'shape', label: '모양', type: 'select', default: 'rect', options: opts(['rect', '사각'], ['round', '원형'], ['arch', '아치']) },
    { key: 'stand', label: '설치', type: 'select', default: 'wall', options: opts(['wall', '벽걸이'], ['lean', '벽에 기댐'], ['stand', '스탠드']) },
    { key: 'frameW', label: '프레임 폭', type: 'number', default: 2, min: 0.3, max: 8, unit: 'cm' },
  ],
  build: buildMirror,
};

/** Generic block / column / built-in box, optionally with label-like front lines. */
function buildBlock(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const m = c.mat('body');
  const shape = str(p, 'shape', 'box');
  if (shape === 'cylinder') {
    const me = cyl(g, w / 2, w / 2, h, m, 0, 0, 0, 40);
    me.scale.z = d / w;
  } else if (shape === 'rounded') rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, Math.min(w, d, h) * 0.12, m);
  else bb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, m);
  if (bool(p, 'doorLines', false)) {
    const n = Math.max(1, Math.round(w / 50));
    const line = getMaterial({ kind: 'plastic', color: '#9a958d' });
    for (let i = 1; i < n; i++) bb(g, -w / 2 + (w * i) / n - 0.2, 2, d / 2, -w / 2 + (w * i) / n + 0.2, h - 2, d / 2 + 0.2, line);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w * (i + 0.5)) / n + (i % 2 ? -1 : 1) * (w / n / 2 - 4);
      bb(g, x - 0.5, h * 0.42, d / 2, x + 0.5, h * 0.55, d / 2 + 1.5, getMaterial({ kind: 'metal', color: '#8a8a8a' }));
    }
  }
  return g;
}

export const blockDef: ModelDef = {
  key: 'block',
  label: '박스(직접 입력)',
  slots: { body: { label: '색/재질', def: { kind: 'plastic', color: '#c9c3b8' } } },
  params: [
    { key: 'shape', label: '모양', type: 'select', default: 'box', options: opts(['box', '직육면체'], ['rounded', '둥근 모서리'], ['cylinder', '원기둥']) },
    { key: 'doorLines', label: '문 라인 표시', type: 'bool', default: false },
  ],
  build: buildBlock,
};

function buildDecor(c: GenCtx) {
  const { w, d, h, p } = c;
  const g = new THREE.Group();
  const m = c.mat('body');
  const kind = str(p, 'kind', 'vase');
  if (kind === 'vase') {
    lathe(g, [[w * 0.25, 0], [w / 2, h * 0.35], [w * 0.3, h * 0.85], [w * 0.22, h], [w * 0.2, h]], m);
    for (let i = 0; i < 3; i++) rod(g, V(0, h * 0.8, 0), V((i - 1) * 6, h * 1.6, (i % 2) * 4), 0.3, getMaterial({ kind: 'wood', color: '#7a6040' }), 4);
  } else if (kind === 'books') {
    const cols = ['#d9cfc0', '#3d5a6c', '#a8432f', '#2f2f2f'];
    let y = 0;
    let i = 0;
    while (y < h - 1) {
      const t = Math.min(h - y, 2.5 + (i % 3));
      const b = box(g, w - (i % 2) * 3, t, d - (i % 3) * 2, getMaterial({ kind: 'paper', color: cols[i % cols.length] }), 0, y + t / 2, 0);
      b.rotation.y = ((i % 3) - 1) * 0.08;
      y += t;
      i++;
    }
  } else if (kind === 'clock') {
    cyl(g, w / 2, w / 2, d, m, 0, -d / 2, 0, 48).rotation.x = Math.PI / 2;
    g.children[0].position.set(0, h / 2, 0);
    const hand = getMaterial({ kind: 'metal', color: '#1b1b1b' });
    bb(g, -0.3, h / 2, d / 2, 0.3, h / 2 + w * 0.32, d / 2 + 0.4, hand);
    bb(g, 0, h / 2 - 0.3, d / 2, w * 0.22, h / 2 + 0.3, d / 2 + 0.4, hand);
  } else if (kind === 'divider') {
    const n = Math.max(3, Math.round(w / 45));
    const pw = w / n;
    for (let i = 0; i < n; i++) {
      const pnl = rbox(g, pw - 1, h, 2.5, 0.5, m, -w / 2 + (i + 0.5) * pw, h / 2, (i % 2 ? 1 : -1) * (d / 2 - 2));
      pnl.rotation.y = (i % 2 ? 1 : -1) * 0.35;
    }
  } else if (kind === 'slat') {
    // free-standing slatted partition on two feet
    const n = Math.max(6, Math.round(w / 9));
    for (let i = 0; i < n; i++) bb(g, -w / 2 + (i * w) / n + 1.5, 4, -2, -w / 2 + ((i + 1) * w) / n - 1.5, h, 2, m);
    bb(g, -w / 2, h - 4, -2.5, w / 2, h, 2.5, m);
    bb(g, -w / 2, 3, -2.5, w / 2, 7, 2.5, m);
    for (const s of [-1, 1]) bb(g, s * (w / 2 - 12) - 3, 0, -d / 2, s * (w / 2 - 12) + 3, 4, d / 2, m);
  } else if (kind === 'speaker') {
    rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 1.2, m);
    cyl(g, w * 0.3, w * 0.3, 1, getMaterial({ kind: 'plastic', color: '#1b1b1b' }), 0, h * 0.35, d / 2).rotation.x = Math.PI / 2;
  } else if (kind === 'basket') {
    lathe(g, [[w * 0.42, 0], [w / 2, h], [w * 0.49, h]], getMaterial({ kind: 'rattan', color: '#c9a978' }));
  } else if (kind === 'trash') {
    cyl(g, w / 2, w * 0.45, h, m, 0, 0, 0, 32);
  } else if (kind === 'tray') {
    rbb(g, -w / 2, 0, -d / 2, w / 2, h, d / 2, 1, m);
  }
  return g;
}

export const decorDef: ModelDef = {
  key: 'decor',
  label: '소품',
  slots: { body: { label: '재질', def: { kind: 'ceramic', color: '#e8e1d6' } } },
  params: [
    {
      key: 'kind',
      label: '종류',
      type: 'select',
      default: 'vase',
      options: opts(['vase', '화병'], ['books', '책 더미'], ['clock', '벽시계'], ['divider', '파티션(병풍)'], ['slat', '간살 파티션'], ['speaker', '스피커'], ['basket', '바구니'], ['trash', '휴지통'], ['tray', '트레이/박스']),
    },
  ],
  build: buildDecor,
};

export { torus };
