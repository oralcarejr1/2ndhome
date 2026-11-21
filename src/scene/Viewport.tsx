import { Html, Line, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { defaultElev, defaultMount } from '../catalog/products';
import { clearanceRects, computeHeatmap, computeIssues, nearestWall, resolveItems, sideGaps } from '../lib/analysis';
import { anthro } from '../lib/ergonomics';
import { bboxOf, deg2rad, itemAxes, localToWorld, normDeg, pointInPoly, rad2deg, snap as snapTo } from '../lib/geometry';
import { setLampGlow } from '../lib/materials';
import { buildPerson } from '../models/person';
import { resolveParams } from '../models';
import { activeVersion, getProduct, useStore } from '../store/store';
import type { PlacedItem, PlacedPerson, Product, Project, Vec2, Version } from '../types';
import { Footprint, ItemModel, OutlineBox } from './ItemMesh';
import { Room3D } from './Room3D';
import { useScene } from './sceneState';

const S = 0.01; // cm → m

// ------------------------------------------------------------------ helpers
function planBounds(p: Project) {
  const pts = p.plan.rooms.flatMap((r) => r.points).concat(p.plan.walls.flatMap((w) => [w.a, w.b]));
  return pts.length ? bboxOf(pts) : { minX: 0, minY: 0, maxX: 500, maxY: 400 };
}

function itemDimsOf(it: PlacedItem, prod: Product) {
  const d = it.dims ?? prod.dims;
  let h = d.h;
  if (prod.model === 'table' && (it.params?.base ?? prod.params?.base) === 'standing') h = Number(it.params?.curH ?? prod.params?.curH ?? h);
  return { w: d.w, d: d.d, h };
}

// ------------------------------------------------------------------ lights & environment
function Env() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    (scene as unknown as { environmentIntensity: number }).environmentIntensity = 0.35;
    return () => {
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Lights({ project, version }: { project: Project; version: Version }) {
  const f = version.finishes;
  const b = planBounds(project);
  const cx = ((b.minX + b.maxX) / 2) * S;
  const cz = ((b.minY + b.maxY) / 2) * S;
  const ext = (Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2) * S + 2;
  const hour = f.hour;
  const day = hour > 6 && hour < 19;
  const t = (hour - 6) / 13; // 0..1 across the day
  const az = Math.PI * (0.15 + t * 0.7);
  const el = Math.max(0.08, Math.sin(Math.PI * Math.min(Math.max(t, 0), 1)) * 1.0);
  const sunPos: [number, number, number] = [cx + Math.cos(az) * 8, Math.sin(el) * 8 + 0.5, cz + Math.sin(az) * 4 - 3];
  const sunColor = new THREE.Color().setHSL(0.09, 0.6, 0.55 + el * 0.35);
  const ref = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.target.position.set(cx, 0, cz);
      ref.current.target.updateMatrixWorld();
    }
  }, [cx, cz]);
  useEffect(() => setLampGlow(f.lampsOn), [f.lampsOn]);
  const lamps = useMemo(() => {
    if (!f.lampsOn) return [];
    const out: { x: number; y: number; z: number; key: string }[] = [];
    for (const it of version.items) {
      const prod = getProduct(it.productId, project);
      if (!prod || prod.model !== 'lamp' || it.hidden) continue;
      const P = resolveParams(prod, it);
      if (P.glow === false) continue;
      const d = it.dims ?? prod.dims;
      const kind = String(P.kind);
      const y = kind === 'pendant' || kind === 'linear' ? it.y + 5 : kind === 'ceiling' ? it.y - 5 : it.y + d.h - 15;
      out.push({ x: it.x * S, y: y * S, z: it.z * S, key: it.id });
    }
    return out.slice(0, 10);
  }, [f.lampsOn, version.items, project]);
  const ceilingLights = useMemo(() => {
    if (!f.ceilingLights) return [];
    return project.plan.rooms
      .filter((r) => !/보일러|PS/.test(r.name))
      .map((r) => {
        const bb = bboxOf(r.points);
        return { key: r.id, x: ((bb.minX + bb.maxX) / 2) * S, z: ((bb.minY + bb.maxY) / 2) * S, area: ((bb.maxX - bb.minX) * (bb.maxY - bb.minY)) / 10000 };
      });
  }, [f.ceilingLights, project.plan.rooms]);
  return (
    <>
      <hemisphereLight args={[day ? '#ffffff' : '#9fb0d0', '#b9a98f', day ? 0.55 : 0.12]} />
      <ambientLight intensity={day ? 0.18 : 0.05} />
      {day && (
        <directionalLight
          ref={ref}
          position={sunPos}
          intensity={1.6 * el + 0.3}
          color={sunColor}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          shadow-camera-left={-ext}
          shadow-camera-right={ext}
          shadow-camera-top={ext}
          shadow-camera-bottom={-ext}
          shadow-camera-near={0.5}
          shadow-camera-far={30}
        />
      )}
      {ceilingLights.map((c) => (
        <pointLight key={c.key} position={[c.x, project.plan.ceiling * S - 0.15, c.z]} intensity={(day ? 1.2 : 3.2) * Math.min(3, Math.max(0.6, c.area / 6))} distance={6} decay={2} color="#fff4e2" />
      ))}
      {lamps.map((l) => (
        <pointLight key={l.key} position={[l.x, l.y, l.z]} intensity={day ? 0.8 : 2.2} distance={4} decay={2} color="#ffd9a0" />
      ))}
    </>
  );
}

// ------------------------------------------------------------------ cameras & controls
function Cameras({ project }: { project: Project }) {
  const view = useStore((s) => s.view);
  const b = planBounds(project);
  const cx = ((b.minX + b.maxX) / 2) * S;
  const cz = ((b.minY + b.maxY) / 2) * S;
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) * S;
  const dragging = useScene((s) => s.dragging);
  const { size } = useThree();
  const zoom = Math.min(size.width / (span * 1.15), size.height / ((b.maxY - b.minY) * S * 1.4 + 0.5));
  const far = Math.max(1, (0.9 * size.height) / Math.max(1, size.width));
  if (view === 'walk') return <WalkCamera key="walk" project={project} />;
  if (view === 'top')
    return (
      <>
        <OrthographicCamera key="ortho" makeDefault position={[cx, 20, cz]} zoom={zoom} near={0.1} far={100} up={[0, 0, -1]} />
        <TopControls key="topctl" target={[cx, 0, cz]} dragging={dragging} />
      </>
    );
  return (
    <>
      <PerspectiveCamera key="persp" makeDefault position={[cx + span * 0.35 * far, (span * 0.95 + 1.5) * far, cz + span * 0.95 * far]} fov={45} near={0.05} far={200} />
      <PerspControls key="perspctl" target={[cx, 0.6, cz]} dragging={dragging} />
    </>
  );
}

function TopControls({ target, dragging }: { target: [number, number, number]; dragging: boolean }) {
  const cam = useThree((s) => s.camera);
  if (!(cam as THREE.OrthographicCamera).isOrthographicCamera) return null;
  return (
    <OrbitControls makeDefault target={target} enableRotate={false} enabled={!dragging} screenSpacePanning mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }} touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }} />
  );
}

function PerspControls({ target, dragging }: { target: [number, number, number]; dragging: boolean }) {
  const cam = useThree((s) => s.camera);
  if (!(cam as THREE.PerspectiveCamera).isPerspectiveCamera || (cam as THREE.PerspectiveCamera).fov === 70) return null;
  return <OrbitControls makeDefault target={target} enabled={!dragging} maxPolarAngle={Math.PI / 2 - 0.03} minDistance={0.8} maxDistance={40} enableDamping dampingFactor={0.12} />;
}

function WalkCamera({ project }: { project: Project }) {
  const profile = project.profiles.find((p) => p.id === project.activeProfileId) ?? project.profiles[0];
  const a = anthro(profile?.height ?? 170);
  const camRef = useRef<THREE.PerspectiveCamera>(null);
  const keys = useRef<Record<string, boolean>>({});
  const st = useRef({ yaw: 0, pitch: -0.05, x: 0, z: 0, inited: false, sit: false });
  const { gl } = useThree();
  const setScene = useScene((s) => s.set);
  const version = activeVersion(project)!;

  useEffect(() => {
    // start near the entry door, looking into the home
    const plan = project.plan;
    const entry = plan.openings.find((o) => o.isEntry);
    const b = planBounds(project);
    let x = (b.minX + b.maxX) / 2;
    let z = (b.minY + b.maxY) / 2;
    let yaw = 0;
    if (entry) {
      const w = plan.walls.find((ww) => ww.id === entry.wallId);
      if (w) {
        const dx = w.b[0] - w.a[0];
        const dz = w.b[1] - w.a[1];
        const L = Math.hypot(dx, dz);
        const px = w.a[0] + (dx / L) * entry.pos;
        const pz = w.a[1] + (dz / L) * entry.pos;
        let nx = -dz / L;
        let nz = dx / L;
        const toC = (x - px) * nx + (z - pz) * nz;
        if (toC < 0) {
          nx = -nx;
          nz = -nz;
        }
        x = px + nx * 60;
        z = pz + nz * 60;
        yaw = Math.atan2(-nx, -nz);
      }
    }
    const saved = useScene.getState().walkPos;
    st.current = { ...st.current, x: saved?.x ?? x, z: saved?.z ?? z, yaw: saved?.yaw ?? yaw, inited: true };
  }, [project.id]);

  useEffect(
    () =>
      useScene.subscribe((st, prev) => {
        if (st.walkPos && st.walkPos !== prev.walkPos && (st.walkPos as { tele?: boolean }).tele) {
          stRef.current.x = st.walkPos.x;
          stRef.current.z = st.walkPos.z;
          stRef.current.yaw = st.walkPos.yaw;
        }
      }),
    [],
  );
  const stRef = st;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      keys.current[e.code] = true;
      if (e.code === 'KeyC') st.current.sit = !st.current.sit;
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const pd = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
    };
    const pm = (e: PointerEvent) => {
      if (!dragging || useScene.getState().dragging) return;
      st.current.yaw -= (e.clientX - lx) * 0.004;
      st.current.pitch = Math.max(-1.2, Math.min(1.2, st.current.pitch - (e.clientY - ly) * 0.004));
      lx = e.clientX;
      ly = e.clientY;
    };
    const pu = () => (dragging = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    gl.domElement.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      gl.domElement.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
    };
  }, [gl]);

  const obstacles = useMemo(() => {
    const res = resolveItems(project, version).filter((r) => r.y0 < 60 && r.y1 > 10 && r.prod.model !== 'rug' && r.prod.model !== 'curtain');
    const walls = project.plan.walls;
    return { res, walls };
  }, [project, version]);

  useFrame((_, dt) => {
    const cam = camRef.current;
    if (!cam || !st.current.inited) return;
    const k = keys.current;
    const speed = (k.ShiftLeft || k.ShiftRight ? 220 : 110) * Math.min(dt, 0.05);
    let fx = 0;
    let fz = 0;
    const s = st.current;
    if (k.KeyW || k.ArrowUp) fz -= 1;
    if (k.KeyS || k.ArrowDown) fz += 1;
    if (k.KeyA) fx -= 1;
    if (k.KeyD) fx += 1;
    if (k.ArrowLeft) s.yaw += 1.6 * dt;
    if (k.ArrowRight) s.yaw -= 1.6 * dt;
    if (fx || fz) {
      const sin = Math.sin(s.yaw);
      const cos = Math.cos(s.yaw);
      const dx = (fx * cos + fz * sin) * speed;
      const dz = (-fx * sin + fz * cos) * speed;
      const r = a.shoulderW / 2;
      const tryMove = (nx: number, nz: number) => {
        for (const w of obstacles.walls) {
          const ex = w.b[0] - w.a[0];
          const ez = w.b[1] - w.a[1];
          const L2 = ex * ex + ez * ez || 1;
          let t = ((nx - w.a[0]) * ex + (nz - w.a[1]) * ez) / L2;
          t = Math.max(0, Math.min(1, t));
          const d = Math.hypot(nx - (w.a[0] + ex * t), nz - (w.a[1] + ez * t));
          if (d < w.thickness / 2 + r * 0.6) {
            // allow passing through door openings
            const pos = t * Math.sqrt(L2);
            const inDoor = project.plan.openings.some((o) => o.wallId === w.id && o.sill < 10 && Math.abs(pos - o.pos) < o.width / 2 - 8);
            if (!inDoor) return false;
          }
        }
        for (const o of obstacles.res) if (pointInPoly([nx, nz], o.poly)) return false;
        return true;
      };
      if (tryMove(s.x + dx, s.z + dz)) {
        s.x += dx;
        s.z += dz;
      } else if (tryMove(s.x + dx, s.z)) s.x += dx;
      else if (tryMove(s.x, s.z + dz)) s.z += dz;
    }
    const wp = useScene.getState().walkPose;
    const eye = wp === 'lie' ? useScene.getState().walkSurface + 22 : wp === 'sit' || s.sit ? useScene.getState().walkSurface + a.sitEyeH : a.eyeH;
    cam.position.set(s.x * S, eye * S, s.z * S);
    cam.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
    const prev = useScene.getState();
    if (prev.walkEye !== eye) setScene({ walkEye: eye });
    if (!prev.walkPos || Math.abs(prev.walkPos.x - s.x) + Math.abs(prev.walkPos.z - s.z) > 5 || Math.abs(prev.walkPos.yaw - s.yaw) > 0.05) setScene({ walkPos: { x: s.x, z: s.z, yaw: s.yaw } });
  });
  return <PerspectiveCamera ref={camRef} makeDefault fov={70} near={0.05} far={100} />;
}

// ------------------------------------------------------------------ interaction
interface DragState {
  kind: 'move' | 'rotate';
  ids: string[];
  start: Map<string, { x: number; z: number; y: number; rot: number }>;
  anchor: Vec2;
  offset: Vec2;
  primary: string;
  mount: 'floor' | 'wall' | 'ceiling' | 'surface';
  person: boolean;
  moved: boolean;
  startAngle: number;
}

function useRaycastHelpers() {
  const { camera, gl, scene } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const setRay = (e: PointerEvent | MouseEvent) => {
    const r = gl.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  const planeHit = (y: number): Vec2 | null => {
    const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y * S);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(pl, p)) return null;
    return [p.x / S, p.z / S];
  };
  const objectsHit = (filter: (o: THREE.Object3D) => boolean) => {
    const hits = ray.intersectObjects(scene.children, true);
    return hits.find((h) => filter(h.object));
  };
  return { setRay, planeHit, objectsHit, ray };
}

function findItemId(o: THREE.Object3D | null): string | null {
  let c: THREE.Object3D | null = o;
  while (c) {
    if (c.userData?.itemId) return c.userData.itemId as string;
    c = c.parent;
  }
  return null;
}

function Interaction({ project, version }: { project: Project; version: Version }) {
  const { gl } = useThree();
  const controls = useThree((st) => st.controls) as unknown as { enabled: boolean } | null;
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const { setRay, planeHit, objectsHit } = useRaycastHelpers();
  const drag = useRef<DragState | null>(null);
  const setScene = useScene((s) => s.set);
  const placing = useStore((s) => s.placing);
  const placingPerson = useStore((s) => s.placingPerson);
  const measure = useStore((s) => s.measure);

  // snapping for floor items
  const snapFloor = (it: PlacedItem, prod: Product, x: number, z: number, rot: number, others: PlacedItem[]): { x: number; z: number; rot: number; guides: { a: Vec2; b: Vec2 }[] } => {
    const st = useStore.getState().snap;
    const dims = itemDimsOf(it, prod);
    const guides: { a: Vec2; b: Vec2 }[] = [];
    if (st.grid > 0) {
      x = snapTo(x, st.grid);
      z = snapTo(z, st.grid);
    }
    const thr = 8;
    // walls: flush any side whose rotation aligns
    if (st.walls) {
      const { ux, uz } = itemAxes(rot);
      let bx = 0;
      let bz = 0;
      let bestX = thr;
      let bestZ = thr;
      for (const w of project.plan.walls) {
        const dx = w.b[0] - w.a[0];
        const dz = w.b[1] - w.a[1];
        const L = Math.hypot(dx, dz) || 1;
        const n: Vec2 = [-dz / L, dx / L];
        const dotX = Math.abs(ux[0] * n[0] + ux[1] * n[1]);
        const dotZ = Math.abs(uz[0] * n[0] + uz[1] * n[1]);
        if (Math.max(dotX, dotZ) < 0.985) continue;
        const ext = (dims.w / 2) * dotX + (dims.d / 2) * dotZ;
        // signed distance from the wall centre line
        const sd = (x - w.a[0]) * n[0] + (z - w.a[1]) * n[1];
        // check projection within wall extent
        const tt = ((x - w.a[0]) * dx + (z - w.a[1]) * dz) / (L * L);
        if (tt < -0.05 || tt > 1.05) continue;
        const target = Math.sign(sd || 1) * (w.thickness / 2 + ext);
        const delta = target - sd;
        if (Math.abs(delta) < thr) {
          const mx = n[0] * delta;
          const mz = n[1] * delta;
          if (Math.abs(n[0]) > Math.abs(n[1])) {
            if (Math.abs(delta) < bestX) {
              bestX = Math.abs(delta);
              bx = mx;
            }
          } else if (Math.abs(delta) < bestZ) {
            bestZ = Math.abs(delta);
            bz = mz;
          }
        }
      }
      x += bx;
      z += bz;
    }
    // objects: align edges when both are axis aligned
    if (st.objects && Math.abs(Math.sin(deg2rad(rot) * 2)) < 0.01) {
      const hw = Math.abs(Math.cos(deg2rad(rot))) > 0.5 ? dims.w / 2 : dims.d / 2;
      const hd = Math.abs(Math.cos(deg2rad(rot))) > 0.5 ? dims.d / 2 : dims.w / 2;
      const myX = [x - hw, x, x + hw];
      const myZ = [z - hd, z, z + hd];
      let best = { d: 5, v: 0, line: null as null | { a: Vec2; b: Vec2 } };
      let bestz = { d: 5, v: 0, line: null as null | { a: Vec2; b: Vec2 } };
      for (const o of others) {
        const op = getProduct(o.productId, project);
        if (!op || Math.abs(Math.sin(deg2rad(o.rot) * 2)) > 0.01) continue;
        const od = itemDimsOf(o, op);
        const ohw = Math.abs(Math.cos(deg2rad(o.rot))) > 0.5 ? od.w / 2 : od.d / 2;
        const ohd = Math.abs(Math.cos(deg2rad(o.rot))) > 0.5 ? od.d / 2 : od.w / 2;
        const ox = [o.x - ohw, o.x, o.x + ohw];
        const oz = [o.z - ohd, o.z, o.z + ohd];
        const near = Math.abs(o.z - z) < hd + ohd + 150 && Math.abs(o.x - x) < hw + ohw + 150;
        if (!near) continue;
        for (const a of myX)
          for (const b of ox) {
            const d = Math.abs(a - b);
            if (d < best.d) best = { d, v: b - a, line: { a: [b, Math.min(z - hd, o.z - ohd) - 10], b: [b, Math.max(z + hd, o.z + ohd) + 10] } };
          }
        for (const a of myZ)
          for (const b of oz) {
            const d = Math.abs(a - b);
            if (d < bestz.d) bestz = { d, v: b - a, line: { a: [Math.min(x - hw, o.x - ohw) - 10, b], b: [Math.max(x + hw, o.x + ohw) + 10, b] } };
          }
      }
      if (best.line) {
        x += best.v;
        guides.push(best.line);
      }
      if (bestz.line) {
        z += bestz.v;
        guides.push(bestz.line);
      }
    }
    return { x, z, rot, guides };
  };

  const wallPlace = (prod: Product, dims: { w: number; d: number; h: number }) => {
    const hit = objectsHit((o) => !!o.userData?.wallId);
    if (!hit || !hit.face) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    n.y = 0;
    n.normalize();
    const px = hit.point.x / S;
    const pz = hit.point.z / S;
    const py = hit.point.y / S;
    const rot = normDeg(rad2deg(Math.atan2(n.x, n.z)));
    const st = useStore.getState().snap;
    let y = py - dims.h / 2;
    if (st.grid > 0) y = snapTo(y, Math.max(st.grid, 5));
    y = Math.max(0, Math.min(project.plan.ceiling - dims.h, y));
    return { x: px + n.x * (dims.d / 2 + 0.2), z: pz + n.z * (dims.d / 2 + 0.2), y, rot };
  };

  const surfacePlace = (excludeIds: string[]) => {
    const hit = objectsHit((o) => {
      const id = findItemId(o);
      return !!id && !excludeIds.includes(id);
    });
    if (hit && hit.face) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (n.y > 0.7) return { x: hit.point.x / S, z: hit.point.z / S, y: hit.point.y / S };
    }
    return null;
  };

  useEffect(() => {
    const el = gl.domElement;
    const onMove = (e: PointerEvent) => {
      setRay(e);
      const s = useStore.getState();
      // placing ghost
      if (s.placing || s.placingPerson) {
        const prod = s.placing ? getProduct(s.placing.productId, s.project) : null;
        if (prod) {
          const dims = s.placing!.dims ?? prod.dims;
          const mount = defaultMount(prod);
          if (mount === 'wall') {
            const w = wallPlace(prod, dims);
            if (w) return setScene({ ghost: { ...w, valid: true } });
          }
          if (mount === 'surface') {
            const sp = surfacePlace([]);
            if (sp) return setScene({ ghost: { x: sp.x, z: sp.z, y: sp.y, rot: useScene.getState().ghost?.rot ?? 0, valid: true } });
          }
          const p = planeHit(0);
          if (p) {
            const rot = useScene.getState().ghost?.rot ?? 0;
            const tmp: PlacedItem = { id: '_ghost', productId: prod.id, x: p[0], z: p[1], y: 0, rot, dims: s.placing!.dims };
            const sn = snapFloor(tmp, prod, p[0], p[1], rot, activeVersion(s.project)!.items);
            setScene({ ghost: { x: sn.x, z: sn.z, y: defaultElev(prod, project.plan.ceiling), rot, valid: true }, guides: sn.guides });
          }
        } else {
          const p = planeHit(0);
          if (p) setScene({ ghost: { x: p[0], z: p[1], y: 0, rot: 0, valid: true } });
        }
        return;
      }
      if (s.measure) {
        const hit = objectsHit((o) => o.type === 'Mesh' && !o.userData?.ui);
        if (hit) setScene({ measureHover: [hit.point.x / S, hit.point.y / S, hit.point.z / S] });
        return;
      }
      const d = drag.current;
      if (!d) return;
      const v = activeVersion(s.project)!;
      if (d.kind === 'rotate') {
        const it0 = d.start.get(d.primary)!;
        const p = planeHit(it0.y);
        if (!p) return;
        const ang = rad2deg(Math.atan2(p[0] - it0.x, p[1] - it0.z));
        let rot = it0.rot + (ang - d.startAngle);
        if (!e.shiftKey && s.snap.angle > 0) rot = snapTo(rot, s.snap.angle);
        d.moved = true;
        s.updateItems([d.primary], (it) => (it.rot = normDeg(rot)), false);
        return;
      }
      // move
      const it0 = d.start.get(d.primary)!;
      if (!d.person) {
        const item = v.items.find((i) => i.id === d.primary);
        const prod = item ? getProduct(item.productId, s.project) : null;
        if (!item || !prod) return;
        const dims = itemDimsOf(item, prod);
        if (d.mount === 'wall' && d.ids.length === 1) {
          const w = wallPlace(prod, dims);
          if (w) {
            d.moved = true;
            s.updateItems([d.primary], (it) => {
              it.x = w.x;
              it.z = w.z;
              it.y = w.y;
              it.rot = w.rot;
            }, false);
            return;
          }
        }
        if (d.mount === 'surface' && d.ids.length === 1) {
          const sp = surfacePlace(d.ids);
          const p = sp ?? (() => {
            const q = planeHit(0);
            return q ? { x: q[0], z: q[1], y: 0 } : null;
          })();
          if (p) {
            d.moved = true;
            s.updateItems([d.primary], (it) => {
              it.x = snapTo(p.x, s.snap.grid || 0);
              it.z = snapTo(p.z, s.snap.grid || 0);
              it.y = p.y;
            }, false);
          }
          return;
        }
        const p = planeHit(d.mount === 'ceiling' ? it0.y : 0);
        if (!p) return;
        let nx = p[0] + d.offset[0];
        let nz = p[1] + d.offset[1];
        let guides: { a: Vec2; b: Vec2 }[] = [];
        if (d.ids.length === 1 && !e.altKey) {
          const others = v.items.filter((i) => i.id !== d.primary && !i.hidden);
          const sn = snapFloor(item, prod, nx, nz, item.rot, others);
          nx = sn.x;
          nz = sn.z;
          guides = sn.guides;
        } else if (s.snap.grid > 0) {
          nx = snapTo(nx, s.snap.grid);
          nz = snapTo(nz, s.snap.grid);
        }
        const dx = nx - it0.x;
        const dz = nz - it0.z;
        d.moved = true;
        setScene({ guides });
        s.updateItems(
          d.ids,
          (it) => {
            const st0 = d.start.get(it.id);
            if (!st0) return;
            it.x = st0.x + dx;
            it.z = st0.z + dz;
          },
          false,
        );
      } else {
        const p = planeHit(0);
        if (!p) return;
        const nx = snapTo(p[0] + d.offset[0], s.snap.grid || 0);
        const nz = snapTo(p[1] + d.offset[1], s.snap.grid || 0);
        d.moved = true;
        s.updateItems([d.primary], (h) => {
          h.x = nx;
          h.z = nz;
        }, false);
      }
    };
    const onUp = () => {
      const d = drag.current;
      if (d) {
        drag.current = null;
        if (controlsRef.current) controlsRef.current.enabled = true;
        setScene({ dragging: false, guides: [] });
        if (d.person && d.moved) {
          // snap a sitting / lying person onto a seat or bed under them
          const s = useStore.getState();
          const v = activeVersion(s.project)!;
          const h = v.people.find((x) => x.id === d.primary);
          if (h && (h.pose === 'sit' || h.pose === 'lie')) {
            for (const r of resolveItems(s.project!, v)) {
              const role = r.prod.ergo;
              const ok = h.pose === 'sit' ? ['chair', 'officeChair', 'sofa', 'bed'].includes(role ?? '') || r.prod.category === 'chair' : role === 'bed';
              if (ok && pointInPoly([h.x, h.z], r.poly)) {
                const P = resolveParams(r.prod, r.it);
                const seat = h.pose === 'lie' ? Number(P.frameH ?? 30) + Number(P.mattressT ?? 25) - 10 : Number(P.seatH ?? r.prod.seatH ?? 45);
                s.updateItems([h.id], (pp) => {
                  pp.y = seat;
                  pp.rot = r.it.rot;
                  if (h.pose === 'lie') {
                    pp.x = r.it.x;
                    pp.z = r.it.z;
                  }
                }, false);
                break;
              }
            }
          }
        }
      }
    };
    el.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl, project]);

  // start drag (called by items)
  useEffect(() => {
    interactionApi.startMove = (e, id, isPerson) => {
      const s = useStore.getState();
      const v = activeVersion(s.project)!;
      const native = e.nativeEvent as PointerEvent;
      setRay(native);
      let ids = s.selection.includes(id) ? s.selection : [id];
      // groups
      if (!isPerson) {
        const it = v.items.find((i) => i.id === id);
        if (it?.groupId && !native.shiftKey) ids = Array.from(new Set([...ids, ...v.items.filter((i) => i.groupId === it.groupId).map((i) => i.id)]));
      }
      const movable = ids.filter((x) => {
        const it = v.items.find((i) => i.id === x);
        return it ? !it.locked : v.people.some((h) => h.id === x);
      });
      if (!movable.includes(id)) return;
      const start = new Map<string, { x: number; z: number; y: number; rot: number }>();
      for (const x of movable) {
        const it = v.items.find((i) => i.id === x) ?? (v.people.find((h) => h.id === x) as unknown as PlacedItem);
        if (it) start.set(x, { x: it.x, z: it.z, y: it.y, rot: it.rot });
      }
      const prim = start.get(id)!;
      const item = v.items.find((i) => i.id === id);
      const prod = item ? getProduct(item.productId, s.project) : null;
      const mount = prod ? defaultMount(prod) : 'floor';
      const hp = planeHit(mount === 'ceiling' ? prim.y : 0) ?? [prim.x, prim.z];
      s.checkpoint();
      drag.current = { kind: 'move', ids: movable, start, anchor: hp, offset: [prim.x - hp[0], prim.z - hp[1]], primary: id, mount, person: isPerson, moved: false, startAngle: 0 };
      if (controlsRef.current) controlsRef.current.enabled = false;
      setScene({ dragging: true });
    };
    interactionApi.startRotate = (e, id) => {
      const s = useStore.getState();
      const v = activeVersion(s.project)!;
      const it = v.items.find((i) => i.id === id) ?? (v.people.find((h) => h.id === id) as unknown as PlacedItem);
      if (!it || it.locked) return;
      setRay(e.nativeEvent as PointerEvent);
      const p = planeHit(it.y) ?? [it.x, it.z + 1];
      s.checkpoint();
      drag.current = { kind: 'rotate', ids: [id], start: new Map([[id, { x: it.x, z: it.z, y: it.y, rot: it.rot }]]), anchor: p, offset: [0, 0], primary: id, mount: 'floor', person: false, moved: false, startAngle: rad2deg(Math.atan2(p[0] - it.x, p[1] - it.z)) };
      if (controlsRef.current) controlsRef.current.enabled = false;
      setScene({ dragging: true });
    };
  }, [project]);

  // click on empty space / placing
  const onBgDown = (e: ThreeEvent<PointerEvent>) => {
    const s = useStore.getState();
    if (e.button !== 0) return;
    if (s.placing) {
      e.stopPropagation();
      const g = useScene.getState().ghost;
      if (!g) return;
      const id = s.addItem(s.placing.productId, g.x, g.z, { rot: g.rot, y: g.y, dims: s.placing.dims, params: s.placing.params });
      if (!(e.nativeEvent as PointerEvent).shiftKey) {
        s.cancelPlacing();
        setScene({ ghost: null, guides: [] });
      }
      void id;
      return;
    }
    if (s.placingPerson) {
      e.stopPropagation();
      const g = useScene.getState().ghost;
      if (g) s.addPerson(s.placingPerson, g.x, g.z);
      setScene({ ghost: null });
      return;
    }
    if (s.measure) {
      e.stopPropagation();
      const st = useScene.getState();
      const p: [number, number, number] = st.measureHover ?? [e.point.x / S, e.point.y / S, e.point.z / S];
      if (!st.measureStart) setScene({ measureStart: p });
      else setScene({ measures: [...st.measures, { a: st.measureStart, b: p }], measureStart: null });
      return;
    }
  };

  void placing;
  void placingPerson;
  void measure;
  interactionApi.bgDown = onBgDown;
  return null;
}

export const interactionApi: {
  startMove: (e: ThreeEvent<PointerEvent>, id: string, isPerson: boolean) => void;
  startRotate: (e: ThreeEvent<PointerEvent>, id: string) => void;
  bgDown: (e: ThreeEvent<PointerEvent>) => void;
} = { startMove: () => {}, startRotate: () => {}, bgDown: () => {} };

// ------------------------------------------------------------------ items & people
function Items({ project, version, issues }: { project: Project; version: Version; issues: Map<string, { level: string; msg: string }[]> }) {
  const selection = useStore((s) => s.selection);
  const show = useStore((s) => s.show);
  const busy = useStore((s) => !!(s.placing || s.placingPerson || s.measure));
  const walk = useStore((s) => s.view === 'walk');
  const refs = project.moodboard;
  return (
    <>
      {version.items.map((it) => {
        if (it.hidden) return null;
        const prod = getProduct(it.productId, project);
        if (!prod) return null;
        const dims = itemDimsOf(it, prod);
        const sel = selection.includes(it.id);
        const iss = issues.get(it.id);
        const bad = show.collisions && !walk && iss?.some((x) => x.level === 'bad');
        const warn = show.collisions && !walk && !bad && iss?.length;
        return (
          <group
            key={it.id}
            position={[it.x, it.y, it.z]}
            rotation={[0, deg2rad(it.rot), 0]}
            userData={{ itemId: it.id }}
            onPointerDown={(e) => {
              if (busy || e.button !== 0) return;
              e.stopPropagation();
              const s = useStore.getState();
              const native = e.nativeEvent as PointerEvent;
              const groupIds = it.groupId && !native.shiftKey ? version.items.filter((i) => i.groupId === it.groupId).map((i) => i.id) : [it.id];
              if (native.shiftKey) s.select([it.id], true);
              else if (!s.selection.includes(it.id)) s.select(groupIds);
              interactionApi.startMove(e, it.id, false);
            }}
          >
            <group scale={[it.mirror ? -1 : 1, 1, 1]}>
              <ItemModel item={it} prod={prod} imageRef={it.imageRef ? refs.find((r) => r.id === it.imageRef) : undefined} />
            </group>
            {sel && !walk && <OutlineBox w={dims.w} d={dims.d} h={dims.h} color={it.locked ? '#8a847c' : '#2f6fed'} />}
            {sel && !walk && <Footprint w={dims.w} d={dims.d} color="#2f6fed" y={-it.y + 0.8} />}
            {!sel && bad ? <OutlineBox w={dims.w} d={dims.d} h={dims.h} color="#e5484d" pad={0.5} /> : null}
            {!sel && warn ? <OutlineBox w={dims.w} d={dims.d} h={dims.h} color="#f08c00" pad={0.5} /> : null}
            {bad ? <Footprint w={dims.w} d={dims.d} color="#e5484d" opacity={0.28} y={-it.y + 0.9} /> : null}
          </group>
        );
      })}
    </>
  );
}

function People({ project, version }: { project: Project; version: Version }) {
  const selection = useStore((s) => s.selection);
  const busy = useStore((s) => !!(s.placing || s.placingPerson || s.measure));
  return (
    <>
      {version.people.map((h) => (
        <PersonNode key={h.id} h={h} project={project} selected={selection.includes(h.id)} busy={busy} />
      ))}
    </>
  );
}

function PersonNode({ h, project, selected, busy }: { h: PlacedPerson; project: Project; selected: boolean; busy: boolean }) {
  const prof = project.profiles.find((p) => p.id === h.profileId) ?? project.profiles[0];
  const height = prof?.height ?? 170;
  const obj = useMemo(() => buildPerson(height, h.pose, prof?.color ?? '#e8a17a', h.pose === 'sit' ? h.y || 45 : h.pose === 'lie' ? h.y || 40 : 45), [height, h.pose, prof?.color, h.y]);
  const yOff = h.pose === 'sit' || h.pose === 'lie' ? 0 : h.y;
  return (
    <group
      position={[h.x, yOff, h.z]}
      rotation={[0, deg2rad(h.rot), 0]}
      onPointerDown={(e) => {
        if (busy || e.button !== 0) return;
        e.stopPropagation();
        useStore.getState().select([h.id], (e.nativeEvent as PointerEvent).shiftKey);
        interactionApi.startMove(e, h.id, true);
      }}
    >
      <primitive object={obj} />
      {selected && <Footprint w={anthro(height).shoulderW} d={30} color="#2f6fed" y={0.8 - yOff} />}
      <Html position={[0, (h.pose === 'sit' ? (h.y || 45) + anthro(height).sitEyeH : h.pose === 'lie' ? 60 : height) + 22, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div className="tag3d person">
          {prof?.name} {height}cm
        </div>
      </Html>
    </group>
  );
}

// ------------------------------------------------------------------ overlays
function SelectionOverlay({ project, version }: { project: Project; version: Version }) {
  const selection = useStore((s) => s.selection);
  const show = useStore((s) => s.show);
  const view = useStore((s) => s.view);
  const id = selection.length === 1 && view !== 'walk' ? selection[0] : null;
  const it = id ? version.items.find((i) => i.id === id) : null;
  const prod = it ? getProduct(it.productId, project) : null;
  const gaps = useMemo(() => (it && show.dims ? sideGaps(project, version, it.id) : []), [it, project, version, show.dims]);
  if (!it || !prod) return null;
  const dims = itemDimsOf(it, prod);
  const r = Math.max(dims.w, dims.d) / 2 + 22;
  const y = it.y + 1;
  const dimLabelY = it.y + dims.h + 6;
  const fw = localToWorld(it.x, it.z, it.rot, 0, dims.d / 2 + 14);
  const sw = localToWorld(it.x, it.z, it.rot, dims.w / 2 + 14, 0);
  return (
    <group>
      {/* rotation handle */}
      {!it.locked && view !== 'walk' && (
        <group position={[it.x, y, it.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} userData={{ ui: true }} onPointerDown={(e) => { e.stopPropagation(); interactionApi.startRotate(e, it.id); }}>
            <ringGeometry args={[r - 4, r + 4, 64]} />
            <meshBasicMaterial color="#2f6fed" transparent opacity={0.0} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[r - 0.8, r + 0.8, 64]} />
            <meshBasicMaterial color="#2f6fed" transparent opacity={0.55} depthWrite={false} />
          </mesh>
          <mesh position={[Math.sin(deg2rad(it.rot)) * r, 0, Math.cos(deg2rad(it.rot)) * r]} userData={{ ui: true }} onPointerDown={(e) => { e.stopPropagation(); interactionApi.startRotate(e, it.id); }}>
            <sphereGeometry args={[6, 16, 12]} />
            <meshBasicMaterial color="#2f6fed" />
          </mesh>
        </group>
      )}
      {show.dims && (
        <>
          <Html position={[fw[0], dimLabelY - dims.h + 2, fw[1]]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
            <div className="tag3d dim">W {Math.round(dims.w)}</div>
          </Html>
          <Html position={[sw[0], dimLabelY - dims.h + 2, sw[1]]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
            <div className="tag3d dim">D {Math.round(dims.d)}</div>
          </Html>
          <Html position={[it.x, dimLabelY, it.z]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
            <div className="tag3d dim">H {Math.round(dims.h)}{it.y > 0.5 ? ` · 바닥+${Math.round(it.y)}` : ''}</div>
          </Html>
          {gaps.map((g) => {
            const color = g.dist < 60 && g.dist >= 2 ? '#f08c00' : '#2f6fed';
            const mid: [number, number, number] = [(g.from[0] + g.to[0]) / 2, y + 2, (g.from[1] + g.to[1]) / 2];
            if (g.dist < 1) return null;
            return (
              <group key={g.side}>
                <Line points={[[g.from[0], y + 2, g.from[1]], [g.to[0], y + 2, g.to[1]]]} color={color} lineWidth={1.5} dashed dashSize={4} gapSize={3} depthTest={false} />
                <Html position={mid} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
                  <div className="tag3d gap" style={{ color }}>
                    {Math.round(g.dist)}
                  </div>
                </Html>
              </group>
            );
          })}
        </>
      )}
    </group>
  );
}

function ClearanceZones({ project, version }: { project: Project; version: Version }) {
  const show = useStore((s) => s.show.clearance);
  const selection = useStore((s) => s.selection);
  const zones = useMemo(() => {
    const res = resolveItems(project, version);
    return res.filter((r) => show || selection.includes(r.it.id)).flatMap((r) => clearanceRects(r).map((c) => ({ ...c, id: r.it.id })));
  }, [project, version, show, selection]);
  return (
    <>
      {zones.map((z, i) => {
        const s = new THREE.Shape(z.poly.map(([x, y]) => new THREE.Vector2(x, -y)));
        return (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.7, 0]} raycast={() => null} renderOrder={3}>
            <shapeGeometry args={[s]} />
            <meshBasicMaterial color="#f08c00" transparent opacity={0.16} depthWrite={false} />
          </mesh>
        );
      })}
    </>
  );
}

function HeatmapLayer({ project, version }: { project: Project; version: Version }) {
  const on = useStore((s) => s.show.heatmap);
  const dragging = useScene((s) => s.dragging);
  const [tex, setTex] = useState<{ t: THREE.DataTexture; x0: number; z0: number; w: number; h: number } | null>(null);
  const profile = project.profiles.find((p) => p.id === project.activeProfileId) ?? project.profiles[0];
  useEffect(() => {
    if (!on || dragging || !profile) return;
    const t = setTimeout(() => {
      const hm = computeHeatmap(project, version, profile);
      if (!hm) return;
      const dt = new THREE.DataTexture(hm.rgba, hm.nx, hm.nz, THREE.RGBAFormat);
      dt.needsUpdate = true;
      dt.magFilter = THREE.LinearFilter;
      dt.minFilter = THREE.LinearFilter;
      dt.flipY = false;
      setTex((old) => {
        old?.t.dispose();
        return { t: dt, x0: hm.x0, z0: hm.z0, w: hm.nx * hm.cell, h: hm.nz * hm.cell };
      });
    }, 150);
    return () => clearTimeout(t);
  }, [on, dragging, project, version, profile]);
  if (!on || !tex) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[tex.x0 + tex.w / 2, 1.2, tex.z0 + tex.h / 2]} raycast={() => null} renderOrder={4}>
      <planeGeometry args={[tex.w, tex.h]} />
      <meshBasicMaterial map={flipped(tex.t)} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function flipped(t: THREE.DataTexture) {
  // plane after rotation maps v=0 to +z… DataTexture row 0 = z0, so flip V
  t.repeat.set(1, -1);
  t.offset.set(0, 1);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

function Guides() {
  const guides = useScene((s) => s.guides);
  return (
    <>
      {guides.map((g, i) => (
        <Line key={i} points={[[g.a[0], 2, g.a[1]], [g.b[0], 2, g.b[1]]]} color="#e5484d" lineWidth={1} dashed dashSize={5} gapSize={3} depthTest={false} />
      ))}
    </>
  );
}

function GhostLayer({ project }: { project: Project }) {
  const placing = useStore((s) => s.placing);
  const placingPerson = useStore((s) => s.placingPerson);
  const ghost = useScene((s) => s.ghost);
  const prod = placing ? getProduct(placing.productId, project) : null;
  const tmp = useMemo(() => (prod ? ({ id: '_g', productId: prod.id, x: 0, z: 0, y: 0, rot: 0, dims: placing?.dims, params: placing?.params } as PlacedItem) : undefined), [prod, placing]);
  const profile = project.profiles.find((p) => p.id === project.activeProfileId) ?? project.profiles[0];
  const personObj = useMemo(() => (placingPerson ? buildPerson(profile?.height ?? 170, placingPerson, '#2f6fed', 45) : null), [placingPerson, profile?.height]);
  if (!ghost) return null;
  if (personObj) return <primitive object={personObj} position={[ghost.x, 0, ghost.z]} />;
  if (!prod || !tmp) return null;
  return (
    <group position={[ghost.x, ghost.y, ghost.z]} rotation={[0, deg2rad(ghost.rot), 0]}>
      <ItemModel item={tmp} prod={prod} ghost />
      <Footprint w={(placing?.dims ?? prod.dims).w} d={(placing?.dims ?? prod.dims).d} color="#2f6fed" opacity={0.25} y={-ghost.y + 0.8} />
    </group>
  );
}

function Measures() {
  const { measures, measureStart, measureHover } = useScene();
  const all = [...measures];
  if (measureStart && measureHover) all.push({ a: measureStart, b: measureHover });
  return (
    <>
      {all.map((m, i) => {
        const d = Math.hypot(m.a[0] - m.b[0], m.a[1] - m.b[1], m.a[2] - m.b[2]);
        return (
          <group key={i}>
            <Line points={[m.a, m.b]} color="#7c4dff" lineWidth={2} depthTest={false} />
            <Html position={[(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2 + 4, (m.a[2] + m.b[2]) / 2]} center style={{ pointerEvents: 'none' }}>
              <div className="tag3d measure">{Math.round(d)}cm</div>
            </Html>
          </group>
        );
      })}
      {measureStart && (
        <mesh position={measureStart}>
          <sphereGeometry args={[2.5, 12, 8]} />
          <meshBasicMaterial color="#7c4dff" />
        </mesh>
      )}
    </>
  );
}

function Labels({ project, version }: { project: Project; version: Version }) {
  const show = useStore((s) => s.show.labels);
  const view = useStore((s) => s.view);
  if (!show || view === 'walk') return null;
  return (
    <>
      {project.plan.rooms.map((r) => {
        const bb = bboxOf(r.points);
        return (
          <Html key={r.id} position={[(bb.minX + bb.maxX) / 2, 2, (bb.minY + bb.maxY) / 2]} center style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
            <div className="tag3d room">{r.name}</div>
          </Html>
        );
      })}
      {view === 'top' &&
        version.items.map((it) => {
          if (it.hidden) return null;
          const prod = getProduct(it.productId, project);
          if (!prod || prod.model === 'rug' || prod.mount === 'ceiling' || prod.mount === 'wall' || it.y > 100 || prod.category === 'bath') return null;
          const d = it.dims ?? prod.dims;
          if (d.w * d.d < 900) return null;
          return (
            <Html key={it.id} position={[it.x, it.y + d.h + 1, it.z]} center style={{ pointerEvents: 'none' }} zIndexRange={[6, 0]}>
              <div className="tag3d item">
                {it.label || prod.name.replace(/\(.*?\)/g, '').slice(0, 14)}
                <small>
                  {Math.round(d.w)}×{Math.round(d.d)}
                </small>
              </div>
            </Html>
          );
        })}
    </>
  );
}

function CameraRig({ project, version }: { project: Project; version: Version }) {
  const req = useScene((s) => s.camReq);
  const { camera, invalidate } = useThree();
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    if (!req || !controls || !(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
    const b = planBounds(project);
    const cx = ((b.minX + b.maxX) / 2) * S;
    const cz = ((b.minY + b.maxY) / 2) * S;
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) * S;
    const plan = project.plan;
    const openingFrame = (pred: (o: (typeof plan.openings)[number]) => boolean) => {
      const o = plan.openings.find(pred);
      const w = o && plan.walls.find((x) => x.id === o.wallId);
      if (!o || !w) return null;
      const dx = w.b[0] - w.a[0];
      const dz = w.b[1] - w.a[1];
      const L = Math.hypot(dx, dz) || 1;
      const px = w.a[0] + (dx / L) * o.pos;
      const pz = w.a[1] + (dz / L) * o.pos;
      let nx = -dz / L;
      let nz = dx / L;
      if ((cx / S - px) * nx + (cz / S - pz) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      return { px: px * S, pz: pz * S, nx, nz };
    };
    let pos: THREE.Vector3 | null = null;
    let tgt: THREE.Vector3 | null = null;
    if (req.preset === 'iso') {
      pos = new THREE.Vector3(cx + span * 0.35, span * 0.95 + 1.5, cz + span * 0.95);
      tgt = new THREE.Vector3(cx, 0.6, cz);
    } else if (req.preset === 'window') {
      const f = openingFrame((o) => o.type === 'window' || o.type === 'balcony');
      if (f) {
        pos = new THREE.Vector3(f.px + f.nx * 3.4, 1.55, f.pz + f.nz * 3.4);
        tgt = new THREE.Vector3(f.px, 1.0, f.pz);
      }
    } else if (req.preset === 'entry') {
      const f = openingFrame((o) => !!o.isEntry);
      if (f) {
        pos = new THREE.Vector3(f.px + f.nx * 0.5, 1.6, f.pz + f.nz * 0.5);
        tgt = new THREE.Vector3(f.px + f.nx * 4, 0.9, f.pz + f.nz * 4 + 0.001);
      }
    } else if (req.preset === 'desk') {
      const deskOf = (builtin: boolean) => version.items.find((i) => {
        const pr = getProduct(i.productId, project);
        return pr?.ergo === 'desk' && !!pr.builtin === builtin;
      });
      const desk = deskOf(true) ?? deskOf(false);
      if (desk) {
        const r = deg2rad(desk.rot);
        const fx = Math.sin(r);
        const fz = Math.cos(r);
        pos = new THREE.Vector3((desk.x + fx * 230) * S, 1.5, (desk.z + fz * 230) * S);
        tgt = new THREE.Vector3((desk.x + 60) * S, 0.85, desk.z * S);
      }
    } else if (req.preset === 'focus' && req.x != null && req.z != null) {
      const off = camera.position.clone().sub(controls.target);
      off.setLength(Math.min(Math.max(off.length(), 2.5), 4.5));
      tgt = new THREE.Vector3(req.x * S, 0.5, req.z * S);
      pos = tgt.clone().add(off);
    } else if (req.preset === 'zoom') {
      const off = camera.position.clone().sub(controls.target).multiplyScalar(req.f ?? 1);
      pos = controls.target.clone().add(off);
    }
    if (pos) camera.position.copy(pos);
    if (tgt) controls.target.copy(tgt);
    controls.update();
    invalidate();
  }, [req]);
  return null;
}

function FloorGrid({ project }: { project: Project }) {
  const on = useStore((s) => s.show.grid);
  if (!on) return null;
  const b = planBounds(project);
  const size = Math.ceil(Math.max(b.maxX - b.minX, b.maxY - b.minY) / 50) * 50 + 100;
  return <gridHelper args={[size, size / 50, '#b9b0a3', '#d7cfc3']} position={[(b.minX + b.maxX) / 2, 0.5, (b.minY + b.maxY) / 2]} />;
}

function AutoThumb({ version }: { version: Version }) {
  const { gl, scene, camera } = useThree();
  const view = useStore((s) => s.view);
  const selCount = useStore((s) => s.selection.length);
  const dragging = useScene((s) => s.dragging);
  useEffect(() => {
    if (view === 'walk' || dragging) return;
    const t = setTimeout(() => {
      const st = useStore.getState();
      if (st.view !== '3d' || st.selection.length || st.placing || st.measure) return;
      gl.render(scene, camera);
      const src = gl.domElement;
      const c = document.createElement('canvas');
      c.width = 360;
      c.height = Math.round((360 * src.height) / Math.max(1, src.width));
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
      const thumb = c.toDataURL('image/jpeg', 0.7);
      const vid = version.id;
      const curV = useStore.getState().project?.versions.find((x) => x.id === vid);
      if (!curV || curV.thumb === thumb) return;
      useStore.getState().mutate(
        (p) => {
          const v = p.versions.find((x) => x.id === vid);
          if (v) v.thumb = thumb;
        },
        false,
        true,
      );
    }, 2500);
    return () => clearTimeout(t);
  }, [version.id, version.updatedAt, view, dragging, selCount]);
  return null;
}

function ShotTaker({ version }: { version: Version }) {
  const req = useStore((s) => s.shotRequest);
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (!req) return;
    gl.render(scene, camera);
    const src = gl.domElement;
    const c = document.createElement('canvas');
    const w = 360;
    c.width = w;
    c.height = Math.round((w * src.height) / src.width);
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
    const thumb = c.toDataURL('image/jpeg', 0.72);
    useStore.getState().mutateVersion((v) => {
      v.thumb = thumb;
    }, false);
    const full = src.toDataURL('image/png');
    (window as unknown as { __lastShot?: string }).__lastShot = full;
    window.dispatchEvent(new CustomEvent('2ndhome:shot', { detail: { full, thumb, version: version.name } }));
  }, [req]);
  return null;
}

// ------------------------------------------------------------------ main
const downPos = { x: 0, y: 0 };
export function Viewport() {
  const project = useStore((s) => s.project);
  const view = useStore((s) => s.view);
  const show = useStore((s) => s.show);
  const version = activeVersion(project);
  const issues = useMemo(() => (project && version ? computeIssues(project, version) : new Map()), [project?.plan, version, project?.customProducts]);
  if (!project || !version) return null;
  return (
    <div
      className="canvas-wrap"
      onPointerDownCapture={(e) => {
        downPos.x = e.clientX;
        downPos.y = e.clientY;
      }}
    >
    <Canvas
      frameloop={view === 'walk' ? 'always' : 'demand'}
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      onPointerMissed={(e) => {
        const s = useStore.getState();
        const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5;
        if (e.button === 0 && !moved && !s.placing && !s.placingPerson && !s.measure && !useScene.getState().dragging) s.select([]);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <color attach="background" args={[version.finishes.hour > 6 && version.finishes.hour < 19 ? '#ece8e1' : '#1d2230']} />
      <Suspense fallback={null}>
        <Env />
        <Lights project={project} version={version} />
        <Cameras project={project} />
        <group scale={S}>
          <Room3D plan={project.plan} finishes={version.finishes} wallMode={show.walls} view={view} showCeiling={show.ceiling} />
          <Interaction project={project} version={version} />
          <Items project={project} version={version} issues={issues} />
          {show.people && view !== 'walk' && <People project={project} version={version} />}
          <SelectionOverlay project={project} version={version} />
          <ClearanceZones project={project} version={version} />
          <HeatmapLayer project={project} version={version} />
          <Guides />
          <GhostLayer project={project} />
          <Measures />
          <Labels project={project} version={version} />
          <PlaneCatcher />
          <FloorGrid project={project} />
        </group>
        <ShotTaker version={version} />
        <AutoThumb version={version} />
        <CameraRig project={project} version={version} />
      </Suspense>
    </Canvas>
    </div>
  );
}

/** Large invisible floor so placement/measure clicks always hit something. */
function PlaneCatcher() {
  const s = useStore((st) => !!(st.placing || st.placingPerson || st.measure));
  if (!s) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} userData={{ ui: true }} onPointerDown={(e) => interactionApi.bgDown(e)}>
      <planeGeometry args={[100000, 100000]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

export function useIssues() {
  const project = useStore((s) => s.project);
  const version = activeVersion(project);
  return useMemo(() => (project && version ? computeIssues(project, version) : new Map<string, { level: string; msg: string }[]>()), [project?.plan, version, project?.customProducts]);
}

export { nearestWall };
