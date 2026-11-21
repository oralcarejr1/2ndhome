import {
  Columns2,
  DoorOpen,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  Image as ImageIcon,
  Minus,
  MousePointer2,
  Plus,
  Ruler,
  Spline,
  Square,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { doorSwingPoly, resolveItems } from '../lib/analysis';
import { add, bboxOf, closestOnSeg, dist, mul, norm, polyArea, polyCentroid, pyeong, snap, sub, uid, wallPoly } from '../lib/geometry';
import { mirrorProject, type MirrorAxis } from '../lib/mirror';
import { useImageUrl } from '../scene/ItemMesh';
import { compressImage, storeImage } from '../store/persistence';
import { activeVersion, useStore } from '../store/store';
import type { Opening, OpeningType, Vec2, Wall } from '../types';
import { Confirm, Field, Num } from './common';

type Tool = 'furn' | 'select' | 'wall' | 'room' | 'door' | 'window' | 'calib' | 'pan';
type Sel = { kind: 'wall' | 'opening' | 'room'; id: string } | null;

const OPEN_TYPES: { v: OpeningType; l: string }[] = [
  { v: 'door', l: '여닫이문' },
  { v: 'doubleDoor', l: '양개문' },
  { v: 'slidingDoor', l: '미닫이문' },
  { v: 'window', l: '창문' },
  { v: 'balcony', l: '발코니 창(바닥까지)' },
  { v: 'opening', l: '뚫린 개구부' },
];

const PLAN_PALETTE = {
  dark: {
    grid: 'rgba(255, 255, 255, 0.045)',
    roomFill: 'rgba(216, 191, 152, 0.14)',
    roomSel: 'rgba(77, 141, 255, 0.18)',
    roomText: '#c8c4bc',
    roomSub: '#8d8a84',
    furnFill: 'rgba(38, 42, 49, 0.92)',
    furnLocked: 'rgba(56, 60, 68, 0.82)',
    furnRug: 'rgba(180, 168, 150, 0.18)',
    furnStroke: 'rgba(255, 255, 255, 0.30)',
    furnText: '#eceae4',
    furnTextHalo: '#1f2126',
    furnDim: '#9d9b95',
    wall: '#dedad2',
    wallLabel: '#9d9b95',
    wallHalo: '#1f2126',
    winFill: '#28425c',
    winStroke: '#6aa8d8',
    doorFill: '#282b32',
    doorStroke: '#94918a',
    swingFill: 'rgba(232, 168, 56, 0.10)',
    accent: '#4d8dff',
    accentSoft: 'rgba(77, 141, 255, 0.14)',
    person: '#e8a838',
    personFill: 'rgba(232, 168, 56, 0.18)',
    handleFill: '#181a1e',
  },
  light: {
    grid: 'rgba(24, 22, 19, 0.06)',
    roomFill: 'rgba(216, 191, 152, 0.28)',
    roomSel: 'rgba(29, 87, 196, 0.12)',
    roomText: '#5d574f',
    roomSub: '#857f76',
    furnFill: 'rgba(255, 255, 255, 0.92)',
    furnLocked: 'rgba(205, 199, 189, 0.78)',
    furnRug: 'rgba(215, 207, 194, 0.48)',
    furnStroke: 'rgba(45, 42, 38, 0.48)',
    furnText: '#252320',
    furnTextHalo: '#ffffff',
    furnDim: '#757068',
    wall: '#23201c',
    wallLabel: '#7a746c',
    wallHalo: '#ece8e0',
    winFill: '#d4e9f7',
    winStroke: '#4f8db8',
    doorFill: '#f6f4ef',
    doorStroke: '#827c74',
    swingFill: 'rgba(180, 83, 9, 0.07)',
    accent: '#1d57c4',
    accentSoft: 'rgba(29, 87, 196, 0.10)',
    person: '#b45309',
    personFill: 'rgba(180, 83, 9, 0.14)',
    handleFill: '#ffffff',
  },
} as const;

export function PlanEditor({
  editing,
  onToggleEdit,
  panelEl,
}: {
  editing: boolean;
  onToggleEdit: (on: boolean) => void;
  panelEl?: HTMLDivElement | null;
}) {
  const project = useStore((s) => s.project)!;
  const theme = useStore((s) => s.theme);
  const mutate = useStore((s) => s.mutate);
  const notify = useStore((s) => s.notify);
  const P = PLAN_PALETTE[theme];

  const flipHome = (axis: MirrorAxis) => {
    mutate((p) => {
      const m = mirrorProject(p, axis);
      p.plan = m.plan;
      p.versions = m.versions;
    });
    void useStore.getState().syncNow();
    notify(`집 전체를 반전했어요 — 모든 배치안 포함, Cmd+Z로 되돌리기${plan.underlay ? ' · 도면 이미지는 그대로예요' : ''}`);
  };
  const plan = project.plan;
  const v = activeVersion(project)!;
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>(editing ? 'select' : 'furn');
  useEffect(() => setTool(editing ? 'select' : 'furn'), [editing]);
  const selection = useStore((s) => s.selection);
  const [sel, setSel] = useState<Sel>(null);
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [hover, setHover] = useState<Vec2 | null>(null);
  const [grid, setGrid] = useState(5);
  const [showFurn, setShowFurn] = useState(true);
  const [calib, setCalib] = useState<Vec2[]>([]);
  const [calibLen, setCalibLen] = useState(300);
  const [roomWalls, setRoomWalls] = useState(plan.walls.length === 0);
  const underUrl = useImageUrl(plan.underlay ? { id: 'u', kind: 'image', blobId: plan.underlay.blobId, title: '', note: '', tags: [], createdAt: 0 } : undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  const bounds = useMemo(() => {
    const pts = plan.walls.flatMap((w) => [w.a, w.b]).concat(plan.rooms.flatMap((r) => r.points));
    return pts.length ? bboxOf(pts) : { minX: 0, minY: 0, maxX: 600, maxY: 450 };
  }, [project.id]);
  const [vb, setVb] = useState(() => ({ x: bounds.minX - 80, y: bounds.minY - 80, w: bounds.maxX - bounds.minX + 160, h: bounds.maxY - bounds.minY + 160 }));
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const aspect = size.h / Math.max(1, size.w);
  const vbh = vb.w * aspect;
  const vby = vb.y + (vb.h - vbh) / 2;
  const px = vb.w / Math.max(1, size.w); // cm per screen px

  const toPlan = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    return [vb.x + ((e.clientX - r.left) / r.width) * vb.w, vby + ((e.clientY - r.top) / r.height) * vbh];
  };

  const snapPt = (p: Vec2, from?: Vec2, ortho = true): Vec2 => {
    for (const w of plan.walls)
      for (const q of [w.a, w.b]) if (dist(p, q) < 10 * px) return [...q] as Vec2;
    for (const r of plan.rooms) for (const q of r.points) if (dist(p, q) < 10 * px) return [...q] as Vec2;
    let out: Vec2 = [snap(p[0], grid), snap(p[1], grid)];
    if (from && ortho) {
      const dx = Math.abs(out[0] - from[0]);
      const dy = Math.abs(out[1] - from[1]);
      if (dx < dy * 0.15) out = [from[0], out[1]];
      else if (dy < dx * 0.15) out = [out[0], from[1]];
    }
    return out;
  };

  const drag = useRef<null | { kind: string; id?: string; idx?: number; start: Vec2; orig: unknown; moved: boolean }>(null);

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toPlan(e);
    const t = (e.target as Element).closest('[data-k]') as HTMLElement | null;
    if (tool === 'furn' && t?.dataset.k === 'furn' && e.button === 0) {
      const id = t.dataset.id!;
      const st = useStore.getState();
      if (e.shiftKey) st.select([id], true);
      else if (!st.selection.includes(id)) st.select([id]);
      const ids = (useStore.getState().selection.includes(id) ? useStore.getState().selection : [id]).filter((x) => !v.items.find((i) => i.id === x)?.locked);
      const orig = new Map(ids.map((x) => [x, { ...(v.items.find((i) => i.id === x) ?? { x: 0, z: 0 }) }]));
      drag.current = { kind: 'furn', start: p, orig, moved: false };
      return;
    }
    if (tool === 'pan' || e.button === 1 || ((tool === 'select' || tool === 'furn') && !t)) {
      if (tool === 'furn' && !t) useStore.getState().select([]);
      drag.current = { kind: 'pan', start: [e.clientX, e.clientY], orig: { ...vb }, moved: false };
      if (tool === 'select' && !t) setSel(null);
      return;
    }
    if (tool === 'wall' || tool === 'room') {
      const sp = snapPt(p, draft[draft.length - 1], !e.altKey);
      if (draft.length && dist(sp, draft[0]) < 1 && tool === 'room' && draft.length >= 3) return finishRoom();
      setDraft([...draft, sp]);
      return;
    }
    if (tool === 'door' || tool === 'window') {
      let best: { w: Wall; t: number; d: number } | null = null;
      for (const w of plan.walls) {
        const c = closestOnSeg(p, w.a, w.b);
        if (c.d < w.thickness / 2 + 15 * px && (!best || c.d < best.d)) best = { w, t: c.t, d: c.d };
      }
      if (!best) return notify('벽 위를 클릭하세요');
      const L = dist(best.w.a, best.w.b);
      const o: Opening =
        tool === 'door'
          ? { id: uid('o'), wallId: best.w.id, type: 'door', pos: snap(best.t * L, 1), width: 90, height: 210, sill: 0, hinge: 'start', side: 1 }
          : { id: uid('o'), wallId: best.w.id, type: 'window', pos: snap(best.t * L, 1), width: 150, height: 140, sill: 90 };
      mutate((pp) => {
        pp.plan.openings.push(o);
      });
      setSel({ kind: 'opening', id: o.id });
      setTool('select');
      return;
    }
    if (tool === 'calib') {
      const next = [...calib, p];
      if (next.length === 2) {
        setCalib(next);
        setTool('select');
        notify('우측 속성 패널에 두 점 사이 실제 거리를 입력하세요');
        return;
      }
      setCalib(next);
      return;
    }
    if (t) {
      const k = t.dataset.k!;
      const id = t.dataset.id!;
      if (k === 'wall') {
        setSel({ kind: 'wall', id });
        const w = plan.walls.find((x) => x.id === id)!;
        drag.current = { kind: 'wall', id, start: p, orig: { a: [...w.a], b: [...w.b] }, moved: false };
      } else if (k === 'wend') {
        const [wid, end] = id.split('|');
        const w = plan.walls.find((x) => x.id === wid)!;
        const q = end === 'a' ? w.a : w.b;
        const links = plan.walls.flatMap((ww) => (['a', 'b'] as const).filter((en) => dist(ww[en], q) < 1).map((en) => ({ id: ww.id, en })));
        drag.current = { kind: 'wend', start: p, orig: { links, q: [...q] }, moved: false };
        setSel({ kind: 'wall', id: wid });
      } else if (k === 'open') {
        setSel({ kind: 'opening', id });
        drag.current = { kind: 'open', id, start: p, orig: null, moved: false };
      } else if (k === 'room') {
        setSel({ kind: 'room', id });
      } else if (k === 'rpt') {
        const [rid, idx] = id.split('|');
        setSel({ kind: 'room', id: rid });
        drag.current = { kind: 'rpt', id: rid, idx: +idx, start: p, orig: null, moved: false };
      } else if (k === 'under') {
        drag.current = { kind: 'under', start: p, orig: { x: plan.underlay!.x, y: plan.underlay!.y }, moved: false };
      }
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const p = toPlan(e);
    if (tool === 'wall' || tool === 'room') setHover(snapPt(p, draft[draft.length - 1], !e.altKey));
    else setHover(p);
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      const o = d.orig as typeof vb;
      const r = svgRef.current!.getBoundingClientRect();
      setVb({ ...o, x: o.x - ((e.clientX - d.start[0]) / r.width) * o.w, y: o.y - ((e.clientY - d.start[1]) / r.height) * o.w * aspect });
      return;
    }
    if (!d.moved) {
      if (dist(p, d.start) < 3 * px) return;
      d.moved = true;
      useStore.getState().checkpoint();
    }
    if (d.kind === 'furn') {
      const o = d.orig as Map<string, { x: number; z: number }>;
      const fx = snap(p[0] - d.start[0], e.altKey ? 0 : 1);
      const fz = snap(p[1] - d.start[1], e.altKey ? 0 : 1);
      useStore.getState().updateItems(
        [...o.keys()],
        (it) => {
          const q = o.get(it.id);
          if (!q) return;
          it.x = q.x + fx;
          it.z = q.z + fz;
        },
        false,
      );
      return;
    }
    const dx = snap(p[0] - d.start[0], grid);
    const dy = snap(p[1] - d.start[1], grid);
    if (d.kind === 'wall') {
      const o = d.orig as { a: Vec2; b: Vec2 };
      mutate((pp) => {
        const w = pp.plan.walls.find((x) => x.id === d.id)!;
        w.a = [o.a[0] + dx, o.a[1] + dy];
        w.b = [o.b[0] + dx, o.b[1] + dy];
      }, false);
    } else if (d.kind === 'wend') {
      const o = d.orig as { links: { id: string; en: 'a' | 'b' }[]; q: Vec2 };
      const np = snapPt(add(o.q, [p[0] - d.start[0], p[1] - d.start[1]]), undefined, false);
      mutate((pp) => {
        for (const l of o.links) {
          const w = pp.plan.walls.find((x) => x.id === l.id);
          if (w) w[l.en] = np;
        }
      }, false);
    } else if (d.kind === 'open') {
      mutate((pp) => {
        const o = pp.plan.openings.find((x) => x.id === d.id)!;
        const w = pp.plan.walls.find((x) => x.id === o.wallId)!;
        const c = closestOnSeg(p, w.a, w.b);
        const L = dist(w.a, w.b);
        o.pos = Math.max(o.width / 2, Math.min(L - o.width / 2, snap(c.t * L, 1)));
      }, false);
    } else if (d.kind === 'rpt') {
      const np = snapPt(p, undefined, false);
      mutate((pp) => {
        const r = pp.plan.rooms.find((x) => x.id === d.id)!;
        r.points[d.idx!] = np;
      }, false);
    } else if (d.kind === 'under') {
      const o = d.orig as { x: number; y: number };
      mutate((pp) => {
        pp.plan.underlay!.x = o.x + (p[0] - d.start[0]);
        pp.plan.underlay!.y = o.y + (p[1] - d.start[1]);
      }, false);
    }
  };
  const onUp = () => {
    drag.current = null;
  };

  const finishWall = () => {
    if (draft.length >= 2) {
      mutate((pp) => {
        for (let i = 0; i < draft.length - 1; i++) pp.plan.walls.push({ id: uid('w'), a: draft[i], b: draft[i + 1], thickness: 12 });
      });
    }
    setDraft([]);
  };
  const finishRoom = () => {
    if (draft.length >= 3) {
      const id = uid('r');
      const name = `방 ${plan.rooms.length + 1}`;
      mutate((pp) => {
        pp.plan.rooms.push({ id, name, points: draft });
        if (roomWalls) for (let i = 0; i < draft.length; i++) pp.plan.walls.push({ id: uid('w'), a: draft[i], b: draft[(i + 1) % draft.length], thickness: 12 });
      });
      setSel({ kind: 'room', id });
      setTool('select');
      notify('방을 만들었어요 — 우측 패널에서 이름을 바꾸세요');
    }
    setDraft([]);
  };

  const applyCalib = () => {
    if (calib.length !== 2 || !plan.underlay || !(calibLen > 0)) return;
    const cur = dist(calib[0], calib[1]);
    const f = calibLen / cur;
    const p0 = calib[0];
    mutate((pp) => {
      const u = pp.plan.underlay!;
      u.x = p0[0] - (p0[0] - u.x) * f;
      u.y = p0[1] - (p0[1] - u.y) * f;
      u.scale *= f;
    });
    notify(`도면 이미지 축척을 맞췄어요 (×${f.toFixed(3)})`);
    setCalib([]);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.key === 'Escape') {
        if (tool === 'wall') finishWall();
        else if (tool === 'room') finishRoom();
        setDraft([]);
        setCalib([]);
        setTool('select');
      }
      if (e.key === 'Enter') {
        if (tool === 'wall') finishWall();
        if (tool === 'room') finishRoom();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault();
        del();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const del = () => {
    if (!sel) return;
    mutate((pp) => {
      if (sel.kind === 'wall') {
        pp.plan.walls = pp.plan.walls.filter((w) => w.id !== sel.id);
        pp.plan.openings = pp.plan.openings.filter((o) => o.wallId !== sel.id);
      } else if (sel.kind === 'opening') pp.plan.openings = pp.plan.openings.filter((o) => o.id !== sel.id);
      else pp.plan.rooms = pp.plan.rooms.filter((r) => r.id !== sel.id);
    });
    setSel(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = toPlan(e);
    const f = Math.exp(e.deltaY * 0.0015);
    const nw = Math.min(5000, Math.max(80, vb.w * f));
    const ff = nw / vb.w;
    setVb({ x: p[0] - (p[0] - vb.x) * ff, y: p[1] - (p[1] - vb.y) * ff, w: nw, h: vb.h * ff });
  };

  const furniture = useMemo(() => (showFurn ? resolveItems(project, v) : []), [showFurn, project, v]);
  const selWall = sel?.kind === 'wall' ? plan.walls.find((w) => w.id === sel.id) : null;
  const selOpen = sel?.kind === 'opening' ? plan.openings.find((o) => o.id === sel.id) : null;
  const selRoom = sel?.kind === 'room' ? plan.rooms.find((r) => r.id === sel.id) : null;
  const fs = 12 * px;

  const uploadUnderlay = async (f: File) => {
    const small = await compressImage(f, 2400, 0.9);
    const { id } = await storeImage(small);
    const bmp = await createImageBitmap(small);
    const b = bounds;
    const scale = (b.maxX - b.minX + 100) / bmp.width;
    mutate((pp) => {
      pp.plan.underlay = { blobId: id, x: b.minX - 50, y: b.minY - 50, scale, opacity: 0.5, rotation: 0 };
    });
    notify("도면 이미지를 깔았어요. '축척'으로 아는 길이 두 점을 찍어 크기를 맞추세요.");
  };

  const activeToolHint =
    tool === 'wall'
      ? '클릭으로 벽 꼭짓점 · 더블클릭/Enter 완료 · Alt 직각 스냅 해제'
      : tool === 'room'
        ? '클릭으로 바닥 꼭짓점 · 시작점/더블클릭으로 완성'
        : tool === 'door' || tool === 'window'
          ? '문/창을 넣을 벽 위를 클릭하세요'
          : tool === 'calib'
            ? `길이를 아는 두 점을 클릭하세요 (${calib.length}/2)`
            : null;

  const planInspectorContent = (
    <div className="insp-stack">
      <div className="insp-header">
        <div className="insp-eyebrow">2D 도면 편집</div>
        <h4>{selWall ? '선택한 벽' : selOpen ? '선택한 문·창' : selRoom ? '선택한 방' : '집 전체 설정'}</h4>
      </div>

      {calib.length === 2 && (
        <div className="callout info">
          <b>축척 맞추기</b> — 찍은 두 점 사이의 실제 거리
          <div className="row" style={{ marginBottom: 0 }}>
            <div style={{ width: 100 }}>
              <Num value={calibLen} unit="cm" min={1} onChange={setCalibLen} />
            </div>
            <button className="btn-xs primary" onClick={applyCalib}>
              적용
            </button>
            <button className="btn-xs" onClick={() => setCalib([])}>
              취소
            </button>
          </div>
        </div>
      )}

      {selWall && (
        <div className="insp-section" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
          <div className="grid2">
            <Field label="길이">
              <Num
                value={dist(selWall.a, selWall.b)}
                unit="cm"
                onChange={(L) =>
                  mutate((p) => {
                    const w = p.plan.walls.find((x) => x.id === selWall.id)!;
                    const d = norm(sub(w.b, w.a));
                    w.b = add(w.a, mul(d, L));
                  })
                }
              />
            </Field>
            <Field label="두께">
              <Num value={selWall.thickness} unit="cm" onChange={(t) => mutate((p) => (p.plan.walls.find((x) => x.id === selWall.id)!.thickness = t))} />
            </Field>
            <Field label="높이 (비우면 천장)">
              <Num value={selWall.height ?? plan.ceiling} unit="cm" onChange={(h) => mutate((p) => (p.plan.walls.find((x) => x.id === selWall.id)!.height = h))} />
            </Field>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn-xs"
              onClick={() => mutate((p) => p.plan.openings.push({ id: uid('o'), wallId: selWall.id, type: 'door', pos: dist(selWall.a, selWall.b) / 2, width: 90, height: 210, sill: 0, hinge: 'start', side: 1 }))}
            >
              + 문
            </button>
            <button
              className="btn-xs"
              onClick={() => mutate((p) => p.plan.openings.push({ id: uid('o'), wallId: selWall.id, type: 'window', pos: dist(selWall.a, selWall.b) / 2, width: 150, height: 140, sill: 90 }))}
            >
              + 창
            </button>
            <button className="btn-xs danger" onClick={del} style={{ marginLeft: 'auto' }}>
              <Trash2 size={12} /> 삭제
            </button>
          </div>
        </div>
      )}

      {selOpen && (
        <div className="insp-section" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
          <Field label="종류">
            <select className="inp" value={selOpen.type} onChange={(e) => mutate((p) => (p.plan.openings.find((x) => x.id === selOpen.id)!.type = e.target.value as OpeningType))}>
              {OPEN_TYPES.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.l}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid2" style={{ marginTop: 6 }}>
            {(
              [
                ['width', '폭'],
                ['height', '높이'],
                ['sill', '창턱 높이'],
                ['pos', '벽 시작부터'],
              ] as const
            ).map(([k, l]) => (
              <Field key={k} label={l}>
                <Num value={selOpen[k]} unit="cm" onChange={(val) => mutate((p) => ((p.plan.openings.find((x) => x.id === selOpen.id)! as unknown as Record<string, number>)[k] = val))} />
              </Field>
            ))}
          </div>
          {(selOpen.type === 'door' || selOpen.type === 'doubleDoor') && (
            <div className="seg-grid-2" style={{ marginTop: 8 }}>
              <button
                className="btn-xs"
                onClick={() =>
                  mutate((p) => {
                    const o = p.plan.openings.find((x) => x.id === selOpen.id)!;
                    o.side = (o.side ?? 1) === 1 ? -1 : 1;
                  })
                }
              >
                열림 방향 반전
              </button>
              <button
                className="btn-xs"
                onClick={() =>
                  mutate((p) => {
                    const o = p.plan.openings.find((x) => x.id === selOpen.id)!;
                    o.hinge = o.hinge === 'end' ? 'start' : 'end';
                  })
                }
              >
                경첩 위치 반전
              </button>
            </div>
          )}
          <label className="check" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              checked={!!selOpen.isEntry}
              onChange={(e) => mutate((p) => p.plan.openings.forEach((o) => (o.isEntry = o.id === selOpen.id ? e.target.checked : e.target.checked ? false : o.isEntry)))}
            />
            현관문 (동선·반입 기준)
          </label>
          <button className="btn-xs danger" onClick={del} style={{ marginTop: 4 }}>
            <Trash2 size={12} /> 삭제
          </button>
        </div>
      )}

      {selRoom && (
        <div className="insp-section" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
          <Field label="방 이름">
            <input className="inp" value={selRoom.name} onChange={(e) => mutate((p) => (p.plan.rooms.find((x) => x.id === selRoom.id)!.name = e.target.value), false)} />
          </Field>
          <p className="note">
            <b className="mono">{(polyArea(selRoom.points) / 10000).toFixed(2)}㎡</b> · 꼭짓점 드래그로 모양 수정. 이름에 '욕실/보일러/발코니' 포함 시 동선 분석 제외.
          </p>
          <button className="btn-xs danger" onClick={del} style={{ marginTop: 6 }}>
            <Trash2 size={12} /> 삭제
          </button>
        </div>
      )}

      <div className="insp-section">
        <div className="insp-label">구조 · 스냅</div>
        <div className="grid2">
          <Field label="천장 높이">
            <Num value={plan.ceiling} unit="cm" onChange={(c) => mutate((p) => (p.plan.ceiling = c))} />
          </Field>
          <Field label="격자 스냅">
            <select className="inp" value={grid} onChange={(e) => setGrid(+e.target.value)}>
              {[1, 5, 10, 25, 50].map((g) => (
                <option key={g} value={g}>
                  {g}cm
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-label">집 전체 대칭 반전</div>
        <div className="seg-grid-2">
          <button className="btn-secondary" onClick={() => flipHome('long')} title="긴 변을 따라 좌우 대칭 반전">
            <FlipVertical2 size={13} /> 긴 축 반전
          </button>
          <button className="btn-secondary" onClick={() => flipHome('short')} title="짧은 변을 따라 좌우 대칭 반전">
            <FlipHorizontal2 size={13} /> 짧은 축 반전
          </button>
        </div>
        <p className="mini-note">도면·문 방향·모든 배치안을 함께 뒤집습니다.</p>
      </div>

      {plan.underlay && (
        <div className="insp-section">
          <div className="insp-label-row">
            <span className="insp-label">도면 이미지</span>
            <Confirm label="제거" onConfirm={() => mutate((p) => (p.plan.underlay = undefined))} />
          </div>
          <div className="insp-label-row">
            <span className="mini-cap" style={{ margin: 0 }}>투명도</span>
            <b className="mono" style={{ fontSize: 11 }}>{Math.round(plan.underlay.opacity * 100)}%</b>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={plan.underlay.opacity}
            onChange={(e) => mutate((p) => (p.plan.underlay!.opacity = +e.target.value), false)}
            style={{ marginTop: 4 }}
          />
        </div>
      )}

      {project.info?.planNote && <div className="callout info">{project.info.planNote}</div>}

      <div className="insp-section">
        <button className="btn-secondary full-width" onClick={() => onToggleEdit(false)}>
          도면 편집 마치고 가구 배치로
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="plan-stage">
        <div className="plan-tools">
          <div className="tool-group">
            <button className={!editing ? 'on' : ''} onClick={() => onToggleEdit(false)} title="가구를 끌어 옮기기">
              <MousePointer2 size={13} /> 가구 배치
            </button>
            <button className={editing ? 'on' : ''} onClick={() => onToggleEdit(true)} title="벽·문·창·방 수정">
              <Spline size={13} /> 도면 편집
            </button>
          </div>
          {editing && (
            <div className="tool-group">
              {(
                [
                  ['select', <MousePointer2 key="s" size={13} />, '선택'],
                  ['pan', <Hand key="p" size={13} />, '이동'],
                  ['wall', <Spline key="w" size={13} />, '벽'],
                  ['room', <Square key="r" size={13} />, '방'],
                  ['door', <DoorOpen key="d" size={13} />, '문'],
                  ['window', <Columns2 key="wi" size={13} />, '창'],
                ] as [Tool, JSX.Element, string][]
              ).map(([t, ic, l]) => (
                <button
                  key={t}
                  className={tool === t ? 'on' : ''}
                  onClick={() => {
                    setTool(t);
                    setDraft([]);
                  }}
                  title={l}
                >
                  {ic} {l}
                </button>
              ))}
              <button onClick={() => fileRef.current?.click()} title="평면도 이미지를 깔고 따라 그리기">
                <ImageIcon size={13} /> 도면 이미지
              </button>
              {plan.underlay && (
                <button
                  className={tool === 'calib' ? 'on' : ''}
                  onClick={() => {
                    setTool('calib');
                    setCalib([]);
                  }}
                >
                  <Ruler size={13} /> 축척
                </button>
              )}
              <label title="방(바닥)을 그릴 때 둘레에 벽도 함께 만들기">
                <input type="checkbox" checked={roomWalls} onChange={(e) => setRoomWalls(e.target.checked)} />
                방+벽
              </label>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadUnderlay(e.target.files[0])} />
          <div className="tool-group">
            <label>
              <input type="checkbox" checked={showFurn} onChange={(e) => setShowFurn(e.target.checked)} />
              가구
            </label>
          </div>
        </div>

        {activeToolHint && <div className="place-hint">{activeToolHint}</div>}

        <svg
          ref={svgRef}
          viewBox={`${vb.x} ${vby} ${vb.w} ${vbh}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onDoubleClick={() => {
            if (tool === 'wall') finishWall();
            if (tool === 'room') finishRoom();
          }}
          onWheel={onWheel}
          style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' || tool === 'furn' ? 'default' : 'crosshair' }}
        >
          <defs>
            <pattern id="g" width={grid * 10} height={grid * 10} patternUnits="userSpaceOnUse">
              <path d={`M ${grid * 10} 0 L 0 0 0 ${grid * 10}`} fill="none" stroke={P.grid} strokeWidth={px} />
            </pattern>
          </defs>
          <rect x={vb.x - 5000} y={vby - 5000} width={vb.w + 10000} height={vbh + 10000} fill="url(#g)" />
          {plan.underlay && underUrl && (
            <image
              data-k={tool === 'select' ? 'under' : undefined}
              href={underUrl}
              x={plan.underlay.x}
              y={plan.underlay.y}
              opacity={plan.underlay.opacity}
              style={{ cursor: 'move' }}
              transform="scale(1)"
              width={undefined}
              preserveAspectRatio="none"
              ref={(el) => {
                if (el && plan.underlay) {
                  const img = new Image();
                  img.onload = () => {
                    el.setAttribute('width', String(img.width * plan.underlay!.scale));
                    el.setAttribute('height', String(img.height * plan.underlay!.scale));
                  };
                  img.src = underUrl;
                }
              }}
            />
          )}
          {plan.rooms.map((r) => {
            const c = polyCentroid(r.points);
            const a = polyArea(r.points);
            const on = sel?.kind === 'room' && sel.id === r.id;
            return (
              <g key={r.id}>
                <polygon
                  data-k="room"
                  data-id={r.id}
                  points={r.points.map((p) => p.join(',')).join(' ')}
                  fill={on ? P.roomSel : P.roomFill}
                  stroke={on ? P.accent : 'none'}
                  strokeWidth={2 * px}
                />
                <text x={c[0]} y={c[1]} fontSize={fs * 1.05} textAnchor="middle" fill={P.roomText} fontWeight={600} style={{ pointerEvents: 'none' }}>
                  {r.name}
                </text>
                <text x={c[0]} y={c[1] + fs * 1.25} fontSize={fs * 0.85} textAnchor="middle" fill={P.roomSub} style={{ pointerEvents: 'none' }}>
                  {(a / 10000).toFixed(1)}㎡ · {pyeong(a).toFixed(1)}평
                </text>
              </g>
            );
          })}
          {[...furniture]
            .sort((a, b) => (a.prod.model === 'rug' ? -1 : 0) - (b.prod.model === 'rug' ? -1 : 0) || a.y0 - b.y0)
            .map((r) => {
              const on = selection.includes(r.it.id);
              const c = polyCentroid(r.poly);
              const big = r.w * r.d > 2200 && r.prod.mount !== 'ceiling';
              const fill = r.prod.model === 'rug' ? P.furnRug : r.it.locked ? P.furnLocked : P.furnFill;
              return (
                <g key={r.it.id}>
                  <polygon
                    data-k={tool === 'furn' ? 'furn' : undefined}
                    data-id={r.it.id}
                    points={r.poly.map((q) => q.join(',')).join(' ')}
                    fill={fill}
                    stroke={on ? P.accent : P.furnStroke}
                    strokeWidth={(on ? 2.2 : 1) * px}
                    strokeDasharray={r.prod.mount === 'ceiling' || r.y0 > 120 ? `${4 * px} ${3 * px}` : undefined}
                    style={{ pointerEvents: tool === 'furn' ? 'auto' : 'none', cursor: tool === 'furn' && !r.it.locked ? 'grab' : undefined }}
                  />
                  {(big || on) && (
                    <text
                      x={c[0]}
                      y={c[1]}
                      fontSize={fs * 0.82}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={P.furnText}
                      fontWeight={600}
                      style={{ pointerEvents: 'none' }}
                      paintOrder="stroke"
                      stroke={P.furnTextHalo}
                      strokeWidth={2.5 * px}
                    >
                      {(r.it.label || r.prod.name).replace(/\(.*?\)/g, '').slice(0, 12)}
                      <tspan x={c[0]} dy={fs * 1.05} fontSize={fs * 0.7} fontWeight={400} fill={P.furnDim}>
                        {Math.round(r.w)}×{Math.round(r.d)}
                      </tspan>
                    </text>
                  )}
                </g>
              );
            })}
          {showFurn &&
            v.people.map((h) => (
              <g key={h.id} style={{ pointerEvents: 'none' }}>
                <circle cx={h.x} cy={h.z} r={22} fill={P.personFill} stroke={P.person} strokeWidth={1.5 * px} />
                <line x1={h.x} y1={h.z} x2={h.x + Math.sin((h.rot * Math.PI) / 180) * 30} y2={h.z + Math.cos((h.rot * Math.PI) / 180) * 30} stroke={P.person} strokeWidth={2 * px} />
              </g>
            ))}
          {plan.walls.map((w) => {
            const on = sel?.kind === 'wall' && sel.id === w.id;
            const poly = wallPoly(w);
            const L = dist(w.a, w.b);
            const mid: Vec2 = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
            const n = norm([-(w.b[1] - w.a[1]), w.b[0] - w.a[0]]);
            const lp = add(mid, mul(n, w.thickness / 2 + fs));
            return (
              <g key={w.id}>
                <polygon data-k="wall" data-id={w.id} points={poly.map((p) => p.join(',')).join(' ')} fill={on ? P.accent : P.wall} style={{ cursor: tool === 'select' ? 'move' : undefined }} />
                {(on || L > 80) && (
                  <text
                    x={lp[0]}
                    y={lp[1]}
                    fontSize={fs * 0.82}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={on ? P.accent : P.wallLabel}
                    style={{ pointerEvents: 'none' }}
                    paintOrder="stroke"
                    stroke={P.wallHalo}
                    strokeWidth={3 * px}
                  >
                    {Math.round(L)}
                  </text>
                )}
                {on &&
                  (['a', 'b'] as const).map((en) => (
                    <circle key={en} data-k="wend" data-id={`${w.id}|${en}`} cx={w[en][0]} cy={w[en][1]} r={7 * px} fill={P.handleFill} stroke={P.accent} strokeWidth={2 * px} style={{ cursor: 'grab' }} />
                  ))}
              </g>
            );
          })}
          {plan.openings.map((o) => {
            const w = plan.walls.find((x) => x.id === o.wallId);
            if (!w) return null;
            const dir = norm(sub(w.b, w.a));
            const c = add(w.a, mul(dir, o.pos));
            const a0 = add(c, mul(dir, -o.width / 2));
            const a1 = add(c, mul(dir, o.width / 2));
            const nn: Vec2 = [-dir[1], dir[0]];
            const ht = w.thickness / 2 + 1;
            const quad = [add(a0, mul(nn, ht)), add(a1, mul(nn, ht)), add(a1, mul(nn, -ht)), add(a0, mul(nn, -ht))];
            const on = sel?.kind === 'opening' && sel.id === o.id;
            const swing = doorSwingPoly(plan, o);
            const isWin = o.type === 'window' || o.type === 'balcony';
            return (
              <g key={o.id}>
                <polygon
                  data-k="open"
                  data-id={o.id}
                  points={quad.map((p) => p.join(',')).join(' ')}
                  fill={isWin ? P.winFill : P.doorFill}
                  stroke={on ? P.accent : isWin ? P.winStroke : P.doorStroke}
                  strokeWidth={(on ? 2.4 : 1) * px}
                  style={{ cursor: 'ew-resize' }}
                />
                {swing && <polyline points={swing.map((p) => p.join(',')).join(' ')} fill={P.swingFill} stroke={P.doorStroke} strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} style={{ pointerEvents: 'none' }} />}
                {o.isEntry && (
                  <text x={c[0] + nn[0] * (ht + fs * 1.6)} y={c[1] + nn[1] * (ht + fs * 1.6)} fontSize={fs * 0.82} textAnchor="middle" fill={P.roomSub} style={{ pointerEvents: 'none' }}>
                    현관
                  </text>
                )}
              </g>
            );
          })}
          {selRoom &&
            selRoom.points.map((p, i) => (
              <circle key={i} data-k="rpt" data-id={`${selRoom.id}|${i}`} cx={p[0]} cy={p[1]} r={6 * px} fill={P.handleFill} stroke={P.accent} strokeWidth={2 * px} style={{ cursor: 'grab' }} />
            ))}
          {draft.length > 0 && (
            <polyline
              points={[...draft, ...(hover ? [hover] : [])].map((p) => p.join(',')).join(' ')}
              fill={tool === 'room' ? P.accentSoft : 'none'}
              stroke={P.accent}
              strokeWidth={tool === 'wall' ? 12 : 2 * px}
              strokeOpacity={tool === 'wall' ? 0.55 : 1}
            />
          )}
          {draft.length > 0 && hover && (
            <text x={hover[0] + 8 * px} y={hover[1] - 8 * px} fontSize={fs} fill={P.accent} fontWeight={600}>
              {Math.round(dist(draft[draft.length - 1], hover))}cm
            </text>
          )}
          {calib.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={5 * px} fill={P.accent} />
          ))}
          {(tool === 'wall' || tool === 'room') && hover && <circle cx={hover[0]} cy={hover[1]} r={4 * px} fill={P.accent} style={{ pointerEvents: 'none' }} />}
        </svg>

        <div className="fp2d-zoom-bar">
          <button onClick={() => setVb((o) => ({ x: o.x + o.w * 0.125, y: o.y + o.h * 0.125, w: o.w * 0.75, h: o.h * 0.75 }))} title="확대" aria-label="확대">
            <Plus size={13} />
          </button>
          <button onClick={() => setVb((o) => ({ x: o.x - o.w * 0.165, y: o.y - o.h * 0.165, w: o.w * 1.33, h: o.h * 1.33 }))} title="축소" aria-label="축소">
            <Minus size={13} />
          </button>
          <button onClick={() => setVb({ x: bounds.minX - 80, y: bounds.minY - 80, w: bounds.maxX - bounds.minX + 160, h: bounds.maxY - bounds.minY + 160 })}>전체</button>
        </div>
      </div>

      {editing && panelEl && createPortal(planInspectorContent, panelEl)}
    </>
  );
}
