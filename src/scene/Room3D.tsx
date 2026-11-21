import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { doorSwingPoly } from '../lib/analysis';
import { bboxOf, dist, norm, sub } from '../lib/geometry';
import { floorTexture } from '../lib/textures';
import type { Finishes, FloorPlan, Opening, Wall } from '../types';

interface Props {
  plan: FloorPlan;
  finishes: Finishes;
  wallMode: 'auto' | 'full' | 'low' | 'hidden';
  view: string;
  showCeiling: boolean;
}

const floorMatCache = new Map<string, THREE.MeshStandardMaterial>();
function floorMat(kind: string, color: string) {
  const key = kind + color;
  if (floorMatCache.has(key)) return floorMatCache.get(key)!;
  const { tex, size } = floorTexture(kind);
  tex.repeat.set(1 / size, 1 / size);
  const m = new THREE.MeshStandardMaterial({
    map: tex,
    color,
    roughness: kind === 'decotile' ? 0.42 : kind === 'tile' || kind === 'bigtile' ? 0.35 : kind === 'carpet' ? 1 : 0.55,
    metalness: 0,
  });
  // a dark, lightly polished floor: a soft sheen, not a mirror of the bright room around it
  if (kind === 'decotile') m.envMapIntensity = 0.35;
  floorMatCache.set(key, m);
  return m;
}

function extendAmount(w: Wall, end: 'a' | 'b', walls: Wall[]) {
  const p = w[end];
  let ext = 0;
  for (const o of walls) {
    if (o.id === w.id) continue;
    if (dist(o.a, p) < 2 || dist(o.b, p) < 2) ext = Math.max(ext, o.thickness / 2);
  }
  return ext;
}

interface Seg {
  s0: number;
  s1: number;
  y0: number;
  y1: number;
}

function wallSegments(w: Wall, openings: Opening[], H: number): Seg[] {
  const L = dist(w.a, w.b);
  const ops = openings
    .filter((o) => o.wallId === w.id)
    .map((o) => ({ s0: Math.max(0, o.pos - o.width / 2), s1: Math.min(L, o.pos + o.width / 2), y0: o.sill, y1: Math.min(H, o.sill + o.height) }))
    .sort((a, b) => a.s0 - b.s0);
  const segs: Seg[] = [];
  let s = 0;
  for (const o of ops) {
    if (o.s0 > s) segs.push({ s0: s, s1: o.s0, y0: 0, y1: H });
    if (o.y0 > 0) segs.push({ s0: o.s0, s1: o.s1, y0: 0, y1: o.y0 });
    if (o.y1 < H) segs.push({ s0: o.s0, s1: o.s1, y0: o.y1, y1: H });
    s = Math.max(s, o.s1);
  }
  if (s < L) segs.push({ s0: s, s1: L, y0: 0, y1: H });
  return segs;
}

function WallMesh({ w, plan, color, mode, center, extent }: { w: Wall; plan: FloorPlan; color: string; mode: Props['wallMode'] | 'walk'; center: THREE.Vector2; extent: number }) {
  const ref = useRef<THREE.Group>(null);
  const H = w.height ?? plan.ceiling;
  const L = dist(w.a, w.b);
  const ang = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
  const dir = norm(sub(w.b, w.a));
  const ea = extendAmount(w, 'a', plan.walls);
  const eb = extendAmount(w, 'b', plan.walls);
  const segs = useMemo(() => wallSegments(w, plan.openings, H), [w, plan.openings, H]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.92 }), [color]);
  const capMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3632', roughness: 0.9 }), []);
  const lowH = 18;
  const { camera } = useThree();
  const mid = useMemo(() => new THREE.Vector2((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2), [w]);

  useFrame(() => {
    if (!ref.current) return;
    let h = 1;
    if (mode === 'low') h = 100 / H;
    else if (mode === 'hidden') h = lowH / H;
    else if (mode === 'auto') {
      const cam = new THREE.Vector2(camera.position.x * 100, camera.position.z * 100);
      const toCam = cam.clone().sub(center);
      const camDist = toCam.length();
      if (camDist > 1) {
        toCam.normalize();
        const s = mid.clone().sub(center).dot(toCam);
        const outside = camDist > extent * 0.9;
        h = outside && s > extent * 0.25 ? lowH / H : 1;
      }
    }
    ref.current.scale.y = h;
  });

  return (
    <group ref={ref}>
      {segs.map((s, i) => {
        const a0 = s.s0 === 0 ? -ea : s.s0;
        const a1 = s.s1 >= L - 0.01 ? L + eb : s.s1;
        const len = a1 - a0;
        const c = (a0 + a1) / 2;
        const x = w.a[0] + dir[0] * c;
        const z = w.a[1] + dir[1] * c;
        return (
          <mesh key={i} position={[x, (s.y0 + s.y1) / 2, z]} rotation={[0, -ang, 0]} castShadow receiveShadow material={mat} userData={{ wallId: w.id }}>
            <boxGeometry args={[len, s.y1 - s.y0, w.thickness]} />
          </mesh>
        );
      })}
      {/* dark top cap for a crisp section look */}
      {segs
        .filter((s) => s.y1 >= H - 0.01)
        .map((s, i) => {
          const a0 = s.s0 === 0 ? -ea : s.s0;
          const a1 = s.s1 >= L - 0.01 ? L + eb : s.s1;
          const c = (a0 + a1) / 2;
          return (
            <mesh key={'c' + i} position={[w.a[0] + dir[0] * c, H + 0.2, w.a[1] + dir[1] * c]} rotation={[0, -ang, 0]} material={capMat} raycast={() => null}>
              <boxGeometry args={[a1 - a0, 0.4, w.thickness + 0.2]} />
            </mesh>
          );
        })}
    </group>
  );
}

function OpeningMesh({ o, plan, open: isOpen }: { o: Opening; plan: FloorPlan; open: boolean }) {
  const w = plan.walls.find((x) => x.id === o.wallId);
  const parts = useMemo(() => {
    if (!w) return null;
    const dir = norm(sub(w.b, w.a));
    const ang = Math.atan2(dir[1], dir[0]);
    const cx = w.a[0] + dir[0] * o.pos;
    const cz = w.a[1] + dir[1] * o.pos;
    return { dir, ang, cx, cz, t: w.thickness };
  }, [w, o.pos]);
  const frameM = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.6 }), []);
  const leafM = useMemo(() => new THREE.MeshStandardMaterial({ color: o.isEntry ? '#6f6a63' : '#ece7df', roughness: 0.6 }), [o.isEntry]);
  const glassM = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#cfe3ee', transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false }), []);
  if (!w || !parts) return null;
  const { ang, cx, cz, t } = parts;
  const side = o.side ?? 1;
  if (o.type === 'window' || o.type === 'balcony') {
    const mullions = Math.max(1, Math.round(o.width / 100));
    return (
      <group position={[cx, o.sill, cz]} rotation={[0, -ang, 0]}>
        <mesh material={glassM} position={[0, o.height / 2, 0]} raycast={() => null}>
          <boxGeometry args={[o.width - 4, o.height - 4, 1]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} material={frameM} position={[(s * (o.width - 3)) / 2, o.height / 2, 0]}>
            <boxGeometry args={[3, o.height, t * 0.6]} />
          </mesh>
        ))}
        <mesh material={frameM} position={[0, o.height - 1.5, 0]}>
          <boxGeometry args={[o.width, 3, t * 0.6]} />
        </mesh>
        <mesh material={frameM} position={[0, 1.5, 0]}>
          <boxGeometry args={[o.width + 4, 3, t + 4]} />
        </mesh>
        {Array.from({ length: mullions - 1 }, (_, i) => (
          <mesh key={i} material={frameM} position={[-o.width / 2 + ((i + 1) * o.width) / mullions, o.height / 2, 0]}>
            <boxGeometry args={[3, o.height, t * 0.5]} />
          </mesh>
        ))}
      </group>
    );
  }
  if (o.type === 'opening') return null;
  if (o.type === 'slidingDoor') {
    return (
      <group position={[cx, 0, cz]} rotation={[0, -ang, 0]}>
        <mesh material={leafM} position={[-o.width / 4 + 8, o.height / 2, -1.5]}>
          <boxGeometry args={[o.width / 2, o.height - 2, 3]} />
        </mesh>
        <mesh material={glassM} position={[o.width / 4, o.height / 2, 1.5]}>
          <boxGeometry args={[o.width / 2, o.height - 2, 3]} />
        </mesh>
      </group>
    );
  }
  // hinged door: leaf opened ~85° into `side`, or closed in the opening
  const open = isOpen ? (85 * Math.PI) / 180 : 0;
  const leaves = o.type === 'doubleDoor' ? [-1, 1] : [o.hinge === 'end' ? 1 : -1];
  const lw = o.type === 'doubleDoor' ? o.width / 2 : o.width;
  return (
    <group position={[cx, 0, cz]} rotation={[0, -ang, 0]}>
      {/* casing */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={frameM} position={[(s * (o.width + 3)) / 2, o.height / 2, 0]}>
          <boxGeometry args={[3, o.height, t + 2]} />
        </mesh>
      ))}
      <mesh material={frameM} position={[0, o.height + 1.5, 0]}>
        <boxGeometry args={[o.width + 6, 3, t + 2]} />
      </mesh>
      {leaves.map((hs) => {
        // hinge at x = hs * width/2, rotate leaf toward side (wall normal +z local = world normal)
        const rot = hs * side * open;
        return (
          <group key={hs} position={[(hs * o.width) / 2, 0, (side * t) / 2]} rotation={[0, rot, 0]}>
            <mesh material={leafM} position={[(-hs * lw) / 2, o.height / 2, side * 2]} castShadow>
              <boxGeometry args={[lw - 1, o.height - 1, 4]} />
            </mesh>
            <mesh position={[-hs * (lw - 8), 100, side * 6]}>
              <boxGeometry args={[2, 2, 8]} />
              <meshStandardMaterial color="#9a9a9a" metalness={0.8} roughness={0.3} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function SwingArcs({ plan }: { plan: FloorPlan }) {
  const geo = useMemo(() => {
    const pts: number[] = [];
    for (const o of plan.openings) {
      const poly = doorSwingPoly(plan, o);
      if (!poly) continue;
      // poly: [hinge, arc pts...] (possibly twice for double doors)
      const per = 12;
      for (let k = 0; k + per <= poly.length; k += per) {
        const h = poly[k];
        const arc = poly.slice(k + 1, k + per);
        for (let i = 0; i < arc.length - 1; i++) pts.push(arc[i][0], 0.6, arc[i][1], arc[i + 1][0], 0.6, arc[i + 1][1]);
        const last = arc[arc.length - 1];
        pts.push(h[0], 0.6, h[1], last[0], 0.6, last[1]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [plan]);
  return (
    <lineSegments geometry={geo} raycast={() => null}>
      <lineDashedMaterial color="#8a847c" dashSize={6} gapSize={4} />
    </lineSegments>
  );
}

export function Room3D({ plan, finishes, wallMode, view, showCeiling }: Props) {
  const all = plan.rooms.flatMap((r) => r.points).concat(plan.walls.flatMap((w) => [w.a, w.b]));
  const bb = all.length ? bboxOf(all) : { minX: 0, minY: 0, maxX: 400, maxY: 400 };
  const center = useMemo(() => new THREE.Vector2((bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2), [bb.minX, bb.minY, bb.maxX, bb.maxY]);
  const extent = Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2;

  const floors = useMemo(
    () =>
      plan.rooms.map((r) => {
        const s = new THREE.Shape(r.points.map(([x, y]) => new THREE.Vector2(x, -y)));
        const g = new THREE.ShapeGeometry(s);
        g.rotateX(-Math.PI / 2);
        // uv from x/z
        const pos = g.getAttribute('position');
        const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
          uv[i * 2] = pos.getX(i);
          uv[i * 2 + 1] = pos.getZ(i);
        }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        const f = finishes.roomFloors[r.id] ?? finishes.floor;
        return { id: r.id, g, mat: floorMat(f.kind, f.color) };
      }),
    [plan.rooms, finishes.floor, finishes.roomFloors],
  );

  const ceilingGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(bb.maxX - bb.minX + 40, bb.maxY - bb.minY + 40);
    g.rotateX(Math.PI / 2);
    return g;
  }, [bb.minX, bb.minY, bb.maxX, bb.maxY]);

  const effMode = view === 'walk' ? 'full' : view === 'top' ? 'full' : wallMode;
  return (
    <group>
      {/* ground outside */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, -1, center.y]} receiveShadow raycast={() => null}>
        <planeGeometry args={[(bb.maxX - bb.minX) * 4 + 2000, (bb.maxY - bb.minY) * 4 + 2000]} />
        <meshStandardMaterial color="#e7e2da" roughness={1} />
      </mesh>
      {floors.map((f) => (
        <mesh key={f.id} geometry={f.g} material={f.mat} receiveShadow userData={{ floor: true }} />
      ))}
      {plan.walls.map((w) => (
        <WallMesh key={w.id} w={w} plan={plan} color={finishes.wallColors[w.id] ?? finishes.wallColor} mode={effMode as Props['wallMode']} center={center} extent={extent} />
      ))}
      {plan.openings.map((o) => (
        <OpeningMesh key={o.id} o={o} plan={plan} open={finishes.doorsOpen?.[o.id] ?? false} />
      ))}
      <SwingArcs plan={plan} />
      {(showCeiling || view === 'walk') && (
        <mesh geometry={ceilingGeo} position={[center.x, plan.ceiling, center.y]} raycast={() => null}>
          <meshStandardMaterial color={finishes.ceilingColor} roughness={1} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}
