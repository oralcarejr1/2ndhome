import { defaultElev, defaultMount } from '../catalog/products';
import { nearestWall } from '../lib/analysis';
import { anthro } from '../lib/ergonomics';
import { bboxOf, deg2rad, normDeg, polyArea } from '../lib/geometry';
import { resolveParams } from '../models';
import { requestCamera, useScene } from '../scene/sceneState';
import { activeVersion, getProduct, useStore } from '../store/store';
import type { PlacedItem, PlacedPerson, Pose, Product, Project, Version } from '../types';

/** Centre of the largest room (the living room for a studio). */
export function mainRoomCentre(p: Project): [number, number] {
  const rooms = [...p.plan.rooms].sort((a, b) => polyArea(b.points) - polyArea(a.points));
  if (!rooms.length) return [0, 0];
  const bb = bboxOf(rooms[0].points);
  return [(bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2];
}

function surfaceHost(p: Project, v: Version): PlacedItem | undefined {
  return (
    v.items.find((i) => {
      const pr = getProduct(i.productId, p);
      return !!pr?.builtin && pr.ergo === 'desk';
    }) ??
    v.items.find((i) => {
      const pr = getProduct(i.productId, p);
      return pr && (pr.model === 'table' || pr.model === 'kitchen' || (pr.model === 'case' && (i.dims ?? pr.dims).h < 110));
    })
  );
}

/** Place a product right away at a sensible spot and select it. */
export function placeNow(productId: string) {
  const s = useStore.getState();
  const p = s.project!;
  const v = activeVersion(p)!;
  const prod = getProduct(productId, p);
  if (!prod) return;
  const mount = defaultMount(prod);
  const [cx, cz] = mainRoomCentre(p);
  let x = cx;
  let z = cz;
  let rot = 0;
  let y = defaultElev(prod, p.plan.ceiling);
  if (prod.model === 'curtain') {
    const win = p.plan.openings.find((o) => o.type === 'window' || o.type === 'balcony');
    const w = win && p.plan.walls.find((ww) => ww.id === win.wallId);
    if (win && w) {
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
      const px = w.a[0] + ((w.b[0] - w.a[0]) / L) * win.pos;
      const pz = w.a[1] + ((w.b[1] - w.a[1]) / L) * win.pos;
      const nw = nearestWall(p.plan, [px + 1, pz + 1], 100) ?? nearestWall(p.plan, [cx, cz], 2000);
      const n = nw?.n ?? [-1, 0];
      const off = w.thickness / 2 + prod.dims.d / 2 + 2;
      // normal pointing into the room
      const toC = (cx - px) * n[0] + (cz - pz) * n[1];
      const nn: [number, number] = toC >= 0 ? [n[0], n[1]] : [-n[0], -n[1]];
      x = px + nn[0] * off;
      z = pz + nn[1] * off;
      rot = normDeg((Math.atan2(nn[0], nn[1]) * 180) / Math.PI);
      y = 0;
    }
  } else if (mount === 'surface') {
    const host = surfaceHost(p, v);
    if (host) {
      const hp = getProduct(host.productId, p)!;
      const hd = host.dims ?? hp.dims;
      x = host.x;
      z = host.z;
      rot = host.rot;
      y = hd.h;
    }
  } else if (mount === 'wall') {
    const w = nearestWall(p.plan, [cx, cz - 1], 5000);
    if (w) {
      rot = normDeg((Math.atan2(w.n[0], w.n[1]) * 180) / Math.PI);
      const off = w.wall.thickness / 2 + prod.dims.d / 2 + 0.2;
      x = w.pt[0] + w.n[0] * off;
      z = w.pt[1] + w.n[1] * off;
    }
  }
  const id = s.addItem(productId, x, z, { rot, y });
  useStore.setState({ placing: null });
  if (s.view === 'mood') s.setView('3d');
  s.notify(`${prod.name} 배치됨 — 드래그해서 위치를 잡으세요`);
  return id;
}

/** The person model the human panel controls (first person of the active profile). */
export function mainAvatar(p: Project, v: Version): PlacedPerson | undefined {
  return v.people.find((h) => h.profileId === p.activeProfileId) ?? v.people[0];
}

export function updateAvatar(patch: Partial<PlacedPerson>) {
  const s = useStore.getState();
  const p = s.project!;
  const v = activeVersion(p)!;
  const h = mainAvatar(p, v);
  if (!h) {
    s.mutateVersion((vv) => {
      const [cx, cz] = mainRoomCentre(p);
      vv.people.push({ id: 'h' + Date.now().toString(36), profileId: p.activeProfileId, x: cx, z: cz, y: 0, rot: 180, pose: 'stand', ...patch });
    });
    s.setShow({ people: true });
    return;
  }
  s.updateItems([h.id], (x) => Object.assign(x, patch), false);
  if (!s.show.people) s.setShow({ people: true });
}

const front = (rot: number): [number, number] => [Math.sin(deg2rad(rot)), Math.cos(deg2rad(rot))];
const yawFacing = (dx: number, dz: number) => Math.atan2(-dx, -dz);

function enterWalk(x: number, z: number, faceX: number, faceZ: number, pose: 'stand' | 'sit' | 'lie', surface = 45) {
  useScene.getState().set({ walkPos: Object.assign({ x, z, yaw: yawFacing(faceX, faceZ) }, { tele: true }), walkPose: pose, walkSurface: surface });
  useStore.getState().setView('walk');
}

/** "사람 앉혀서/눕혀서/앞에 세워 확인" */
export function testWithHuman(it: PlacedItem, prod: Product) {
  const s = useStore.getState();
  const dims = it.dims ?? prod.dims;
  const P = resolveParams(prod, it);
  const [fx, fz] = front(it.rot);
  if (prod.ergo === 'bed' || prod.category === 'bed') {
    const top = Number(P.frameH ?? 30) + Number(P.mattressT ?? 25);
    updateAvatar({ x: it.x, z: it.z, rot: it.rot, pose: 'lie', y: top - 10 });
    s.notify(`${it.label || prod.name}에 사람을 눕혔어요`);
  } else if (prod.category === 'sofa' || prod.category === 'chair') {
    const seat = Number(P.seatH ?? prod.seatH ?? 45);
    updateAvatar({ x: it.x + fx * 6, z: it.z + fz * 6, rot: it.rot, pose: 'sit', y: seat });
    s.notify(`${it.label || prod.name}에 사람을 앉혔어요`);
  } else {
    const d = dims.d / 2 + 38;
    updateAvatar({ x: it.x + fx * d, z: it.z + fz * d, rot: normDeg(it.rot + 180), pose: 'reach', y: 0 });
    s.notify(`${it.label || prod.name} 앞에 사람을 세워 사용 공간을 표시했어요`);
  }
  requestCamera('focus', { x: it.x, z: it.z });
}

export type Scenario = 'entry' | 'sofa' | 'bed' | 'desk' | 'kitchen' | 'wardrobe';

export function runScenario(sc: Scenario) {
  const s = useStore.getState();
  const p = s.project!;
  const v = activeVersion(p)!;
  const prof = p.profiles.find((x) => x.id === p.activeProfileId) ?? p.profiles[0];
  const a = anthro(prof?.height ?? 170);
  const find = (pred: (pr: Product, it: PlacedItem) => boolean) =>
    v.items.find((it) => {
      const pr = getProduct(it.productId, p);
      return !!pr && !it.hidden && pred(pr, it);
    });
  if (sc === 'entry') {
    const o = p.plan.openings.find((x) => x.isEntry);
    const w = o && p.plan.walls.find((ww) => ww.id === o.wallId);
    if (!o || !w) return s.notify('현관문이 지정돼 있지 않아요 (평면 편집에서 지정)');
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
    const px = w.a[0] + ((w.b[0] - w.a[0]) / L) * o.pos;
    const pz = w.a[1] + ((w.b[1] - w.a[1]) / L) * o.pos;
    const [cx, cz] = mainRoomCentre(p);
    let nx = -(w.b[1] - w.a[1]) / L;
    let nz = (w.b[0] - w.a[0]) / L;
    if ((cx - px) * nx + (cz - pz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    updateAvatar({ x: px + nx * 50, z: pz + nz * 50, rot: normDeg((Math.atan2(nx, nz) * 180) / Math.PI), pose: 'walk', y: 0 });
    return enterWalk(px + nx * 50, pz + nz * 50, nx, nz, 'stand');
  }
  if (sc === 'sofa') {
    const it = find((pr) => pr.category === 'sofa');
    if (!it) return s.notify('배치된 소파가 없어요');
    const pr = getProduct(it.productId, p)!;
    const [fx, fz] = front(it.rot);
    const seat = Number(resolveParams(pr, it).seatH ?? pr.seatH ?? 43);
    updateAvatar({ x: it.x + fx * 6, z: it.z + fz * 6, rot: it.rot, pose: 'sit', y: seat });
    return enterWalk(it.x + fx * 10, it.z + fz * 10, fx, fz, 'sit', seat);
  }
  if (sc === 'bed') {
    const it = find((pr) => pr.category === 'bed');
    if (!it) return s.notify('배치된 침대가 없어요');
    const pr = getProduct(it.productId, p)!;
    const P = resolveParams(pr, it);
    const top = Number(P.frameH ?? 30) + Number(P.mattressT ?? 25);
    const [fx, fz] = front(it.rot);
    const d = (it.dims ?? pr.dims).d;
    updateAvatar({ x: it.x, z: it.z, rot: it.rot, pose: 'lie', y: top - 10 });
    return enterWalk(it.x - fx * (d / 2 - 30), it.z - fz * (d / 2 - 30), fx, fz, 'lie', top);
  }
  const before = (pred: (pr: Product, it: PlacedItem) => boolean, gap: number) => {
    const it = find(pred);
    if (!it) return null;
    const pr = getProduct(it.productId, p)!;
    const d = (it.dims ?? pr.dims).d;
    const [fx, fz] = front(it.rot);
    return { it, x: it.x + fx * (d / 2 + gap), z: it.z + fz * (d / 2 + gap), fx, fz };
  };
  if (sc === 'desk') {
    const b = before((pr) => pr.ergo === 'desk' || pr.ergo === 'standingDesk', 22);
    if (!b) return s.notify('책상이 없어요');
    updateAvatar({ x: b.x, z: b.z, rot: normDeg(b.it.rot + 180), pose: 'sit', y: Math.round(a.popliteal + 2) });
    return enterWalk(b.x, b.z, -b.fx, -b.fz, 'sit', a.popliteal + 2);
  }
  if (sc === 'kitchen') {
    const b = before((pr) => pr.ergo === 'counter', 30);
    if (!b) return s.notify('주방 상판이 없어요');
    updateAvatar({ x: b.x, z: b.z, rot: normDeg(b.it.rot + 180), pose: 'reach', y: 0 });
    return enterWalk(b.x, b.z, -b.fx, -b.fz, 'stand');
  }
  if (sc === 'wardrobe') {
    const b = before((pr) => pr.ergo === 'wardrobe' && pr.model === 'case', 40);
    if (!b) return s.notify('옷장이 없어요');
    updateAvatar({ x: b.x, z: b.z, rot: normDeg(b.it.rot + 180), pose: 'reach', y: 0 });
    s.setView('3d');
    requestCamera('focus', { x: b.it.x, z: b.it.z });
  }
}

export function setPose(pose: Pose) {
  const surface = pose === 'lie' ? 42 : pose === 'sit' ? 45 : 0;
  updateAvatar({ pose, y: surface });
}
