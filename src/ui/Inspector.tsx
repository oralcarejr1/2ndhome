import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  Copy,
  DoorOpen,
  ExternalLink,
  EyeOff,
  FlipHorizontal,
  Group,
  Lock,
  RotateCcw,
  RotateCw,
  Trash2,
  Unlock,
  UserCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { catLabel } from '../catalog/categories';
import { PRODUCTS, productSearchUrl } from '../catalog/products';
import { nearestWall, resolveItems, sideGaps } from '../lib/analysis';
import { anthro } from '../lib/ergonomics';
import { fmtWon, itemAxes, localToWorld, normDeg, uid } from '../lib/geometry';
import { MODELS, paramVisible, resolveMats, resolveParams } from '../models';
import { fridgeEnclosureLayout } from '../models/fixtures';
import { useIssues } from '../scene/Viewport';
import { activeVersion, getProduct, useStore } from '../store/store';
import type { FloorKind, Mount, ParamValue, PlacedItem, PlacedPerson, Pose, Product } from '../types';
import { testWithHuman } from './actions';
import { MatInput, Num, ParamInput } from './common';

const STATUS: { v: NonNullable<PlacedItem['status']>; l: string }[] = [
  { v: 'candidate', l: '후보' },
  { v: 'decided', l: '확정' },
  { v: 'bought', l: '구매 완료' },
  { v: 'owned', l: '이미 있음' },
];

export const FLOORS: { v: FloorKind; l: string; c: string }[] = [
  { v: 'oak', l: '내추럴 오크', c: '#d8bf98' },
  { v: 'ash', l: '라이트 애쉬', c: '#e6d6bb' },
  { v: 'walnut', l: '웜 월넛', c: '#8a6448' },
  { v: 'herringbone', l: '헤링본 오크', c: '#cfae84' },
  { v: 'bigtile', l: '포세린 베이지', c: '#e9e3d9' },
  { v: 'tile', l: '타일 60', c: '#dedbd6' },
  { v: 'vinyl', l: '장판(우드)', c: '#d9c29d' },
  { v: 'decotile', l: '데코타일 블랙', c: '#262524' },
  { v: 'concrete', l: '콘크리트', c: '#c9c8c4' },
  { v: 'terrazzo', l: '테라조', c: '#ebe6df' },
  { v: 'carpet', l: '카펫', c: '#c9c0b3' },
];

const WALLS = [
  { hex: '#f5f2ec', name: '웜 화이트' },
  { hex: '#ffffff', name: '퓨어 화이트' },
  { hex: '#ede6dc', name: '크림' },
  { hex: '#e3ddd3', name: '그레이지' },
  { hex: '#d9d3c7', name: '샌드' },
  { hex: '#cfd6d2', name: '세이지 그레이' },
  { hex: '#d6dde3', name: '페일 블루' },
  { hex: '#e8d9cf', name: '피치' },
  { hex: '#8f9a8b', name: '올리브' },
  { hex: '#55606b', name: '슬레이트' },
];

export function moodColorsOf(p: { moodboard: { palette?: string[]; color?: string }[] }) {
  return Array.from(new Set(p.moodboard.flatMap((r) => r.palette ?? (r.color ? [r.color] : [])).map((c) => c.toLowerCase())));
}

export function Inspector() {
  const project = useStore((s) => s.project)!;
  const selection = useStore((s) => s.selection);
  const v = activeVersion(project)!;
  const items = v.items.filter((i) => selection.includes(i.id));
  const people = v.people.filter((h) => selection.includes(h.id));
  return (
    <div className="panel-scroll">
      {people.length === 1 && !items.length ? (
        <PersonInspector h={people[0]} />
      ) : items.length === 1 ? (
        <ItemInspector it={items[0]} />
      ) : items.length > 1 ? (
        <MultiInspector ids={selection} />
      ) : (
        <RoomSettings />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ room finishes (nothing selected)
function RoomSettings() {
  const project = useStore((s) => s.project)!;
  const v = activeVersion(project)!;
  const mutateVersion = useStore((s) => s.mutateVersion);
  const mutate = useStore((s) => s.mutate);
  const updateItems = useStore((s) => s.updateItems);
  const [roomId, setRoomId] = useState('');
  const f = v.finishes;
  const moodColors = moodColorsOf(project);
  const curFloor = roomId ? (f.roomFloors[roomId] ?? f.floor) : f.floor;
  const doors = project.plan.openings.filter((o) => o.type === 'door' || o.type === 'doubleDoor');
  const doorName = (id: string, isEntry?: boolean) => (isEntry ? '현관문' : id.includes('bath') ? '욕실문' : id.includes('boiler') ? '보일러실 문' : '방문');
  const wardrobe = v.items.find((i) => {
    const p = getProduct(i.productId, project);
    return p?.model === 'case' && p.ergo === 'wardrobe';
  });

  return (
    <div className="insp-stack">
      <div className="insp-header">
        <div className="insp-eyebrow">공간 마감</div>
        <h4>{project.name.replace(/\s*\(.*\)$/, '')}</h4>
      </div>

      <div className="insp-section">
        <div className="insp-label-row">
          <span className="insp-label">바닥재</span>
          <select className="paste-zone-sel" value={roomId} onChange={(e) => setRoomId(e.target.value)} aria-label="방 선택">
            <option value="">모든 방</option>
            {project.plan.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {f.roomFloors[r.id] ? ' ·' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="finish-grid">
          {FLOORS.map((fl) => (
            <button
              key={fl.v}
              className={'finish-btn' + (curFloor.kind === fl.v ? ' on' : '')}
              onClick={() =>
                mutateVersion((vv) => {
                  if (roomId) vv.finishes.roomFloors[roomId] = { kind: fl.v, color: fl.c };
                  else vv.finishes.floor = { kind: fl.v, color: fl.c };
                })
              }
            >
              <span className="finish-chip" style={{ background: fl.c }} />
              <span>{fl.l}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-label">벽지 컬러</div>
        <div className="swatch-row">
          {WALLS.map((w) => (
            <button
              key={w.hex}
              className={'swatch-btn' + (f.wallColor === w.hex ? ' on' : '')}
              style={{ background: w.hex }}
              title={w.name}
              aria-label={w.name}
              onClick={() => mutateVersion((vv) => (vv.finishes.wallColor = w.hex))}
            />
          ))}
          <label className="swatch-custom" title="직접 색상 선택">
            <input type="color" value={f.wallColor} onChange={(e) => mutateVersion((vv) => (vv.finishes.wallColor = e.target.value), false)} />+
          </label>
        </div>
        {moodColors.length > 0 && (
          <div className="mood-swatch-strip">
            <span className="mini-cap">무드보드 추출</span>
            <div className="swatch-row">
              {moodColors.slice(0, 10).map((hex) => (
                <button
                  key={hex}
                  className={'swatch-btn sm' + (f.wallColor === hex ? ' on' : '')}
                  style={{ background: hex }}
                  title={`벽지에 적용 (${hex})`}
                  onClick={() => mutateVersion((vv) => (vv.finishes.wallColor = hex))}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="insp-section">
        <div className="insp-label-row">
          <span className="insp-label">천장 높이</span>
          <b className="mono" style={{ fontSize: 12 }}>
            {Math.round(project.plan.ceiling)} cm
          </b>
        </div>
        <input
          type="range"
          min={210}
          max={300}
          step={1}
          value={project.plan.ceiling}
          onPointerDown={() => useStore.getState().checkpoint()}
          onChange={(e) => mutate((p) => (p.plan.ceiling = +e.target.value), false)}
        />
      </div>

      {(doors.length > 0 || wardrobe) && (
        <div className="insp-section">
          <div className="insp-label">
            <DoorOpen size={12} /> 개폐 시뮬레이션
          </div>
          <div className="seg-grid-2">
            {doors.map((o) => {
              const open = !!f.doorsOpen?.[o.id];
              return (
                <button
                  key={o.id}
                  className={'toggle-pill' + (open ? ' on' : '')}
                  onClick={() => mutateVersion((vv) => (vv.finishes.doorsOpen = { ...(vv.finishes.doorsOpen ?? {}), [o.id]: !open }), false)}
                >
                  <span>{doorName(o.id, o.isEntry)}</span>
                  <b>{open ? '열림' : '닫힘'}</b>
                </button>
              );
            })}
            {wardrobe && (
              <button
                className={'toggle-pill' + (wardrobe.params?.open ? ' on' : '')}
                onClick={() => updateItems([wardrobe.id], (x) => (x.params = { ...(x.params ?? {}), open: !x.params?.open }), false)}
              >
                <span>붙박이장</span>
                <b>{wardrobe.params?.open ? '열림' : '닫힘'}</b>
              </button>
            )}
          </div>
        </div>
      )}

      {project.info?.planNote && (
        <div className="insp-section">
          <p className="mini-note" style={{ marginTop: 0 }}>{project.info.planNote}</p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ single item (2-tab progressive disclosure)
function swapPlace(it: PlacedItem, from: Product, to: Product) {
  const oldD = (it.dims ?? from.dims).d;
  const { uz } = itemAxes(it.rot);
  const back: [number, number] = [it.x - (uz[0] * oldD) / 2, it.z - (uz[1] * oldD) / 2];
  return { x: back[0] + (uz[0] * to.dims.d) / 2, z: back[1] + (uz[1] * to.dims.d) / 2 };
}

function ItemInspector({ it }: { it: PlacedItem }) {
  const project = useStore((s) => s.project)!;
  const v = activeVersion(project)!;
  const updateItems = useStore((s) => s.updateItems);
  const mutateVersion = useStore((s) => s.mutateVersion);
  const removeSelected = useStore((s) => s.removeSelected);
  const duplicateSelected = useStore((s) => s.duplicateSelected);
  const select = useStore((s) => s.select);
  const notify = useStore((s) => s.notify);
  const issues = useIssues().get(it.id) ?? [];
  const prod = getProduct(it.productId, project);
  const [tab, setTab] = useState<'basic' | 'detail'>('basic');
  const [swapQ, setSwapQ] = useState('');
  const [arr, setArr] = useState({ n: 3, gap: 0, dir: 'right' as 'right' | 'left' | 'front' | 'back' });
  const [ring, setRing] = useState({ chair: 'chair-wishbone', n: 4 });
  const moodColors = moodColorsOf(project);
  const gaps = useMemo(() => sideGaps(project, v, it.id), [project, v, it]);
  if (!prod) return <p className="note">제품 정보를 찾을 수 없어요.</p>;
  const def = MODELS[prod.model];
  const dims = it.dims ?? prod.dims;
  const params = resolveParams(prod, it);
  const mats = resolveMats(prod, it);
  const up = (fn: (x: PlacedItem) => void, history = true) => updateItems([it.id], fn, history);
  const all = [...project.customProducts, ...PRODUCTS];
  const sameCat = all.filter((p) => p.category === prod.category && p.id !== prod.id && (!swapQ || `${p.name} ${p.brand}`.toLowerCase().includes(swapQ.toLowerCase())));
  const listed = (p: Product) => (p.tags?.some((t) => t.endsWith('후보')) ? 1 : 0);
  const ranked = [...sameCat].sort((a, b) => listed(b) - listed(a) || (project.shortlist.includes(b.id) ? 1 : 0) - (project.shortlist.includes(a.id) ? 1 : 0));
  const alts = (it.alts ?? []).map((id) => getProduct(id, project)).filter(Boolean) as Product[];
  const lvl = issues.some((x) => x.level === 'bad') ? 'bad' : issues.length ? 'warn' : 'ok';
  const g = (side: string) => gaps.find((x) => x.side === side);
  const fmtGap = (side: string) => {
    const x = g(side);
    return x ? `${Math.round(x.dist)}` : '–';
  };
  const ceilGap = project.plan.ceiling - (it.y + dims.h);
  const showCeil = ceilGap < 40 || prod.mount === 'wall' || prod.mount === 'ceiling';

  const doSwap = (to: Product) => {
    const pos = swapPlace(it, prod, to);
    up((x) => {
      const prevId = x.productId;
      x.productId = to.id;
      x.label = undefined;
      x.x = pos.x;
      x.z = pos.z;
      x.dims = undefined;
      x.params = undefined;
      x.mats = undefined;
      const set = new Set([...(x.alts ?? []), prevId]);
      set.delete(to.id);
      x.alts = [...set];
    });
    notify(`'${to.name}' (${to.dims.w}×${to.dims.d}cm)로 교체했어요`);
  };

  const toWall = () => {
    const w = nearestWall(project.plan, [it.x, it.z], 600);
    if (!w) return notify('가까운 벽이 없어요');
    const rot = normDeg((Math.atan2(w.n[0], w.n[1]) * 180) / Math.PI);
    const off = w.wall.thickness / 2 + dims.d / 2 + 0.2;
    up((x) => {
      x.rot = rot;
      x.x = w.pt[0] + w.n[0] * off;
      x.z = w.pt[1] + w.n[1] * off;
    });
  };

  const setMount = (m: Mount) => {
    if (m === 'floor') up((x) => (x.y = 0));
    else if (m === 'wall') {
      toWall();
      up((x) => (x.y = Math.max(80, x.y || 120)));
    } else if (m === 'ceiling') up((x) => (x.y = project.plan.ceiling - dims.h));
    else {
      const res = resolveItems(project, v).filter((r) => r.it.id !== it.id && r.prod.mount !== 'ceiling' && r.prod.model !== 'rug');
      const under = res.filter((r) => {
        const [lx, lz] = [it.x - r.it.x, it.z - r.it.z];
        return Math.abs(lx) < Math.max(r.w, r.d) / 2 + 5 && Math.abs(lz) < Math.max(r.w, r.d) / 2 + 5;
      });
      const top = under.reduce((a, r) => Math.max(a, r.y1), 0);
      up((x) => (x.y = top || 74));
      notify(top ? `아래 가구 윗면(${Math.round(top)}cm)에 올렸어요` : '책상 높이(74cm)로 올렸어요');
    }
  };

  const mountNow: Mount = it.y < 1 ? 'floor' : prod.mount === 'ceiling' || it.y + dims.h > project.plan.ceiling - 3 ? 'ceiling' : prod.mount === 'wall' ? 'wall' : 'surface';

  const arrayDup = () => {
    const { ux, uz } = itemAxes(it.rot);
    const step = arr.dir === 'right' || arr.dir === 'left' ? dims.w + arr.gap : dims.d + arr.gap;
    const dir = arr.dir === 'right' ? ux : arr.dir === 'left' ? ([-ux[0], -ux[1]] as const) : arr.dir === 'front' ? uz : ([-uz[0], -uz[1]] as const);
    const ids: string[] = [];
    mutateVersion((vv) => {
      for (let i = 1; i < arr.n; i++) {
        const c: PlacedItem = { ...JSON.parse(JSON.stringify(it)), id: uid('i'), x: it.x + dir[0] * step * i, z: it.z + dir[1] * step * i, locked: false };
        vv.items.push(c);
        ids.push(c.id);
      }
    });
    select([it.id, ...ids]);
  };

  const chairsAround = () => {
    const ch = getProduct(ring.chair, project);
    if (!ch) return;
    const ids: string[] = [];
    const round = params.shape === 'round' || params.shape === 'oval';
    mutateVersion((vv) => {
      const tuck = ch.dims.d * 0.25;
      const slots: { lx: number; lz: number; r: number }[] = [];
      if (round) {
        for (let i = 0; i < ring.n; i++) {
          const a = (i / ring.n) * Math.PI * 2;
          slots.push({ lx: Math.sin(a) * (dims.w / 2 + ch.dims.d / 2 - tuck), lz: Math.cos(a) * (dims.d / 2 + ch.dims.d / 2 - tuck), r: (a * 180) / Math.PI + 180 });
        }
      } else {
        const perSide = Math.max(1, Math.floor(dims.w / (ch.dims.w + 10)));
        for (const s of [1, -1]) for (let k = 0; k < perSide; k++) slots.push({ lx: -dims.w / 2 + (dims.w * (k + 0.5)) / perSide, lz: s * (dims.d / 2 + ch.dims.d / 2 - tuck), r: s > 0 ? 180 : 0 });
        for (const s of [1, -1]) slots.push({ lx: s * (dims.w / 2 + ch.dims.d / 2 - tuck), lz: 0, r: s > 0 ? 270 : 90 });
      }
      for (const sl of slots.slice(0, ring.n)) {
        const [wx, wz] = localToWorld(it.x, it.z, it.rot, sl.lx, sl.lz);
        const id = uid('i');
        vv.items.push({ id, productId: ch.id, x: wx, z: wz, y: 0, rot: normDeg(it.rot + sl.r), status: 'candidate' });
        ids.push(id);
      }
    });
    select([it.id, ...ids]);
  };

  const isTable = prod.model === 'table' && ['table', 'desk'].includes(prod.category);
  const resized = !!it.dims && !prod.custom && prod.brand !== '기본형' && !prod.builtin;

  return (
    <div className="insp-stack">
      <div className="insp-header">
        <div className="insp-meta-line">
          <span>
            {prod.brand} · {catLabel(prod.category)}
            {prod.price ? ` · ${fmtWon(prod.price)}` : ''}
          </span>
          {!it.locked && (
            <select className="status-select" value={it.status ?? 'candidate'} onChange={(e) => up((x) => (x.status = e.target.value as PlacedItem['status']))} aria-label="구매 상태">
              {STATUS.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.l}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="insp-title-row">
          <input
            className="insp-name-input"
            value={it.label ?? prod.name}
            onChange={(e) => up((x) => (x.label = e.target.value && e.target.value !== prod.name ? e.target.value : undefined), false)}
            aria-label="가구 이름"
          />
          <a className="btn-link-icon" href={productSearchUrl(prod)} target="_blank" rel="noreferrer" title="판매처 보기" aria-label="판매처 보기">
            <ExternalLink size={13} />
          </a>
        </div>
        {prod.approx && <span className="badge-approx" style={{ display: 'inline-block', marginTop: 4 }}>근사값 · 구매 전 실측 확인</span>}
      </div>

      {/* Only show banners when there is an actual warning/collision or lock */}
      {lvl !== 'ok' && <div className={'status-banner lvl-' + lvl}>{issues.map((x) => x.msg).join(' · ')}</div>}
      {it.locked && (
        <div className="status-banner lvl-warn" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Lock size={12} /> 고정됨 · 이동하려면 고정을 해제하세요
        </div>
      )}

      {/* 2-Tab Progressive Disclosure */}
      <div className="insp-seg-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'basic'} className={tab === 'basic' ? 'on' : ''} onClick={() => setTab('basic')}>
          기본 · 소재
        </button>
        <button role="tab" aria-selected={tab === 'detail'} className={tab === 'detail' ? 'on' : ''} onClick={() => setTab('detail')}>
          위치 · 세부
        </button>
      </div>

      {tab === 'basic' ? (
        <>
          <div className={'gap-readout' + (showCeil ? ' cols-5' : ' cols-4')}>
            <div>
              <span>좌</span>
              <b className="mono">{fmtGap('left')}</b>
            </div>
            <div>
              <span>우</span>
              <b className="mono">{fmtGap('right')}</b>
            </div>
            <div>
              <span>앞</span>
              <b className="mono">{fmtGap('front')}</b>
            </div>
            <div>
              <span>뒤</span>
              <b className="mono">{fmtGap('back')}</b>
            </div>
            {showCeil && (
              <div>
                <span>천장</span>
                <b className="mono">{Math.round(ceilGap)}</b>
              </div>
            )}
          </div>

          <div className="insp-section" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
            <div className="insp-label-row">
              <span className="insp-label">치수 (cm)</span>
              {it.dims && (
                <button className="btn-xs" onClick={() => up((x) => (x.dims = undefined))}>
                  원래 크기
                </button>
              )}
            </div>
            <div className="dim-grid-3">
              {(
                [
                  ['w', 'W 가로'],
                  ['d', 'D 깊이'],
                  ['h', 'H 높이'],
                ] as const
              ).map(([k, l]) => (
                <label key={k}>
                  <span>{l}</span>
                  <Num value={dims[k]} min={0.5} onChange={(val) => up((x) => (x.dims = { ...dims, [k]: val }))} />
                </label>
              ))}
            </div>
            {resized && <div className="callout warn">실제 판매 제품 치수와 다르게 조정됨</div>}
          </div>

          {def && Object.keys(def.slots).length > 0 && (
            <div className="insp-section">
              <div className="insp-label-row">
                <span className="insp-label">소재 · 컬러</span>
                {it.mats && (
                  <button className="btn-xs" onClick={() => up((x) => (x.mats = undefined))}>
                    초기화
                  </button>
                )}
              </div>
              {prod.variants && (
                <div className="mat-chips">
                  {prod.variants.map((vv) => (
                    <button
                      key={vv.name}
                      className={'chip sm' + (JSON.stringify(it.mats ?? prod.mats) === JSON.stringify(vv.mats) ? ' active' : '')}
                      onClick={() => up((x) => (x.mats = { ...vv.mats }))}
                    >
                      <span className="color-dot" style={{ background: Object.values(vv.mats)[0]?.color }} />
                      {vv.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid2">
                {Object.entries(def.slots).map(([k, s]) => (
                  <MatInput key={k} label={s.label} value={mats[k]} palette={moodColors.slice(0, 10)} onChange={(m) => up((x) => (x.mats = { ...(x.mats ?? {}), [k]: m }))} />
                ))}
              </div>
            </div>
          )}

          {prod.model === 'frame' && (
            <div className="insp-section">
              <div className="insp-label">액자 이미지</div>
              <select className="inp" value={it.imageRef ?? ''} onChange={(e) => up((x) => (x.imageRef = e.target.value || undefined))}>
                <option value="">(색만 표시)</option>
                {project.moodboard
                  .filter((r) => r.kind === 'image')
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title || '이미지'}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {(alts.length > 0 || ranked.length > 0) && !prod.builtin && (
            <div className="insp-section">
              <div className="insp-label-row">
                <span className="insp-label">이 자리 후보 교체</span>
                <span className="mini-cap" style={{ margin: 0 }}>뒷면 유지</span>
              </div>
              {alts.length > 0 && (
                <div className="mat-chips">
                  {alts.map((a) => (
                    <button key={a.id} className="chip sm" onClick={() => doSwap(a)} title={`${a.dims.w}×${a.dims.d}×${a.dims.h}`}>
                      {a.name.length > 14 ? a.name.slice(0, 14) + '…' : a.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="search-box" style={{ height: 28, marginBottom: 6 }}>
                <input placeholder={`${catLabel(prod.category)} ${sameCat.length}개 검색`} value={swapQ} onChange={(e) => setSwapQ(e.target.value)} />
              </div>
              <div className="swap-list-hairline">
                {ranked.slice(0, 24).map((cand) => (
                  <button key={cand.id} className="swap-row" onClick={() => doSwap(cand)}>
                    <span className="color-dot" style={{ background: Object.values(resolveMats(cand))[0]?.color }} />
                    <div className="swap-card-info">
                      <div className="swap-name">{cand.name}</div>
                      <div className="swap-sub mono">
                        {cand.brand} · {cand.dims.w}×{cand.dims.d}
                        {cand.price ? ` · ${fmtWon(cand.price)}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="insp-section" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
            <div className="insp-label">배치 기준 · 띄우기</div>
            <div className="seg-grid-4">
              {(
                [
                  ['floor', '바닥'],
                  ['surface', '위'],
                  ['wall', '벽'],
                  ['ceiling', '천장'],
                ] as [Mount, string][]
              ).map(([m, label]) => (
                <button key={m} className={'seg-btn' + (mountNow === m ? ' on' : '')} disabled={it.locked} onClick={() => setMount(m)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="elev-control">
              <div className="insp-label-row">
                <span className="mini-cap" style={{ margin: 0 }}>바닥에서 높이</span>
                <b className="mono" style={{ fontSize: 12 }}>{Math.round(it.y)} cm</b>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, Math.round(project.plan.ceiling - dims.h))}
                step={1}
                disabled={it.locked}
                value={Math.round(it.y)}
                onPointerDown={() => useStore.getState().checkpoint()}
                onChange={(e) => up((x) => (x.y = +e.target.value), false)}
                style={{ marginTop: 4 }}
              />
              <div className="quick-elev-row">
                {(
                  [
                    [0, '바닥 0'],
                    [74, '책상 74'],
                    [85, '상판 85'],
                    [120, '벽 120'],
                  ] as [number, string][]
                ).map(([h, l]) => (
                  <button key={h} className="btn-xs" disabled={it.locked} onClick={() => up((x) => (x.y = h))}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="insp-section">
            <div className="insp-label-row">
              <span className="insp-label">회전 · 좌표</span>
              <b className="mono" style={{ fontSize: 12 }}>{Math.round(it.rot)}°</b>
            </div>
            <div className="rot-btn-row">
              <button className="btn-sm" disabled={it.locked} onClick={() => up((x) => (x.rot = normDeg(x.rot + 90)))}>
                <RotateCcw size={11} /> 90°
              </button>
              <button className="btn-sm" disabled={it.locked} onClick={() => up((x) => (x.rot = normDeg(x.rot + 15)))}>
                −15°
              </button>
              <button className="btn-sm" disabled={it.locked} onClick={() => up((x) => (x.rot = normDeg(x.rot - 15)))}>
                +15°
              </button>
              <button className="btn-sm" disabled={it.locked} onClick={() => up((x) => (x.rot = normDeg(x.rot - 90)))}>
                <RotateCw size={11} /> 90°
              </button>
            </div>
            <div className="dim-grid-3" style={{ marginTop: 8 }}>
              <label>
                <span>X</span>
                <Num value={it.x} onChange={(val) => up((x) => (x.x = val))} />
              </label>
              <label>
                <span>Z</span>
                <Num value={it.z} onChange={(val) => up((x) => (x.z = val))} />
              </label>
              <label>
                <span>회전 °</span>
                <Num value={it.rot} step={15} onChange={(val) => up((x) => (x.rot = normDeg(val)))} />
              </label>
            </div>
            <div className="seg-grid-2" style={{ marginTop: 8 }}>
              <button className="btn-xs" disabled={it.locked} onClick={toWall}>
                벽에 밀착
              </button>
              <button className={'btn-xs' + (it.mirror ? ' on' : '')} disabled={it.locked} onClick={() => up((x) => (x.mirror = !x.mirror))}>
                <FlipHorizontal size={11} /> 좌우 반전
              </button>
            </div>
          </div>

          {def && def.params.length > 0 && (
            <div className="insp-section">
              <div className="insp-label-row">
                <span className="insp-label">형태 세부</span>
                {it.params && (
                  <button className="btn-xs" onClick={() => up((x) => (x.params = undefined))}>
                    초기화
                  </button>
                )}
              </div>
              <div className="grid2">
                {def.params
                  .filter((pd) => paramVisible(pd, params))
                  .map((pd) => (
                    <ParamInput key={pd.key} def={pd} value={params[pd.key]} onChange={(val) => up((x) => (x.params = { ...(x.params ?? {}), [pd.key]: val }))} />
                  ))}
              </div>
              {prod.model === 'appliance' && params.kind === 'fridge' && params.enclosure === true && <FridgeFit dims={dims} params={params} />}
            </div>
          )}

          {!it.locked && (
            <div className="insp-section">
              <div className="insp-label">배치 도구</div>
              <div className="mini-cap">나란히 복제</div>
              <div className="row" style={{ margin: '4px 0 0' }}>
                <div style={{ width: 58 }}>
                  <Num value={arr.n} min={2} max={20} unit="개" onChange={(n) => setArr({ ...arr, n })} />
                </div>
                <div style={{ width: 68 }}>
                  <Num value={arr.gap} unit="cm" onChange={(gap) => setArr({ ...arr, gap })} title="간격" />
                </div>
                <select className="inp" style={{ width: 'auto', flex: 1 }} value={arr.dir} onChange={(e) => setArr({ ...arr, dir: e.target.value as typeof arr.dir })}>
                  <option value="right">오른쪽</option>
                  <option value="left">왼쪽</option>
                  <option value="front">앞</option>
                  <option value="back">뒤</option>
                </select>
                <button className="btn-xs primary" onClick={arrayDup}>
                  실행
                </button>
              </div>
              {isTable && (
                <>
                  <div className="mini-cap" style={{ marginTop: 10 }}>
                    의자 둘러놓기
                  </div>
                  <div className="row" style={{ margin: '4px 0 0' }}>
                    <select className="inp" style={{ flex: 1, minWidth: 100 }} value={ring.chair} onChange={(e) => setRing({ ...ring, chair: e.target.value })}>
                      {all
                        .filter((p) => p.category === 'chair' && p.model !== 'lounge' && p.model !== 'bench')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    <div style={{ width: 54 }}>
                      <Num value={ring.n} min={1} max={12} unit="개" onChange={(n) => setRing({ ...ring, n })} />
                    </div>
                    <button className="btn-xs primary" onClick={chairsAround}>
                      놓기
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Slim single-row utility footer (mirrors canvas selection bar for touch/mobile parity) */}
      <div className="insp-slim-foot">
        <button className="btn-link-icon" onClick={() => testWithHuman(it, prod)} title="사람 아바타로 확인" aria-label="사람 체크">
          <UserCheck size={14} />
        </button>
        <button className="btn-link-icon" onClick={duplicateSelected} title="복제 (Cmd+D)" aria-label="복제">
          <Copy size={14} />
        </button>
        <button className="btn-link-icon" onClick={() => up((x) => (x.locked = !x.locked))} title={it.locked ? '고정 해제' : '고정'} aria-label="고정 전환">
          {it.locked ? <Unlock size={14} /> : <Lock size={14} />}
        </button>
        <button className="btn-link-icon" onClick={() => up((x) => (x.hidden = true))} title="숨기기 (H)" aria-label="숨기기">
          <EyeOff size={14} />
        </button>
        <button className="btn-link-icon danger" onClick={removeSelected} disabled={it.locked} title="삭제 (Delete)" aria-label="삭제">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ multi selection
function MultiInspector({ ids }: { ids: string[] }) {
  const project = useStore((s) => s.project)!;
  const v = activeVersion(project)!;
  const updateItems = useStore((s) => s.updateItems);
  const removeSelected = useStore((s) => s.removeSelected);
  const duplicateSelected = useStore((s) => s.duplicateSelected);
  const res = resolveItems(project, v).filter((r) => ids.includes(r.it.id));
  const total = res.reduce((a, r) => a + (r.prod.price ?? 0), 0);
  const ext = (r: (typeof res)[number]) => {
    const xs = r.poly.map((p) => p[0]);
    const zs = r.poly.map((p) => p[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  };
  const align = (mode: 'left' | 'right' | 'top' | 'bottom' | 'cx' | 'cz') => {
    const e = res.map((r) => ({ r, e: ext(r) }));
    const target =
      mode === 'left'
        ? Math.min(...e.map((x) => x.e.minX))
        : mode === 'right'
          ? Math.max(...e.map((x) => x.e.maxX))
          : mode === 'top'
            ? Math.min(...e.map((x) => x.e.minZ))
            : mode === 'bottom'
              ? Math.max(...e.map((x) => x.e.maxZ))
              : mode === 'cx'
                ? e.reduce((a, x) => a + x.r.it.x, 0) / e.length
                : e.reduce((a, x) => a + x.r.it.z, 0) / e.length;
    const map = new Map(e.map((x) => [x.r.it.id, x.e]));
    updateItems(ids, (it) => {
      const ee = map.get(it.id);
      if (!ee || it.locked) return;
      if (mode === 'left') it.x += target - ee.minX;
      if (mode === 'right') it.x += target - ee.maxX;
      if (mode === 'top') it.z += target - ee.minZ;
      if (mode === 'bottom') it.z += target - ee.maxZ;
      if (mode === 'cx') it.x = target;
      if (mode === 'cz') it.z = target;
    });
  };
  const distribute = (axis: 'x' | 'z') => {
    const sorted = [...res].sort((a, b) => (axis === 'x' ? a.it.x - b.it.x : a.it.z - b.it.z));
    if (sorted.length < 3) return;
    const a = axis === 'x' ? sorted[0].it.x : sorted[0].it.z;
    const b = axis === 'x' ? sorted[sorted.length - 1].it.x : sorted[sorted.length - 1].it.z;
    const pos = new Map(sorted.map((r, i) => [r.it.id, a + ((b - a) * i) / (sorted.length - 1)]));
    updateItems(ids, (it) => {
      const p = pos.get(it.id);
      if (p == null || it.locked) return;
      if (axis === 'x') it.x = p;
      else it.z = p;
    });
  };
  const grouped = res.length > 0 && res.every((r) => r.it.groupId && r.it.groupId === res[0].it.groupId);
  return (
    <div className="insp-stack">
      <div className="insp-header">
        <div className="insp-eyebrow">다중 선택</div>
        <h4 className="mono">
          {ids.length}개 · {fmtWon(total)}
        </h4>
      </div>
      <div className="insp-section">
        <div className="insp-label">정렬 · 분배</div>
        <div className="seg-grid-3">
          <button className="seg-btn" onClick={() => align('left')}>왼쪽</button>
          <button className="seg-btn" onClick={() => align('right')}>오른쪽</button>
          <button className="seg-btn" onClick={() => align('top')}>위</button>
          <button className="seg-btn" onClick={() => align('bottom')}>아래</button>
          <button className="seg-btn" onClick={() => align('cx')}>
            <AlignCenterVertical size={11} /> 가로
          </button>
          <button className="seg-btn" onClick={() => align('cz')}>
            <AlignCenterHorizontal size={11} /> 세로
          </button>
        </div>
        <div className="seg-grid-2" style={{ marginTop: 6 }}>
          <button className="seg-btn" onClick={() => distribute('x')}>가로 균등</button>
          <button className="seg-btn" onClick={() => distribute('z')}>세로 균등</button>
        </div>
      </div>
      <div className="insp-footer-actions">
        <button className="btn-secondary" onClick={() => updateItems(ids, (it) => (it.groupId = grouped ? undefined : (res[0]?.it.id ?? 'g') + 'g'))}>
          <Group size={13} /> {grouped ? '그룹 풀기' : '그룹 묶기'}
        </button>
        <button className="btn-secondary" onClick={() => updateItems(ids, (it) => (it.locked = !res.every((r) => r.it.locked)))}>
          <Lock size={13} /> 고정 전환
        </button>
        <button className="btn-secondary" onClick={duplicateSelected}>
          <Copy size={13} /> 복제
        </button>
        <button className="btn-danger" onClick={removeSelected}>
          <Trash2 size={13} /> 삭제
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ person avatar
const POSES: { v: Pose; l: string }[] = [
  { v: 'stand', l: '서기' },
  { v: 'walk', l: '걷기' },
  { v: 'sit', l: '앉기' },
  { v: 'lie', l: '눕기' },
  { v: 'reach', l: '팔 뻗기' },
];

function PersonInspector({ h }: { h: PlacedPerson }) {
  const project = useStore((s) => s.project)!;
  const updateItems = useStore((s) => s.updateItems);
  const removeSelected = useStore((s) => s.removeSelected);
  const prof = project.profiles.find((p) => p.id === h.profileId) ?? project.profiles[0];
  const a = anthro(prof.height, prof.shoulder);
  const up = (fn: (x: PlacedPerson) => void) => updateItems([h.id], fn as unknown as (x: PlacedItem) => void);
  return (
    <div className="insp-stack">
      <div className="insp-header">
        <div className="insp-eyebrow">사람 아바타</div>
        <h4>
          {prof.name} · <span className="mono">{prof.height}cm</span>
        </h4>
      </div>
      <div className="insp-section">
        <div className="insp-label">자세</div>
        <div className="seg-grid-5">
          {POSES.map((p) => (
            <button
              key={p.v}
              className={'seg-btn' + (h.pose === p.v ? ' on' : '')}
              onClick={() => up((x) => Object.assign(x, { pose: p.v, y: p.v === 'sit' ? x.y || 45 : p.v === 'lie' ? x.y || 42 : 0 }))}
            >
              {p.l}
            </button>
          ))}
        </div>
        <div className="dim-grid-3" style={{ marginTop: 8 }}>
          <label>
            <span>회전 °</span>
            <Num value={h.rot} step={15} onChange={(v) => up((x) => (x.rot = normDeg(v)))} />
          </label>
          {(h.pose === 'sit' || h.pose === 'lie') && (
            <label>
              <span>{h.pose === 'sit' ? '좌면 높이' : '누운 면'}</span>
              <Num value={h.y} onChange={(v) => up((x) => (x.y = v))} />
            </label>
          )}
          <label>
            <span>인물</span>
            <select className="inp" value={h.profileId} onChange={(e) => up((x) => (x.profileId = e.target.value))}>
              {project.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="anthro-grid">
        <div>
          <span>눈높이</span>
          <b className="mono">{Math.round(h.pose === 'sit' ? (h.y || 45) + a.sitEyeH : a.eyeH)}cm</b>
        </div>
        <div>
          <span>어깨폭</span>
          <b className="mono">{Math.round(a.shoulderW)}cm</b>
        </div>
        <div>
          <span>손 높이</span>
          <b className="mono">{Math.round(a.reachUp)}cm</b>
        </div>
      </div>
      <div className="insp-section">
        <button className="btn-danger full-width" onClick={removeSelected}>
          <Trash2 size={13} /> 아바타 삭제
        </button>
      </div>
    </div>
  );
}

function FridgeFit({ dims, params }: { dims: { w: number; d: number; h: number }; params: Record<string, ParamValue> }) {
  const L = fridgeEnclosureLayout(dims.w, dims.d, dims.h, params);
  const cm = (v: number) => `${Math.round(v * 10) / 10}cm`;
  const problems = [
    !L.fitsW && `폭: 좌우 틈이 각 ${cm(L.sideGap)}예요 (최소 0.4cm 필요)`,
    !L.fitsH && `높이: 상단 여유가 ${cm(L.topGap)}예요 (최소 2cm 필요)`,
    !L.fitsD && `깊이: 냉장고가 장보다 ${cm(L.fd - dims.d)} 깊어요`,
  ].filter(Boolean) as string[];
  return (
    <>
      <p className="note">
        냉장고 {L.fw}×{L.fh}×{L.fd}cm · 좌우 틈 각 {cm(L.sideGap)} · {L.hasUpper ? `상부 수납칸 안쪽 높이 ${cm(L.upperClear)}` : '상부 수납칸 없음'}
      </p>
      {problems.length > 0 && <div className="callout warn">냉장고가 장에 안 들어가요. {problems.join(' · ')}</div>}
    </>
  );
}
