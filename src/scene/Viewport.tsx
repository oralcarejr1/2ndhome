import { Html, Line, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { memo, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { defaultElev, defaultMount } from '../catalog/products';
import { clearanceRects, computeHeatmap, computeIssues, nearestWall, resolveItems, sideGaps } from '../lib/analysis';
import { anthro } from '../lib/ergonomics';
import { bboxOf, deg2rad, localToWorld, normDeg, pointInPoly, rad2deg, snap as snapTo } from '../lib/geometry';
import { setLampGlow } from '../lib/materials';
import { effectiveItemDims, snapFloorItem } from '../lib/snap';
import { stagePalette } from '../lib/theme';
import { resolveParams } from '../models';
import { buildPerson } from '../models/person';
import { activeVersion, getProduct, useStore } from '../store/store';
import type { PlacedItem, PlacedPerson, Product, Project, RefItem, Vec2, Version } from '../types';
import { Footprint, ItemModel, OutlineBox } from './ItemMesh';
import { Room3D } from './Room3D';
import { useScene } from './sceneState';

const S = 0.01; // cm → m

// ------------------------------------------------------------------ helpers
function planBounds(p: Project) {
  const pts = p.plan.rooms.flatMap((r) => r.points).concat(p.plan.walls.flatMap((w) => [w.a, w.b]));
  return pts.length ? bboxOf(pts) : { minX: 0, minY: 0, maxX: 500, maxY: 400 };
}

function effectiveMount(item: PlacedItem, prod: Product, ceiling: number): 'floor' | 'wall' | 'ceiling' | 'surface' {
  const dims = effectiveItemDims(item, prod);
  if (prod.mount === 'ceiling' || item.y + dims.h >= ceiling - 3) return 'ceiling';
  if (prod.mount === 'wall') return 'wall';
  if (prod.mount === 'surface') return 'surface';
  return 'floor';
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
  const { size } = useThree();
  const b = useMemo(() => planBounds(project), [project.id, project.plan.rooms.length, project.plan.walls.length]);
  const cx = ((b.minX + b.maxX) / 2) * S;
  const cz = ((b.minY + b.maxY) / 2) * S;
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) * S;
  const zoom = Math.min(size.width / (span * 1.15), size.height / ((b.maxY - b.minY) * S * 1.4 + 0.5));
  const far = Math.max(1, (0.9 * size.height) / Math.max(1, size.width));

  const initPersp = useMemo(() => {
    const saved = useScene.getState().camSaved[project.id];
    return {
      pos: (saved?.pos ?? [cx + span * 0.35 * far, (span * 0.95 + 1.5) * far, cz + span * 0.95 * far]) as [number, number, number],
      target: (saved?.target ?? [cx, 0.6, cz]) as [number, number, number],
    };
    // Only compute initial camera when project or entering 3d view changes
  }, [project.id, view === '3d']);

  const initTopPos = useMemo(() => [cx, 20, cz] as [number, number, number], [project.id, view === 'top']);
  const initTopTarget = useMemo(() => [cx, 0, cz] as [number, number, number], [project.id, view === 'top']);

  if (view === 'walk') return <WalkCamera key="walk" project={project} />;
  if (view === 'top')
    return (
      <>
        <OrthographicCamera key={`ortho-${project.id}`} makeDefault position={initTopPos} zoom={zoom} near={0.1} far={100} up={[0, 0, -1]} />
        <TopControls key={`topctl-${project.id}`} initialTarget={initTopTarget} />
      </>
    );
  return (
    <>
      <PerspectiveCamera key={`persp-${project.id}`} makeDefault position={initPersp.pos} fov={45} near={0.05} far={200} />
      <PerspControls key={`perspctl-${project.id}`} projectId={project.id} initialTarget={initPersp.target} />
    </>
  );
}

function TopControls({ initialTarget }: { initialTarget: [number, number, number] }) {
  const cam = useThree((s) => s.camera);
  const dragging = useScene((s) => s.dragging);
  const ctrlRef = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);
  useEffect(() => {
    if (ctrlRef.current) {
      ctrlRef.current.target.set(initialTarget[0], initialTarget[1], initialTarget[2]);
      ctrlRef.current.update();
    }
  }, [initialTarget]);
  if (!(cam as THREE.OrthographicCamera).isOrthographicCamera) return null;
  return (
    <OrbitControls
      ref={ctrlRef as never}
      makeDefault
      enableRotate={false}
      enabled={!dragging}
      screenSpacePanning
      mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
    />
  );
}

function PerspControls({ projectId, initialTarget }: { projectId: string; initialTarget: [number, number, number] }) {
  const cam = useThree((s) => s.camera);
  const dragging = useScene((s) => s.dragging);
  const ctrlRef = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);
  const lastRef = useRef<{ pos: [number, number, number]; target: [number, number, number] } | null>(null);

  useEffect(() => {
    if (ctrlRef.current) {
      ctrlRef.current.target.set(initialTarget[0], initialTarget[1], initialTarget[2]);
      ctrlRef.current.update();
    }
  }, [initialTarget]);

  const snapshot = () => {
    const c = ctrlRef.current;
    if (!c || !(cam as THREE.PerspectiveCamera).isPerspectiveCamera || (cam as THREE.PerspectiveCamera).fov === 70) return;
    lastRef.current = {
      pos: [cam.position.x, cam.position.y, cam.position.z],
      target: [c.target.x, c.target.y, c.target.z],
    };
  };

  const commitSave = () => {
    snapshot();
    if (!lastRef.current) return;
    const prev = useScene.getState().camSaved;
    useScene.getState().set({
      camSaved: { ...prev, [projectId]: lastRef.current },
    });
  };

  useEffect(() => () => commitSave(), [projectId]);

  if (!(cam as THREE.PerspectiveCamera).isPerspectiveCamera || (cam as THREE.PerspectiveCamera).fov === 70) return null;
  return (
    <OrbitControls
      ref={ctrlRef as never}
      makeDefault
      enabled={!dragging}
      maxPolarAngle={Math.PI / 2 - 0.03}
      minDistance={0.8}
      maxDistance={40}
      enableDamping
      dampingFactor={0.12}
      onChange={snapshot}
      onEnd={commitSave}
    />
  );
}

function WalkCamera({ project }: { project: Project }) {
  const profile = project.profiles.find((p) => p.id === project.activeProfileId) ?? project.profiles[0];
  const a = anthro(profile?.height ?? 170);
  const camRef = useRef<THREE.PerspectiveCamera>(null);
  const keys = useRef<Record<string, boolean>>({});
  const st = useRef({ yaw: 0, pitch: -0.05, x: 0, z: 0, inited: false, sit: false, stuckTime: 0 });
  const { gl, scene } = useThree();
  const setScene = useScene((s) => s.set);
  const version = activeVersion(project)!;
  const versionRef = useRef(version);
  versionRef.current = version;
  const projectRef = useRef(project);
  projectRef.current = project;

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
    st.current = { ...st.current, x: saved?.x ?? x, z: saved?.z ?? z, yaw: saved?.yaw ?? yaw, inited: true, stuckTime: 0 };
    return () => setScene({ walkTarget: null });
  }, [project.id]);

  useEffect(
    () =>
      useScene.subscribe((s, prev) => {
        if (s.walkPos && s.walkPos !== prev.walkPos && s.walkPos.tele) {
          st.current.x = s.walkPos.x;
          st.current.z = s.walkPos.z;
          st.current.yaw = s.walkPos.yaw;
          setScene({ walkTarget: null });
        }
      }),
    [],
  );

  useEffect(() => {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      keys.current[e.code] = true;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        setScene({ walkTarget: null });
      }
      if (e.code === 'KeyC') st.current.sit = !st.current.sit;
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    let pointerActive = false;
    let movedDrag = false;
    let sx = 0;
    let sy = 0;
    let lx = 0;
    let ly = 0;
    const pd = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointerActive = true;
      movedDrag = false;
      sx = lx = e.clientX;
      sy = ly = e.clientY;
    };
    const pm = (e: PointerEvent) => {
      if (!pointerActive) return;
      if (!movedDrag && Math.hypot(e.clientX - sx, e.clientY - sy) >= 5) {
        movedDrag = true;
      }
      if (movedDrag) {
        st.current.yaw -= (e.clientX - lx) * 0.004;
        st.current.pitch = Math.max(-1.2, Math.min(1.2, st.current.pitch - (e.clientY - ly) * 0.004));
      }
      lx = e.clientX;
      ly = e.clientY;
    };
    const pu = (e: PointerEvent) => {
      if (!pointerActive) return;
      pointerActive = false;
      if (movedDrag || e.button !== 0 || !camRef.current) return;
      // Quick click in 1st-person mode: sit/lie on clicked sofa/chair/bed, or walk to clicked floor spot
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camRef.current);
      const hits = ray.intersectObjects(scene.children, true);
      const curP = projectRef.current;
      const curV = versionRef.current;
      for (const h of hits) {
        if (h.object.userData?.ui) continue;
        const itemId = findItemId(h.object);
        if (itemId) {
          const it = curV.items.find((x) => x.id === itemId);
          const prod = it ? getProduct(it.productId, curP) : null;
          if (it && prod) {
            const P = resolveParams(prod, it);
            const fx = Math.sin(deg2rad(it.rot));
            const fz = Math.cos(deg2rad(it.rot));
            if (prod.category === 'bed' || prod.ergo === 'bed') {
              const top = Number(P.frameH ?? 30) + Number(P.mattressT ?? 25);
              const d = (it.dims ?? prod.dims).d;
              st.current.x = it.x - fx * (d / 2 - 30);
              st.current.z = it.z - fz * (d / 2 - 30);
              st.current.yaw = Math.atan2(-fx, -fz);
              st.current.sit = false;
              setScene({ walkPose: 'lie', walkSurface: top, walkTarget: null });
              useStore.getState().notify(`${it.label || prod.name}에 누운 시점이에요`);
              return;
            }
            if (prod.category === 'sofa' || prod.category === 'chair' || prod.ergo === 'sofa' || prod.ergo === 'chair' || prod.ergo === 'officeChair') {
              const seat = Number(P.seatH ?? prod.seatH ?? 43);
              st.current.x = it.x + fx * 10;
              st.current.z = it.z + fz * 10;
              st.current.yaw = Math.atan2(-fx, -fz);
              st.current.sit = false;
              setScene({ walkPose: 'sit', walkSurface: seat, walkTarget: null });
              useStore.getState().notify(`${it.label || prod.name}에 앉은 시점이에요`);
              return;
            }
          }
          break;
        }
        if (h.object.userData?.floor) {
          const tx = h.point.x / S;
          const tz = h.point.z / S;
          st.current.sit = false;
          st.current.stuckTime = 0;
          setScene({ walkPose: 'stand', walkTarget: { x: tx, z: tz, t: Date.now() } });
          return;
        }
      }
      // Fallback: intersect floor plane y=0 if inside any room
      const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const pt = new THREE.Vector3();
      if (ray.ray.intersectPlane(pl, pt)) {
        const tx = pt.x / S;
        const tz = pt.z / S;
        if (curP.plan.rooms.some((rm) => pointInPoly([tx, tz], rm.points))) {
          st.current.sit = false;
          st.current.stuckTime = 0;
          setScene({ walkPose: 'stand', walkTarget: { x: tx, z: tz, t: Date.now() } });
        }
      }
    };
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
  }, [gl, scene]);

  const obstacles = useMemo(() => {
    const res = resolveItems(project, version).filter((r) => r.y0 < 60 && r.y1 > 10 && r.prod.model !== 'rug' && r.prod.model !== 'curtain');
    const walls = project.plan.walls;
    return { res, walls };
  }, [project, version]);

  useFrame((_, dt) => {
    const cam = camRef.current;
    if (!cam || !st.current.inited) return;
    const stepDt = Math.min(dt, 0.05);
    const k = keys.current;
    const speed = (k.ShiftLeft || k.ShiftRight ? 220 : 120) * stepDt;
    let fx = 0;
    let fz = 0;
    const s = st.current;
    if (k.KeyW || k.ArrowUp) fz -= 1;
    if (k.KeyS || k.ArrowDown) fz += 1;
    if (k.KeyA) fx -= 1;
    if (k.KeyD) fx += 1;
    if (k.ArrowLeft) s.yaw += 1.6 * stepDt;
    if (k.ArrowRight) s.yaw -= 1.6 * stepDt;

    const r = a.shoulderW / 2;
    const tryMove = (nx: number, nz: number) => {
      for (const w of obstacles.walls) {
        const ex = w.b[0] - w.a[0];
        const ez = w.b[1] - w.a[1];
        const L2 = ex * ex + ez * ez || 1;
        let t = ((nx - w.a[0]) * ex + (nz - w.a[1]) * ez) / L2;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(nx - (w.a[0] + ex * t), nz - (w.a[1] + ez * t));
        if (d < w.thickness / 2 + r * 0.55) {
          const pos = t * Math.sqrt(L2);
          const inDoor = project.plan.openings.some((o) => o.wallId === w.id && o.sill < 10 && Math.abs(pos - o.pos) < o.width / 2 - 4);
          if (!inDoor) return false;
        }
      }
      // Body clearance around furniture (10cm buffer so camera doesn't clip halfway into sofas)
      const fr = 10;
      for (const o of obstacles.res) {
        if (
          pointInPoly([nx, nz], o.poly) ||
          pointInPoly([nx + fr, nz], o.poly) ||
          pointInPoly([nx - fr, nz], o.poly) ||
          pointInPoly([nx, nz + fr], o.poly) ||
          pointInPoly([nx, nz - fr], o.poly)
        ) {
          return false;
        }
      }
      return true;
    };

    const applyDelta = (dx: number, dz: number) => {
      if (tryMove(s.x + dx, s.z + dz)) {
        s.x += dx;
        s.z += dz;
        return true;
      }
      if (tryMove(s.x + dx, s.z)) {
        s.x += dx;
        return true;
      }
      if (tryMove(s.x, s.z + dz)) {
        s.z += dz;
        return true;
      }
      return false;
    };

    if (fx || fz) {
      const sin = Math.sin(s.yaw);
      const cos = Math.cos(s.yaw);
      const dx = (fx * cos + fz * sin) * speed;
      const dz = (-fx * sin + fz * cos) * speed;
      applyDelta(dx, dz);
    } else {
      const wt = useScene.getState().walkTarget;
      if (wt) {
        const vx = wt.x - s.x;
        const vz = wt.z - s.z;
        const distLeft = Math.hypot(vx, vz);
        if (distLeft < 8) {
          setScene({ walkTarget: null });
          s.stuckTime = 0;
        } else {
          const step = Math.min(distLeft, 175 * stepDt);
          const moved = applyDelta((vx / distLeft) * step, (vz / distLeft) * step);
          if (!moved) {
            s.stuckTime += stepDt;
            if (s.stuckTime > 0.25) {
              setScene({ walkTarget: null });
              s.stuckTime = 0;
            }
          } else {
            s.stuckTime = 0;
          }
        }
      }
    }

    const wp = useScene.getState().walkPose;
    const eye = wp === 'lie' ? useScene.getState().walkSurface + 22 : wp === 'sit' || s.sit ? useScene.getState().walkSurface + a.sitEyeH : a.eyeH;
    cam.position.set(s.x * S, eye * S, s.z * S);
    cam.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
    const prev = useScene.getState();
    if (prev.walkEye !== eye) setScene({ walkEye: eye });
    if (!prev.walkPos || Math.abs(prev.walkPos.x - s.x) + Math.abs(prev.walkPos.z - s.z) > 5 || Math.abs(prev.walkPos.yaw - s.yaw) > 0.05) {
      setScene({ walkPos: { x: s.x, z: s.z, yaw: s.yaw } });
    }
  });
  return <PerspectiveCamera ref={camRef} makeDefault fov={70} near={0.05} far={100} />;
}

function WalkTargetMarker() {
  const wt = useScene((s) => s.walkTarget);
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.theme);
  if (view !== 'walk' || !wt) return null;
  const color = theme === 'dark' ? '#4d8dff' : '#1d57c4';
  return (
    <group position={[wt.x, 1.2, wt.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} userData={{ ui: true }} raycast={() => null}>
        <ringGeometry args={[10, 14, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} userData={{ ui: true }} raycast={() => null}>
        <circleGeometry args={[5, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ interaction
interface DragState {
  kind: 'move' | 'rotate';
  ids: string[];
  start: Map<string, { x: number; z: number; y: number; rot: number }>;
  startScreen: [number, number];
  anchor: Vec2;
  offset: Vec2;
  primary: string;
  mount: 'floor' | 'wall' | 'ceiling' | 'surface';
  person: boolean;
  moved: boolean;
  startAngle: number;
}

interface PendingClick {
  ids: string[];
  sx: number;
  sy: number;
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

function Interaction({ project }: { project: Project; version: Version }) {
  const { gl } = useThree();
  const controls = useThree((st) => st.controls) as unknown as { enabled: boolean } | null;
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const { setRay, planeHit, objectsHit } = useRaycastHelpers();
  const drag = useRef<DragState | null>(null);
  const pendingClick = useRef<PendingClick | null>(null);
  const setScene = useScene((s) => s.set);

  const wallPlace = (dims: { w: number; d: number; h: number }) => {
    const hit = objectsHit((o) => !!o.userData?.wallId && o.visible);
    if (!hit || !hit.face) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    n.y = 0;
    if (n.lengthSq() < 0.001) return null;
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
    let rafId = 0;
    let latestEvent: PointerEvent | null = null;

    const processMove = (e: PointerEvent) => {
      const s = useStore.getState();
      if (s.view === 'walk') return;
      setRay(e);

      // placing ghost
      if (s.placing || s.placingPerson) {
        el.style.cursor = 'crosshair';
        const prod = s.placing ? getProduct(s.placing.productId, s.project) : null;
        if (prod && s.project) {
          const dims = s.placing!.dims ?? prod.dims;
          const mount = defaultMount(prod);
          if (mount === 'wall') {
            const w = wallPlace(dims);
            if (w) return setScene({ ghost: { ...w, valid: true }, guides: [] });
          }
          if (mount === 'surface') {
            const sp = surfacePlace([]);
            if (sp) return setScene({ ghost: { x: sp.x, z: sp.z, y: sp.y, rot: useScene.getState().ghost?.rot ?? 0, valid: true }, guides: [] });
          }
          const p = planeHit(0);
          if (p) {
            const prevRot = useScene.getState().ghost?.rot ?? 0;
            const manual = useScene.getState().ghostManualRot;
            const others = activeVersion(s.project)!.items.filter((i) => !i.hidden);
            const sn = e.altKey
              ? { x: p[0], z: p[1], rot: prevRot, guides: [] }
              : snapFloorItem(s.project, dims, p[0], p[1], prevRot, others, s.snap, { autoOrient: manual ? 'none' : 'faceRoom' });
            setScene({ ghost: { x: sn.x, z: sn.z, y: defaultElev(prod, s.project.plan.ceiling), rot: sn.rot, valid: true }, guides: sn.guides });
          }
        } else {
          const p = planeHit(0);
          if (p) setScene({ ghost: { x: p[0], z: p[1], y: 0, rot: 0, valid: true } });
        }
        return;
      }

      if (s.measure) {
        el.style.cursor = 'crosshair';
        const hit = objectsHit((o) => o.type === 'Mesh' && !o.userData?.ui);
        if (hit) setScene({ measureHover: [hit.point.x / S, hit.point.y / S, hit.point.z / S] });
        return;
      }

      const d = drag.current;
      if (!d) return;

      // 4px deadzone before committing an Undo checkpoint or moving the object
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.startScreen[0], e.clientY - d.startScreen[1]) < 4) return;
        d.moved = true;
        s.checkpoint();
        setScene({ dragging: true });
        el.style.cursor = 'grabbing';
      }

      const v = activeVersion(s.project)!;
      if (d.kind === 'rotate') {
        const it0 = d.start.get(d.primary)!;
        const p = planeHit(it0.y);
        if (!p) return;
        const ang = rad2deg(Math.atan2(p[0] - it0.x, p[1] - it0.z));
        let rot = it0.rot + (ang - d.startAngle);
        if (!e.shiftKey && s.snap.angle > 0) rot = snapTo(rot, s.snap.angle);
        const norm = normDeg(rot);
        s.updateItems([d.primary], (it) => (it.rot = norm), false);
        setScene({ rotating: { id: d.primary, rot: norm, x: it0.x, y: it0.y, z: it0.z } });
        return;
      }

      // move
      const it0 = d.start.get(d.primary)!;
      if (!d.person) {
        const item = v.items.find((i) => i.id === d.primary);
        const prod = item ? getProduct(item.productId, s.project) : null;
        if (!item || !prod || !s.project) return;
        const dims = effectiveItemDims(item, prod);

        if (d.mount === 'wall' && d.ids.length === 1) {
          const w = wallPlace(dims);
          if (w) {
            s.updateItems(
              [d.primary],
              (it) => {
                it.x = w.x;
                it.z = w.z;
                it.y = w.y;
                it.rot = w.rot;
              },
              false,
            );
            return;
          }
        }
        if (d.mount === 'surface' && d.ids.length === 1) {
          const sp = surfacePlace(d.ids);
          const p =
            sp ??
            (() => {
              const q = planeHit(0);
              return q ? { x: q[0], z: q[1], y: 0 } : null;
            })();
          if (p) {
            s.updateItems(
              [d.primary],
              (it) => {
                it.x = snapTo(p.x, s.snap.grid || 0);
                it.z = snapTo(p.z, s.snap.grid || 0);
                it.y = p.y;
              },
              false,
            );
          }
          return;
        }

        // Raycast at the item's actual height so lifted/ceiling items have zero parallax jump
        const planeY = d.mount === 'ceiling' || it0.y > 1 ? it0.y : 0;
        const p = planeHit(planeY);
        if (!p) return;
        let nx = p[0] + d.offset[0];
        let nz = p[1] + d.offset[1];
        let nextRot = item.rot;
        let guides: ReturnType<typeof snapFloorItem>['guides'] = [];

        if (d.ids.length === 1 && !e.altKey) {
          const others = v.items.filter((i) => i.id !== d.primary && !i.hidden);
          const sn = snapFloorItem(s.project, dims, nx, nz, it0.rot, others, s.snap, { autoOrient: 'nearest90' });
          nx = sn.x;
          nz = sn.z;
          nextRot = sn.rot;
          guides = sn.guides;
        } else if (s.snap.grid > 0 && !e.altKey) {
          nx = snapTo(nx, s.snap.grid);
          nz = snapTo(nz, s.snap.grid);
        }

        const dx = nx - it0.x;
        const dz = nz - it0.z;
        setScene({ guides });
        s.updateItems(
          d.ids,
          (it) => {
            const st0 = d.start.get(it.id);
            if (!st0) return;
            it.x = st0.x + dx;
            it.z = st0.z + dz;
            if (d.ids.length === 1 && it.id === d.primary) it.rot = nextRot;
          },
          false,
        );
      } else {
        const p = planeHit(0);
        if (!p) return;
        const nx = snapTo(p[0] + d.offset[0], s.snap.grid || 0);
        const nz = snapTo(p[1] + d.offset[1], s.snap.grid || 0);
        s.updateItems(
          [d.primary],
          (h) => {
            h.x = nx;
            h.z = nz;
          },
          false,
        );
      }
    };

    const onMove = (e: PointerEvent) => {
      latestEvent = e;
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          if (latestEvent) {
            const ev = latestEvent;
            latestEvent = null;
            processMove(ev);
          }
        });
      }
    };

    const onUp = (e: PointerEvent) => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
        latestEvent = null;
      }
      // 2-step click-to-select for unselected items (allows orbiting when dragged instead of clicked)
      const pc = pendingClick.current;
      if (pc) {
        pendingClick.current = null;
        if (Math.hypot(e.clientX - pc.sx, e.clientY - pc.sy) < 5) {
          useStore.getState().select(pc.ids);
        }
      }

      const d = drag.current;
      if (d) {
        drag.current = null;
        if (controlsRef.current) controlsRef.current.enabled = true;
        setScene({ dragging: false, guides: [], rotating: null });
        el.style.cursor = '';
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
                s.updateItems(
                  [h.id],
                  (pp) => {
                    pp.y = seat;
                    pp.rot = r.it.rot;
                    if (h.pose === 'lie') {
                      pp.x = r.it.x;
                      pp.z = r.it.z;
                    }
                  },
                  false,
                );
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
      if (rafId) cancelAnimationFrame(rafId);
      el.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl, project]);

  // start drag / click selection (called by items)
  useEffect(() => {
    interactionApi.queueSelect = (ids, sx, sy) => {
      pendingClick.current = { ids, sx, sy };
    };
    interactionApi.startMove = (e, id, isPerson) => {
      const s = useStore.getState();
      if (s.view === 'walk') return;
      const v = activeVersion(s.project)!;
      const native = e.nativeEvent as PointerEvent;
      setRay(native);
      let ids = s.selection.includes(id) ? s.selection : [id];
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
      const mount = item && prod && s.project ? effectiveMount(item, prod, s.project.plan.ceiling) : 'floor';
      const planeY = mount === 'ceiling' || prim.y > 1 ? prim.y : 0;
      const hp = planeHit(planeY) ?? [prim.x, prim.z];
      drag.current = {
        kind: 'move',
        ids: movable,
        start,
        startScreen: [native.clientX, native.clientY],
        anchor: hp,
        offset: [prim.x - hp[0], prim.z - hp[1]],
        primary: id,
        mount,
        person: isPerson,
        moved: false,
        startAngle: 0,
      };
      if (controlsRef.current) controlsRef.current.enabled = false;
    };
    interactionApi.startRotate = (e, id) => {
      const s = useStore.getState();
      if (s.view === 'walk') return;
      const v = activeVersion(s.project)!;
      const it = v.items.find((i) => i.id === id) ?? (v.people.find((h) => h.id === id) as unknown as PlacedItem);
      if (!it || it.locked) return;
      const native = e.nativeEvent as PointerEvent;
      setRay(native);
      const p = planeHit(it.y) ?? [it.x, it.z + 1];
      drag.current = {
        kind: 'rotate',
        ids: [id],
        start: new Map([[id, { x: it.x, z: it.z, y: it.y, rot: it.rot }]]),
        startScreen: [native.clientX, native.clientY],
        anchor: p,
        offset: [0, 0],
        primary: id,
        mount: 'floor',
        person: false,
        moved: false,
        startAngle: rad2deg(Math.atan2(p[0] - it.x, p[1] - it.z)),
      };
      if (controlsRef.current) controlsRef.current.enabled = false;
    };
  }, [project]);

  // click on empty space / placing
  const onBgDown = (e: ThreeEvent<PointerEvent>) => {
    const s = useStore.getState();
    if (e.button !== 0 || s.view === 'walk') return;
    if (s.placing) {
      e.stopPropagation();
      const g = useScene.getState().ghost;
      if (!g) return;
      s.addItem(s.placing.productId, g.x, g.z, { rot: g.rot, y: g.y, dims: s.placing.dims, params: s.placing.params });
      if (!(e.nativeEvent as PointerEvent).shiftKey) {
        s.cancelPlacing();
      }
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

  interactionApi.bgDown = onBgDown;
  return null;
}

export const interactionApi: {
  queueSelect: (ids: string[], sx: number, sy: number) => void;
  startMove: (e: ThreeEvent<PointerEvent>, id: string, isPerson: boolean) => void;
  startRotate: (e: ThreeEvent<PointerEvent>, id: string) => void;
  bgDown: (e: ThreeEvent<PointerEvent>) => void;
} = { queueSelect: () => {}, startMove: () => {}, startRotate: () => {}, bgDown: () => {} };

// ------------------------------------------------------------------ items & people
const ItemNode = memo(function ItemNode({
  it,
  prod,
  imageRef,
  sel,
  bad,
  warn,
  walk,
  busy,
  allItems,
}: {
  it: PlacedItem;
  prod: Product;
  imageRef?: RefItem;
  sel: boolean;
  bad: boolean;
  warn: boolean;
  walk: boolean;
  busy: boolean;
  allItems: PlacedItem[];
}) {
  const { gl } = useThree();
  const dims = effectiveItemDims(it, prod);
  return (
    <group
      position={[it.x, it.y, it.z]}
      rotation={[0, deg2rad(it.rot), 0]}
      userData={{ itemId: it.id }}
      onPointerOver={(e) => {
        if (walk || busy || useScene.getState().dragging) return;
        e.stopPropagation();
        gl.domElement.style.cursor = sel && !it.locked ? 'grab' : 'pointer';
      }}
      onPointerOut={() => {
        if (!useScene.getState().dragging && !busy) gl.domElement.style.cursor = '';
      }}
      onPointerDown={(e) => {
        if (walk || busy || e.button !== 0) return;
        e.stopPropagation();
        const s = useStore.getState();
        const native = e.nativeEvent as PointerEvent;
        const groupIds = it.groupId && !native.shiftKey ? allItems.filter((i) => i.groupId === it.groupId).map((i) => i.id) : [it.id];
        if (native.shiftKey) {
          s.select([it.id], true);
          return;
        }
        // 2-step interaction: unselected items select on click & let drags orbit camera; already-selected items drag immediately (4px deadzone)
        if (s.selection.includes(it.id)) {
          if (!it.locked) interactionApi.startMove(e, it.id, false);
        } else {
          interactionApi.queueSelect(groupIds, native.clientX, native.clientY);
        }
      }}
    >
      <group scale={[it.mirror ? -1 : 1, 1, 1]}>
        <ItemModel item={it} prod={prod} imageRef={imageRef} />
      </group>
      {sel && !walk && <OutlineBox w={dims.w} d={dims.d} h={dims.h} color={it.locked ? '#8a847c' : '#2f6fed'} />}
      {sel && !walk && <Footprint w={dims.w} d={dims.d} color="#2f6fed" y={-it.y + 0.8} />}
      {!sel && bad ? <OutlineBox w={dims.w} d={dims.d} h={dims.h} color="#e5484d" pad={0.5} /> : null}
      {!sel && warn ? <OutlineBox w={dims.w} d={dims.d} h={dims.h} color="#f08c00" pad={0.5} /> : null}
      {bad ? <Footprint w={dims.w} d={dims.d} color="#e5484d" opacity={0.28} y={-it.y + 0.9} /> : null}
    </group>
  );
});

function Items({ project, version, issues }: { project: Project; version: Version; issues: Map<string, { level: string; msg: string }[]> }) {
  const selection = useStore((s) => s.selection);
  const showCollisions = useStore((s) => s.show.collisions);
  const busy = useStore((s) => !!(s.placing || s.placingPerson || s.measure));
  const walk = useStore((s) => s.view === 'walk');
  const refs = project.moodboard;
  return (
    <>
      {version.items.map((it) => {
        if (it.hidden) return null;
        const prod = getProduct(it.productId, project);
        if (!prod) return null;
        const sel = selection.includes(it.id);
        const iss = issues.get(it.id);
        const bad = !!(showCollisions && !walk && iss?.some((x) => x.level === 'bad'));
        const warn = !!(showCollisions && !walk && !bad && iss?.length);
        return (
          <ItemNode
            key={it.id}
            it={it}
            prod={prod}
            imageRef={it.imageRef ? refs.find((r) => r.id === it.imageRef) : undefined}
            sel={sel}
            bad={bad}
            warn={warn}
            walk={walk}
            busy={busy}
            allItems={version.items}
          />
        );
      })}
    </>
  );
}

function People({ project, version }: { project: Project; version: Version }) {
  const selection = useStore((s) => s.selection);
  const busy = useStore((s) => !!(s.placing || s.placingPerson || s.measure));
  const walk = useStore((s) => s.view === 'walk');
  return (
    <>
      {version.people.map((h) => (
        <PersonNode key={h.id} h={h} project={project} selected={selection.includes(h.id)} busy={busy} walk={walk} />
      ))}
    </>
  );
}

function PersonNode({ h, project, selected, busy, walk }: { h: PlacedPerson; project: Project; selected: boolean; busy: boolean; walk: boolean }) {
  const prof = project.profiles.find((p) => p.id === h.profileId) ?? project.profiles[0];
  const height = prof?.height ?? 170;
  const obj = useMemo(() => buildPerson(height, h.pose, prof?.color ?? '#e8a17a', h.pose === 'sit' ? h.y || 45 : h.pose === 'lie' ? h.y || 40 : 45), [height, h.pose, prof?.color, h.y]);
  const yOff = h.pose === 'sit' || h.pose === 'lie' ? 0 : h.y;
  return (
    <group
      position={[h.x, yOff, h.z]}
      rotation={[0, deg2rad(h.rot), 0]}
      onPointerDown={(e) => {
        if (walk || busy || e.button !== 0) return;
        e.stopPropagation();
        const s = useStore.getState();
        const native = e.nativeEvent as PointerEvent;
        if (native.shiftKey) {
          s.select([h.id], true);
          return;
        }
        if (s.selection.includes(h.id)) {
          interactionApi.startMove(e, h.id, true);
        } else {
          interactionApi.queueSelect([h.id], native.clientX, native.clientY);
        }
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
  const { gl } = useThree();
  const selection = useStore((s) => s.selection);
  const show = useStore((s) => s.show);
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.theme);
  const rotating = useScene((s) => s.rotating);
  const id = selection.length === 1 && view !== 'walk' ? selection[0] : null;
  const it = id ? version.items.find((i) => i.id === id) : null;
  const prod = it ? getProduct(it.productId, project) : null;
  const gaps = useMemo(() => (it && show.dims ? sideGaps(project, version, it.id) : []), [it, project, version, show.dims]);
  if (!it || !prod) return null;
  const accent = theme === 'dark' ? '#4d8dff' : '#1d57c4';
  const warnColor = theme === 'dark' ? '#e8a838' : '#b45309';
  const dims = effectiveItemDims(it, prod);
  const r = Math.min(130, Math.max(36, Math.max(dims.w, dims.d) / 2 + 18));
  const y = it.y + 1;
  const dimLabelY = it.y + dims.h + 6;
  const fw = localToWorld(it.x, it.z, it.rot, 0, dims.d / 2 + 14);
  const sw = localToWorld(it.x, it.z, it.rot, dims.w / 2 + 14, 0);
  const handleX = Math.sin(deg2rad(it.rot)) * r;
  const handleZ = Math.cos(deg2rad(it.rot)) * r;
  return (
    <group>
      {/* rotation handle */}
      {!it.locked && view !== 'walk' && (
        <group position={[it.x, y, it.z]}>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            userData={{ ui: true }}
            onPointerOver={(e) => {
              e.stopPropagation();
              gl.domElement.style.cursor = 'grab';
            }}
            onPointerOut={() => {
              if (!useScene.getState().dragging) gl.domElement.style.cursor = '';
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              interactionApi.startRotate(e, it.id);
            }}
          >
            <ringGeometry args={[r - 5, r + 5, 64]} />
            <meshBasicMaterial color={accent} transparent opacity={0.0} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[r - 0.8, r + 0.8, 64]} />
            <meshBasicMaterial color={accent} transparent opacity={0.62} depthWrite={false} />
          </mesh>
          <mesh
            position={[handleX, 0, handleZ]}
            userData={{ ui: true }}
            onPointerOver={(e) => {
              e.stopPropagation();
              gl.domElement.style.cursor = 'grab';
            }}
            onPointerOut={() => {
              if (!useScene.getState().dragging) gl.domElement.style.cursor = '';
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              interactionApi.startRotate(e, it.id);
            }}
          >
            <sphereGeometry args={[6, 16, 12]} />
            <meshBasicMaterial color={accent} />
          </mesh>
          {rotating?.id === it.id && (
            <Html position={[handleX, 16, handleZ]} center style={{ pointerEvents: 'none' }} zIndexRange={[30, 0]}>
              <div className="tag3d measure mono">{Math.round(rotating.rot)}°</div>
            </Html>
          )}
        </group>
      )}
      {show.dims && !rotating && (
        <>
          <Html position={[fw[0], dimLabelY - dims.h + 2, fw[1]]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
            <div className="tag3d dim">W {Math.round(dims.w)}</div>
          </Html>
          <Html position={[sw[0], dimLabelY - dims.h + 2, sw[1]]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
            <div className="tag3d dim">D {Math.round(dims.d)}</div>
          </Html>
          <Html position={[it.x, dimLabelY, it.z]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
            <div className="tag3d dim">
              H {Math.round(dims.h)}
              {it.y > 0.5 ? ` · 바닥+${Math.round(it.y)}` : ''}
            </div>
          </Html>
          {gaps.map((g) => {
            const color = g.dist < 60 && g.dist >= 2 ? warnColor : accent;
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
  const theme = useStore((s) => s.theme);
  const wallColor = theme === 'dark' ? '#4d8dff' : '#1d57c4';
  return (
    <>
      {guides.map((g, i) => (
        <Line
          key={i}
          points={[
            [g.a[0], 2, g.a[1]],
            [g.b[0], 2, g.b[1]],
          ]}
          color={g.kind === 'wall' ? wallColor : '#e5484d'}
          lineWidth={g.kind === 'wall' ? 2 : 1}
          dashed={g.kind !== 'wall'}
          dashSize={5}
          gapSize={3}
          depthTest={false}
        />
      ))}
    </>
  );
}

function GhostLayer({ project }: { project: Project }) {
  const placing = useStore((s) => s.placing);
  const placingPerson = useStore((s) => s.placingPerson);
  const theme = useStore((s) => s.theme);
  const ghost = useScene((s) => s.ghost);
  const prod = placing ? getProduct(placing.productId, project) : null;
  const tmp = useMemo(() => (prod ? ({ id: '_g', productId: prod.id, x: 0, z: 0, y: 0, rot: 0, dims: placing?.dims, params: placing?.params } as PlacedItem) : undefined), [prod, placing]);
  const profile = project.profiles.find((p) => p.id === project.activeProfileId) ?? project.profiles[0];
  const accent = theme === 'dark' ? '#4d8dff' : '#1d57c4';
  const personObj = useMemo(() => (placingPerson ? buildPerson(profile?.height ?? 170, placingPerson, accent, 45) : null), [placingPerson, profile?.height, accent]);
  if (!ghost) return null;
  if (personObj) return <primitive object={personObj} position={[ghost.x, 0, ghost.z]} />;
  if (!prod || !tmp) return null;
  return (
    <group position={[ghost.x, ghost.y, ghost.z]} rotation={[0, deg2rad(ghost.rot), 0]}>
      <ItemModel item={tmp} prod={prod} ghost />
      <Footprint w={(placing?.dims ?? prod.dims).w} d={(placing?.dims ?? prod.dims).d} color={accent} opacity={0.25} y={-ghost.y + 0.8} />
    </group>
  );
}

function Measures() {
  const { measures, measureStart, measureHover } = useScene();
  const theme = useStore((s) => s.theme);
  const accent = theme === 'dark' ? '#4d8dff' : '#1d57c4';
  const all = [...measures];
  if (measureStart && measureHover) all.push({ a: measureStart, b: measureHover });
  return (
    <>
      {all.map((m, i) => {
        const d = Math.hypot(m.a[0] - m.b[0], m.a[1] - m.b[1], m.a[2] - m.b[2]);
        return (
          <group key={i}>
            <Line points={[m.a, m.b]} color={accent} lineWidth={2} depthTest={false} />
            <Html position={[(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2 + 4, (m.a[2] + m.b[2]) / 2]} center style={{ pointerEvents: 'none' }}>
              <div className="tag3d measure">{Math.round(d)}cm</div>
            </Html>
          </group>
        );
      })}
      {measureStart && (
        <mesh position={measureStart}>
          <sphereGeometry args={[2.5, 12, 8]} />
          <meshBasicMaterial color={accent} />
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

interface CamAnim {
  t0: number;
  dur: number;
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  tgt0: THREE.Vector3;
  tgt1: THREE.Vector3;
}

function CameraRig({ project, version }: { project: Project; version: Version }) {
  const req = useScene((s) => s.camReq);
  const { camera, invalidate } = useThree();
  const controls = useThree((st) => st.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
    addEventListener?: (e: string, cb: () => void) => void;
    removeEventListener?: (e: string, cb: () => void) => void;
  } | null;
  const animRef = useRef<CamAnim | null>(null);

  // Cancel smooth camera flight immediately if user starts orbiting/panning manually
  useEffect(() => {
    if (!controls?.addEventListener) return;
    const cancel = () => {
      animRef.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener?.('start', cancel);
  }, [controls]);

  useEffect(() => {
    if (!req || !controls) return;

    // Support zoom buttons in Top (OrthographicCamera) view too
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      if (req.preset === 'zoom') {
        const ortho = camera as THREE.OrthographicCamera;
        ortho.zoom = Math.max(15, Math.min(400, ortho.zoom / (req.f ?? 1)));
        ortho.updateProjectionMatrix();
        invalidate();
      }
      return;
    }

    if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
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
      const deskOf = (builtin: boolean) =>
        version.items.find((i) => {
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
      off.setLength(Math.max(0.8, Math.min(40, off.length())));
      pos = controls.target.clone().add(off);
      tgt = controls.target.clone();
    }

    if (pos || tgt) {
      animRef.current = {
        t0: performance.now(),
        dur: req.preset === 'zoom' ? 160 : 280,
        p0: camera.position.clone(),
        p1: pos ?? camera.position.clone(),
        tgt0: controls.target.clone(),
        tgt1: tgt ?? controls.target.clone(),
      };
      invalidate();
    }
  }, [req]);

  useFrame(() => {
    const a = animRef.current;
    if (!a || !controls) return;
    const raw = Math.min(1, (performance.now() - a.t0) / a.dur);
    const u = 1 - Math.pow(1 - raw, 3); // cubic ease-out
    camera.position.lerpVectors(a.p0, a.p1, u);
    controls.target.lerpVectors(a.tgt0, a.tgt1, u);
    controls.update();
    if (raw < 1) {
      invalidate();
    } else {
      animRef.current = null;
      const prev = useScene.getState().camSaved;
      useScene.getState().set({
        camSaved: {
          ...prev,
          [project.id]: {
            pos: [camera.position.x, camera.position.y, camera.position.z],
            target: [controls.target.x, controls.target.y, controls.target.z],
          },
        },
      });
    }
  });

  return null;
}

function FloorGrid({ project }: { project: Project }) {
  const on = useStore((s) => s.show.grid);
  const theme = useStore((s) => s.theme);
  if (!on) return null;
  const b = planBounds(project);
  const size = Math.ceil(Math.max(b.maxX - b.minX, b.maxY - b.minY) / 50) * 50 + 100;
  const { gridMajor, gridMinor } = stagePalette(theme, 12);
  return <gridHelper key={theme} args={[size, size / 50, gridMajor, gridMinor]} position={[(b.minX + b.maxX) / 2, 0.5, (b.minY + b.maxY) / 2]} />;
}

/** On-demand thumbnail capture (called on version switch/save/compare or tab hide — zero 2.5s editing stutter). */
function ThumbRegistrar({ version }: { version: Version }) {
  const { gl, scene, camera } = useThree();
  const vidRef = useRef(version.id);
  vidRef.current = version.id;

  useEffect(() => {
    const capture = () => {
      const st = useStore.getState();
      if (st.view !== '3d' || useScene.getState().dragging) return;
      try {
        gl.render(scene, camera);
        const src = gl.domElement;
        if (!src.width || !src.height) return;
        const c = document.createElement('canvas');
        c.width = 360;
        c.height = Math.round((360 * src.height) / Math.max(1, src.width));
        c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
        const thumb = c.toDataURL('image/jpeg', 0.7);
        const vid = vidRef.current;
        const curV = st.project?.versions.find((x) => x.id === vid);
        if (!curV || curV.thumb === thumb) return;
        st.mutate(
          (p) => {
            const v = p.versions.find((x) => x.id === vid);
            if (v) v.thumb = thumb;
          },
          false,
          true,
        );
      } catch {
        /* ignore WebGL context loss */
      }
    };

    useScene.getState().set({ captureThumb: capture });
    const onVis = () => {
      if (document.visibilityState === 'hidden') capture();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (useScene.getState().captureThumb === capture) useScene.getState().set({ captureThumb: null });
    };
  }, [gl, scene, camera]);

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
  const theme = useStore((s) => s.theme);
  const version = activeVersion(project);
  const issues = useMemo(() => (project && version ? computeIssues(project, version) : new Map()), [project?.plan, version, project?.customProducts]);
  if (!project || !version) return null;
  const { bg } = stagePalette(theme, version.finishes.hour);
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
          if (e.button === 0 && !moved && s.view !== 'walk' && !s.placing && !s.placingPerson && !s.measure && !useScene.getState().dragging) s.select([]);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <color attach="background" args={[bg]} />
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
            <WalkTargetMarker />
            <Labels project={project} version={version} />
            <PlaneCatcher />
            <FloorGrid project={project} />
          </group>
          <ShotTaker version={version} />
          <ThumbRegistrar version={version} />
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
