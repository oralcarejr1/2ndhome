import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Columns2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Footprints,
  Info,
  Lock,
  MapPin,
  Plus,
  Save,
  Trash2,
  Upload,
  User,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { catLabel } from '../catalog/categories';
import { productSearchUrl } from '../catalog/products';
import { computeIssues, resolveItems } from '../lib/analysis';
import { anthro, ideals } from '../lib/ergonomics';
import { fmtWon, uid } from '../lib/geometry';
import { requestCamera } from '../scene/sceneState';
import { putBlob } from '../store/persistence';
import { activeVersion, getProduct, syncText, useStore } from '../store/store';
import type { Pose, Version } from '../types';
import { mainAvatar, runScenario, setPose, updateAvatar, type Scenario } from './actions';
import { exportProject, layoutCode, parseLayoutCode } from './backup';
import { Confirm, dataUrlToBlob, download, Modal, Num } from './common';
import { ergoReport, scoreClass, useErgo } from './ergo';

// ------------------------------------------------------------------ 배치목록
export function LayoutListPanel() {
  const project = useStore((s) => s.project)!;
  const v = activeVersion(project)!;
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const updateItems = useStore((s) => s.updateItems);
  const mutate = useStore((s) => s.mutate);
  const mutateVersion = useStore((s) => s.mutateVersion);
  const rep = useErgo();
  const issues = useMemo(() => computeIssues(project, v), [project.plan, v, project.customProducts]);
  const furniture = v.items.filter((i) => !i.locked);
  const builtins = v.items.filter((i) => i.locked);
  const budget = project.budget ?? 0;

  const exportCsv = () => {
    const map = new Map<string, { n: number; id: string }>();
    for (const it of furniture) {
      const m = map.get(it.productId) ?? { n: 0, id: it.productId };
      m.n++;
      map.set(it.productId, m);
    }
    const head = ['분류', '제품', '브랜드', 'W', 'D', 'H', '수량', '참고가', '합계', '링크'];
    const rows = [...map.values()].map(({ id, n }) => {
      const p = getProduct(id, project)!;
      return [catLabel(p.category), p.name, p.brand, p.dims.w, p.dims.d, p.dims.h, n, p.price ?? '', (p.price ?? 0) * n || '', productSearchUrl(p)];
    });
    const csv = '﻿' + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    void download(`${project.name}-${v.name}-구매목록.csv`, csv, 'text/csv');
  };

  const row = (id: string) => {
    const it = v.items.find((x) => x.id === id)!;
    const p = getProduct(it.productId, project);
    const iss = issues.get(it.id);
    const lvl = iss?.some((x) => x.level === 'bad') ? 'bad' : iss?.length ? 'warn' : '';
    const d = it.dims ?? p?.dims;
    return (
      <div
        key={it.id}
        className={`placed-row${selection.includes(it.id) ? ' sel' : ''}${lvl ? ' lvl-' + lvl : ''}${it.hidden ? ' muted' : ''}`}
        onClick={() => {
          select([it.id]);
          requestCamera('focus', { x: it.x, z: it.z });
        }}
      >
        <span className="color-dot" style={{ background: Object.values(it.mats ?? p?.mats ?? {})[0]?.color ?? '#ccc' }} />
        <div className="placed-info">
          <div className="placed-name">
            {it.locked && <Lock size={11} className="ic-lock" />}
            {it.label || p?.name}
          </div>
          <div className="placed-sub mono">
            {d ? `${Math.round(d.w)}×${Math.round(d.d)}×H${Math.round(d.h)}` : ''}
            {p?.price && !it.locked ? ` · ${fmtWon(p.price)}` : ''}
            {it.y > 1 ? ` · 바닥+${Math.round(it.y)}` : ''}
          </div>
          {iss && iss.length > 0 && <div className={'placed-warn lvl-' + lvl}>{iss.map((x) => x.msg).join(' · ')}</div>}
        </div>
        <div className="placed-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-xs" title={it.hidden ? '보이기' : '숨기기'} onClick={() => updateItems([it.id], (x) => (x.hidden = !x.hidden))}>
            {it.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          {!it.locked && (
            <button className="icon-xs danger" title="삭제" onClick={() => mutateVersion((vv) => (vv.items = vv.items.filter((x) => x.id !== it.id)))}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="panel-scroll">
      <div className="budget-summary-card">
        <div>
          <span>예상 합계</span>
          <b className="mono">{fmtWon(rep?.total ?? 0)}</b>
        </div>
        <div>
          <span>배치 가구</span>
          <b className="mono">{furniture.length}개</b>
        </div>
        <div>
          <span>바닥 점유</span>
          <b className="mono">{(rep?.floorArea ?? 0).toFixed(1)}㎡</b>
        </div>
        <div>
          <span>겹침·간섭</span>
          <b className={'mono ' + ((rep?.issues ?? 0) ? 'sc-bad' : 'sc-good')}>{rep?.issues ?? 0}건</b>
        </div>
      </div>
      <div className="list-group-head">가구 ({furniture.length})</div>
      <div className="placed-list">{furniture.map((i) => row(i.id))}</div>
      {!furniture.length && <div className="empty-hint">가구 후보 탭에서 배치하기를 눌러 시작하세요.</div>}
      <div className="list-group-head" style={{ marginTop: 14 }}>
        붙박이·고정 ({builtins.length})
      </div>
      <div className="placed-list">{builtins.map((i) => row(i.id))}</div>
      <div className="insp-section">
        <div className="insp-label">예산</div>
        <div className="inline-field">
          <span>목표 예산</span>
          <div style={{ width: 140 }}>
            <Num value={budget} unit="원" step={100000} onChange={(b) => mutate((p) => (p.budget = b))} />
          </div>
        </div>
        {budget > 0 && rep && (
          <div className={'status-banner ' + (rep.total > budget ? 'lvl-bad' : 'lvl-ok')}>
            {rep.total > budget ? `${fmtWon(rep.total - budget)} 초과` : `${fmtWon(budget - rep.total)} 남음`}
          </div>
        )}
        <button className="btn-secondary full-width" onClick={exportCsv}>
          <Download size={14} /> 구매 목록 CSV 저장
        </button>
        <p className="mini-note">가격은 참고용 대략값이에요. 상태가 '이미 있음'인 가구는 합계에서 빠져요.</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 사람·동선
const POSES: { id: Pose; label: string }[] = [
  { id: 'stand', label: '서기' },
  { id: 'walk', label: '걷기' },
  { id: 'sit', label: '앉기' },
  { id: 'lie', label: '눕기' },
  { id: 'reach', label: '팔 뻗기' },
];

const SCENARIOS: [Scenario, string][] = [
  ['entry', '🚪 현관에서 들어올 때'],
  ['sofa', '🛋️ 소파에 앉았을 때'],
  ['bed', '🛏️ 침대에 누웠을 때'],
  ['desk', '💻 붙박이 책상 앉기'],
  ['kitchen', '🍳 주방에서 요리할 때'],
  ['wardrobe', '👔 붙박이장 옷 꺼내기'],
];

export function HumanPanel() {
  const project = useStore((s) => s.project)!;
  const v = activeVersion(project)!;
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const show = useStore((s) => s.show);
  const setShow = useStore((s) => s.setShow);
  const setProfiles = useStore((s) => s.setProfiles);
  const mutate = useStore((s) => s.mutate);
  const select = useStore((s) => s.select);
  const rep = useErgo();
  const prof = project.profiles.find((p) => p.id === project.activeProfileId) ?? project.profiles[0];
  const a = anthro(prof.height, prof.shoulder);
  const idl = ideals(prof.height, prof.shoulder);
  const av = mainAvatar(project, v);
  const eyeCm = Math.round(av?.pose === 'sit' ? (av.y || 45) + a.sitEyeH : av?.pose === 'lie' ? (av.y || 42) + 22 : a.eyeH);
  const setHeight = (h: number) => setProfiles((ps) => (ps.find((x) => x.id === prof.id)!.height = h));
  const score = rep?.score ?? 100;
  const levelOf = (l: string) => (l === 'ok' ? 'good' : l === 'info' ? 'good' : l);

  return (
    <div className="panel-scroll">
      <div className="ergo-score-card">
        <div className="ergo-score-ring" data-level={score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad'}>
          <span className="ergo-score-num">{score}</span>
          <span className="ergo-score-sub">/ 100</span>
        </div>
        <div>
          <div className="ergo-score-title">
            실제 사람({prof.height}cm) 사용성 점수
          </div>
          <div className="ergo-score-stats">
            <span>
              개방 바닥 <b>{Math.round((rep?.usableFloorRatio ?? 1) * 100)}%</b>
            </span>
            <span>
              최소 통로 <b>{rep?.minPassageCm != null ? `${rep.minPassageCm}cm` : '여유'}</b>
            </span>
          </div>
        </div>
      </div>

      <div className="insp-section" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
        {view === 'walk' ? (
          <button className="btn-primary full-width pov-active-btn" onClick={() => setView('3d')}>
            <Eye size={15} /> 1인칭 시점 종료 → 3D 전체 보기
          </button>
        ) : (
          <button className="btn-primary full-width" onClick={() => setView('walk')}>
            <Footprints size={15} /> 내 눈높이({Math.round(a.eyeH)}cm)로 1인칭 걸어보기
          </button>
        )}
        <p className="mini-note">
          1인칭 모드에서 <b>W·A·S·D</b>(또는 화살표)로 걸어 다니고, 마우스를 끌어 둘러보세요. 벽·가구에 부딪혀요.
        </p>
      </div>

      <div className="insp-section">
        <div className="insp-label-row">
          <span className="insp-label">
            <User size={13} /> 3D 사람 아바타
          </span>
          <label className="chk-inline">
            <input type="checkbox" checked={show.people && !!av} onChange={(e) => (av ? setShow({ people: e.target.checked }) : updateAvatar({}))} />
            표시
          </label>
        </div>
        <div className="insp-label-row" style={{ marginTop: 8 }}>
          <span className="mini-cap">
            신장 (키) — {prof.name}
          </span>
          <b className="mono">{prof.height} cm</b>
        </div>
        <input type="range" min={140} max={200} step={1} value={prof.height} onChange={(e) => setHeight(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--ink)' }} />
        <div className="quick-elev-row">
          {[160, 168, 175, 182].map((cm) => (
            <button key={cm} className={'btn-xs' + (prof.height === cm ? ' on' : '')} onClick={() => setHeight(cm)}>
              {cm}cm
            </button>
          ))}
        </div>
        <div className="anthro-grid">
          <div>
            <span>눈높이</span>
            <b>{eyeCm}cm</b>
          </div>
          <div>
            <span>어깨폭</span>
            <b>{Math.round(a.shoulderW)}cm</b>
          </div>
          <div>
            <span>손 닿는 높이</span>
            <b>{Math.round(a.reachUp)}cm</b>
          </div>
        </div>
        <div className="insp-label" style={{ marginTop: 10 }}>
          자세 전환 (3D에서 직접 끌어 옮기기)
        </div>
        <div className="seg-grid-5">
          {POSES.map((p) => (
            <button key={p.id} className={'seg-btn' + (av?.pose === p.id ? ' on' : '')} onClick={() => setPose(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="anthro-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <div>
            <span>의자 좌판</span>
            <b>{Math.round(idl.chairSeat)}</b>
          </div>
          <div>
            <span>책상</span>
            <b>{Math.round(idl.deskH)}</b>
          </div>
          <div>
            <span>조리대</span>
            <b>{Math.round(idl.counterH)}</b>
          </div>
          <div>
            <span>통로 최소</span>
            <b>{Math.round(idl.passMin)}</b>
          </div>
        </div>
        <p className="mini-note">키에 맞는 권장 높이(cm) — 아래 진단이 이 값으로 계산돼요.</p>
      </div>

      <div className="insp-section">
        <div className="insp-label">생활 동선 시점 바로가기 (클릭 시 1인칭 이동)</div>
        <div className="scenario-grid">
          {SCENARIOS.map(([id, label]) => (
            <button key={id} className="scenario-btn" onClick={() => runScenario(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-label">동선 · 사용 공간 레이어</div>
        <label className="chk-row">
          <input type="checkbox" checked={show.heatmap} onChange={(e) => setShow({ heatmap: e.target.checked })} />
          <span>바닥을 통로 폭으로 색칠 (빨강 = 몸이 못 지나감, 보라 = 현관에서 못 가는 곳)</span>
        </label>
        <label className="chk-row">
          <input type="checkbox" checked={show.clearance} onChange={(e) => setShow({ clearance: e.target.checked })} />
          <span>문·서랍 열기, 의자 빼기에 필요한 사용 공간</span>
        </label>
      </div>

      <div className="insp-section">
        <div className="insp-label">항목별 사용성 자동 진단</div>
        <div className="findings-list">
          {(rep?.findings ?? [])
            .slice()
            .sort((x, y) => ({ bad: 0, warn: 1, info: 2, ok: 3 })[x.level] - { bad: 0, warn: 1, info: 2, ok: 3 }[y.level])
            .map((f) => {
              const it = f.itemId ? v.items.find((i) => i.id === f.itemId) : undefined;
              const st = levelOf(f.level);
              return (
                <div
                  key={f.id}
                  className={`finding-card st-${st}${it ? ' clickable' : ''}`}
                  onClick={() => {
                    if (!it) return;
                    select([it.id]);
                    if (view === 'walk') setView('3d');
                    requestCamera('focus', { x: it.x, z: it.z });
                  }}
                >
                  <div className="finding-head">
                    {st === 'good' && (f.level === 'info' ? <Info size={15} className="ic-good" /> : <CheckCircle2 size={15} className="ic-good" />)}
                    {st === 'warn' && <AlertTriangle size={15} className="ic-warn" />}
                    {st === 'bad' && <XCircle size={15} className="ic-bad" />}
                    <span>{f.group}</span>
                    {it && <MapPin size={12} className="ic-pin" />}
                  </div>
                  <div className="finding-title">{f.title}</div>
                  <div className="finding-detail">{f.detail}</div>
                </div>
              );
            })}
        </div>
      </div>

      <details className="insp-section more">
        <summary>
          <User size={13} /> 함께 사는 사람 · 반입 조건
        </summary>
        {project.profiles.map((p) => (
          <div key={p.id} className="row">
            <input type="color" value={p.color} onChange={(e) => setProfiles((ps) => (ps.find((x) => x.id === p.id)!.color = e.target.value))} />
            <input className="inp" style={{ flex: 1 }} value={p.name} onChange={(e) => setProfiles((ps) => (ps.find((x) => x.id === p.id)!.name = e.target.value))} />
            <div style={{ width: 80 }}>
              <Num value={p.height} unit="cm" min={80} max={220} onChange={(h) => setProfiles((ps) => (ps.find((x) => x.id === p.id)!.height = h))} />
            </div>
            <button className={'btn-xs' + (project.activeProfileId === p.id ? ' on' : '')} onClick={() => mutate((d) => (d.activeProfileId = p.id), false)}>
              기준
            </button>
            {project.profiles.length > 1 && (
              <button className="icon-xs danger" onClick={() => setProfiles((ps) => ps.splice(ps.findIndex((x) => x.id === p.id), 1))}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        <button className="btn-xs" onClick={() => setProfiles((ps) => ps.push({ id: uid('p'), name: `사람 ${ps.length + 1}`, height: 160, color: '#7aa7e8' }))}>
          <Plus size={11} /> 사람 추가
        </button>
        <p className="mini-note">'기준'으로 고른 사람의 키로 점수·진단·1인칭 눈높이를 계산해요.</p>
        <div className="insp-label" style={{ marginTop: 10 }}>
          현관 반입 조건
        </div>
        <div className="grid2">
          <label className="field">
            <span>현관문 폭</span>
            <Num value={project.moveIn.entryW} unit="cm" onChange={(x) => mutate((p) => (p.moveIn.entryW = x))} />
          </label>
          <label className="field">
            <span>현관문 높이</span>
            <Num value={project.moveIn.entryH} unit="cm" onChange={(x) => mutate((p) => (p.moveIn.entryH = x))} />
          </label>
        </div>
        {project.moveIn.entryW === 61 && <div className="callout warn">현관문 폭 61cm는 평면도 그림에서 잰 값이에요. 문틀 안쪽 폭을 재서 고쳐 주세요 — 반입 체크가 이 값을 써요.</div>}
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ 버전저장
/** Drawn plan thumbnail for versions that have no 3D capture yet. */
export function MiniPlan({ v }: { v: Version }) {
  const project = useStore((s) => s.project)!;
  const res = resolveItems(project, v);
  const pts = project.plan.rooms.flatMap((r) => r.points).concat(project.plan.walls.flatMap((w) => [w.a, w.b]));
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - 10;
  const y0 = Math.min(...ys) - 10;
  const w = Math.max(...xs) - x0 + 10;
  const h = Math.max(...ys) - y0 + 10;
  return (
    <svg viewBox={`${x0} ${y0} ${w} ${h}`} style={{ width: '100%', height: '100%', display: 'block', background: '#ebe6de' }} preserveAspectRatio="xMidYMid meet">
      {project.plan.rooms.map((r) => (
        <polygon key={r.id} points={r.points.map((p) => p.join(',')).join(' ')} fill="#e2cfb0" />
      ))}
      {res
        .filter((r) => r.prod.mount !== 'ceiling')
        .sort((a, b) => (a.prod.model === 'rug' ? -1 : 0) - (b.prod.model === 'rug' ? -1 : 0))
        .map((r) => (
          <polygon key={r.it.id} points={r.poly.map((p) => p.join(',')).join(' ')} fill={r.it.locked ? '#d2ccc2' : (Object.values(r.it.mats ?? r.prod.mats ?? {})[0]?.color ?? '#fff')} stroke="#5a544c" strokeWidth={1.2} opacity={r.prod.model === 'rug' ? 0.6 : 1} />
        ))}
      {project.plan.walls.map((wl) => (
        <line key={wl.id} x1={wl.a[0]} y1={wl.a[1]} x2={wl.b[0]} y2={wl.b[1]} stroke="#2d2a26" strokeWidth={wl.thickness} />
      ))}
    </svg>
  );
}

const fmtDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function VersionsPanel({ onCompare }: { onCompare: () => void }) {
  const project = useStore((s) => s.project)!;
  const list = useStore((s) => s.projectList);
  const newVersion = useStore((s) => s.newVersion);
  const setActiveVersion = useStore((s) => s.setActiveVersion);
  const deleteVersion = useStore((s) => s.deleteVersion);
  const mutate = useStore((s) => s.mutate);
  const mutateVersion = useStore((s) => s.mutateVersion);
  const notify = useStore((s) => s.notify);
  const requestShot = useStore((s) => s.requestShot);
  const importProject = useStore((s) => s.importProject);
  const switchProject = useStore((s) => s.switchProject);
  const newProject = useStore((s) => s.newProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const sync = useStore((s) => s.sync);
  const logout = useStore((s) => s.logout);
  const syncError = useStore((s) => s.syncError);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [projName, setProjName] = useState('');
  const active = activeVersion(project)!;

  const save = () => {
    const label = name.trim() || `배치 버전 ${project.versions.length + 1}`;
    newVersion(label);
    mutateVersion((v) => (v.notes = note.trim()), false);
    setName('');
    setNote('');
    notify(`'${label}' 버전이 저장되었어요 — 이후 수정은 이 버전에 자동 저장돼요`);
  };

  return (
    <div className="panel-scroll">
      <div className="save-box">
        <div className="insp-label">현재 3D 배치 저장하기</div>
        <input type="text" placeholder="버전 이름 (예: 페블 2인소파 + 원형식탁)" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="text" placeholder="메모 (선택: 장단점, 예산 참고)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-primary full-width" onClick={save}>
          <Save size={14} /> 새 버전으로 저장 (3D 썸네일 자동 캡처)
        </button>
        <p className="mini-note" style={{ marginTop: 0 }}>
          지금 열린 버전은 고칠 때마다 자동 저장돼요 ({syncText(sync).short}). 새 버전으로 저장하면 지금 상태가 따로 남아요.
        </p>
      </div>
      {project.versions.length >= 2 && (
        <button className="btn-compare full-width" onClick={onCompare}>
          <Columns2 size={15} /> 저장된 버전 2개 나란히 비교하기
        </button>
      )}
      <div className="list-group-head">저장된 배치 버전 ({project.versions.length}개)</div>
      <div className="versions-list">
        {[...project.versions]
          .sort((x, y) => y.updatedAt - x.updatedAt)
          .map((v) => {
            const isActive = v.id === active.id;
            const m = ergoReport(project, v);
            return (
              <div key={v.id} className={'version-card' + (isActive ? ' active' : '')}>
                <div className="version-thumb" onClick={() => setActiveVersion(v.id)}>
                  {v.thumb ? <img src={v.thumb} alt={v.name} /> : <MiniPlan v={v} />}
                  {isActive && <span className="ver-active-tag">현재 열림</span>}
                </div>
                <div className="version-body">
                  <div className="version-title-row">
                    {isActive ? (
                      <input className="mood-title-edit" style={{ fontSize: 12.5 }} value={v.name} onChange={(e) => mutateVersion((vv) => (vv.name = e.target.value), false)} />
                    ) : (
                      <b className="version-title">{v.name}</b>
                    )}
                    <span className="version-date">{fmtDate(v.updatedAt)}</span>
                  </div>
                  {isActive ? (
                    <textarea className="mood-note-edit" rows={2} placeholder="메모" value={v.notes} onChange={(e) => mutateVersion((vv) => (vv.notes = e.target.value), false)} style={{ margin: '4px 0 6px' }} />
                  ) : (
                    v.notes && <p className="version-note">{v.notes}</p>
                  )}
                  <div className="version-metrics mono">
                    <span>가구 {m.itemCount}개</span>
                    <span>{fmtWon(m.total)}</span>
                    <span className={scoreClass(m.score)}>사용성 {m.score}점</span>
                  </div>
                  <div className="version-actions">
                    <button className="btn-xs primary" onClick={() => setActiveVersion(v.id)} disabled={isActive}>
                      <FolderOpen size={11} /> {isActive ? '열려 있음' : '불러오기'}
                    </button>
                    {!isActive && (
                      <button
                        className="btn-xs"
                        title="지금 화면의 배치로 이 버전 덮어쓰기"
                        onClick={() => {
                          mutate((p) => {
                            const t = p.versions.find((x) => x.id === v.id)!;
                            const cur = p.versions.find((x) => x.id === p.activeVersionId)!;
                            t.items = JSON.parse(JSON.stringify(cur.items));
                            t.people = JSON.parse(JSON.stringify(cur.people));
                            t.finishes = JSON.parse(JSON.stringify(cur.finishes));
                            t.thumb = cur.thumb;
                            t.updatedAt = Date.now();
                          });
                          notify('현재 배치로 덮어쓰기 저장됨');
                        }}
                      >
                        <Check size={11} /> 덮어쓰기
                      </button>
                    )}
                    <button className="btn-xs" title="버전 복제" onClick={() => newVersion(v.name + ' (복사본)', v.id)}>
                      <Copy size={11} />
                    </button>
                    {project.versions.length > 1 && <Confirm label={<Trash2 size={11} />} onConfirm={() => deleteVersion(v.id)} />}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      <div className="insp-section" style={{ marginTop: 16 }}>
        <div className="insp-label">내보내기 · 이미지 · 백업</div>
        <div className="util-btn-grid">
          <button className="btn-secondary" onClick={requestShot}>
            <Camera size={14} /> 3D PNG 캡처
          </button>
          <button
            className="btn-secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(layoutCode(active.items));
                notify('배치 코드를 복사했어요');
              } catch {
                setShowImport(true);
                setImportText(layoutCode(active.items));
                notify('아래 칸의 코드를 직접 복사하세요');
              }
            }}
          >
            <Copy size={14} /> 배치 코드 복사
          </button>
          <button className="btn-secondary" onClick={async () => void download(`${project.name}-전체백업-${new Date().toISOString().slice(0, 10)}.json`, await exportProject(project), 'application/json')}>
            <Download size={14} /> 전체 백업 (.json)
          </button>
          <label className="btn-secondary">
            <Upload size={14} /> 백업 파일 복원
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const o = JSON.parse(await f.text());
                  if (o.format !== '2ndhome' || !o.project) throw new Error();
                  for (const [id, b] of Object.entries(o.blobs ?? {}) as [string, { data: string }][]) await putBlob(id, dataUrlToBlob(b.data));
                  importProject(o.project);
                  notify('백업 데이터를 모두 복원했어요');
                } catch {
                  notify('2ndhome 백업 파일이 아니에요');
                }
              }}
            />
          </label>
        </div>
      </div>
      {(sync === 'server' || sync === 'server-nostore') && (
        <div className="insp-section">
          <div className="insp-label">이 기기</div>
          <p className="mini-note" style={{ marginTop: 0 }}>
            {syncText(sync).long}. 모든 기기를 한 번에 로그아웃시키려면 Vercel에서 APP_PASSWORD를 바꾸세요.
          </p>
          {syncError && syncError !== 'not_configured' && (
            <div className="callout bad" style={{ wordBreak: 'break-word' }}>
              서버 저장소 오류: {syncError}
            </div>
          )}
          <button className="btn-xs full-width" onClick={() => void logout()}>
            이 기기에서 로그아웃
          </button>
        </div>
      )}
      <div className="insp-section">
        <button className="btn-xs full-width" onClick={() => setShowImport((x) => !x)}>
          {showImport ? '▲ 배치 코드 붙여넣기 닫기' : '▼ 배치 코드 · 다른 배치 도구 JSON 불러오기'}
        </button>
        {showImport && (
          <div className="import-box">
            <textarea rows={4} placeholder="배치 코드나 다른 배치 도구에서 내보낸 JSON을 붙여넣으세요…" value={importText} onChange={(e) => setImportText(e.target.value)} />
            <button
              className="btn-primary full-width"
              onClick={() => {
                const items = parseLayoutCode(importText, project);
                if (!items) return notify('JSON 형식이 올바르지 않아요');
                mutateVersion((v) => {
                  v.items = [...v.items.filter((i) => i.locked), ...items];
                });
                setImportText('');
                notify(`총 ${items.length}개 가구를 3D 공간으로 불러왔어요`);
              }}
            >
              3D 공간으로 변환해서 불러오기
            </button>
          </div>
        )}
      </div>
      <div className="insp-section">
        <div className="insp-label">빠른 초기화</div>
        <div className="util-btn-grid">
          <button
            className="btn-danger"
            onClick={() => {
              mutateVersion((v) => {
                v.items = v.items.filter((i) => i.locked);
              });
              notify('붙박이만 남기고 가구를 비웠어요 (Cmd+Z로 되돌리기)');
            }}
          >
            <Trash2 size={13} /> 가구 모두 비우기
          </button>
        </div>
      </div>
      <details className="insp-section more">
        <summary>
          <FolderOpen size={13} /> 다른 집 · 프로젝트 ({list.length})
        </summary>
        <div className="placed-list">
          {list.map((p) => (
            <div key={p.id} className={'placed-row' + (p.id === project.id ? ' sel' : '')} onClick={() => void switchProject(p.id)}>
              <div className="placed-info">
                <div className="placed-name">{p.name}</div>
                <div className="placed-sub">{new Date(p.t).toLocaleDateString('ko-KR')}</div>
              </div>
              {p.id !== project.id && list.length > 1 && (
                <span onClick={(e) => e.stopPropagation()}>
                  <Confirm label={<Trash2 size={11} />} onConfirm={() => deleteProject(p.id)} />
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="save-box" style={{ marginTop: 8 }}>
          <input type="text" placeholder="새 집 이름 (예: 망원동 투룸)" value={projName} onChange={(e) => setProjName(e.target.value)} />
          <div className="util-btn-grid">
            <button className="btn-secondary" onClick={() => newProject(projName || '새 집', 'blank')}>
              빈 방에서 시작
            </button>
            <button className="btn-secondary" onClick={() => newProject(projName || `${project.name} (사본)`, 'copy')}>
              지금 집 복사해서 시작
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ compare modal
export function CompareModal({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const setActiveVersion = useStore((s) => s.setActiveVersion);
  const vs = project.versions;
  const [a, setA] = useState(vs[0]?.id);
  const [b, setB] = useState(vs[1]?.id ?? vs[0]?.id);
  const A = vs.find((v) => v.id === a);
  const B = vs.find((v) => v.id === b);
  const col = (v: Version | undefined) => {
    if (!v) return null;
    const m = ergoReport(project, v);
    return (
      <div className="compare-col">
        <div className="compare-thumb">{v.thumb ? <img src={v.thumb} alt="" /> : <MiniPlan v={v} />}</div>
        <h4>{v.name}</h4>
        <p className="compare-note">{v.notes}</p>
        <div className="compare-stats">
          <div>
            <span>예상 예산</span>
            <b className="mono">{fmtWon(m.total)}</b>
          </div>
          <div>
            <span>사용성 점수</span>
            <b className={'mono ' + scoreClass(m.score)}>{m.score}점</b>
          </div>
          <div>
            <span>가구 수</span>
            <b className="mono">{m.itemCount}개</b>
          </div>
          <div>
            <span>최소 통로</span>
            <b className="mono">{m.minPassageCm != null ? m.minPassageCm + 'cm' : '여유'}</b>
          </div>
          <div>
            <span>바닥 점유</span>
            <b className="mono">{m.floorArea.toFixed(1)}㎡</b>
          </div>
          <div>
            <span>겹침·주의</span>
            <b className="mono">
              {m.issues} / {m.warn}
            </b>
          </div>
        </div>
        <button
          className="btn-secondary full-width"
          onClick={() => {
            setActiveVersion(v.id);
            onClose();
          }}
        >
          <FolderOpen size={13} /> 이 버전 열기
        </button>
      </div>
    );
  };
  const names = (v?: Version) => {
    const m = new Map<string, number>();
    for (const it of v?.items ?? []) {
      if (it.locked) continue;
      const n = it.label || getProduct(it.productId, project)?.name || it.productId;
      m.set(n, (m.get(n) ?? 0) + 1);
    }
    return m;
  };
  const na = names(A);
  const nb = names(B);
  const onlyA = [...na.keys()].filter((k) => (nb.get(k) ?? 0) < (na.get(k) ?? 0));
  const onlyB = [...nb.keys()].filter((k) => (na.get(k) ?? 0) < (nb.get(k) ?? 0));
  const mA = A ? ergoReport(project, A) : null;
  const mB = B ? ergoReport(project, B) : null;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card modal-lg">
        <div className="modal-header">
          <div>
            <h3>저장된 버전 나란히 비교</h3>
            <p className="modal-sub">예산·사용성·가구 차이를 한눈에</p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="compare-selectors">
          <select value={a} onChange={(e) => setA(e.target.value)}>
            {vs.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <span className="vs-badge">VS</span>
          <select value={b} onChange={(e) => setB(e.target.value)}>
            {vs.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="compare-grid">
          {col(A)}
          {col(B)}
        </div>
        {mA && mB && (
          <div className="compare-diff-box">
            <div className="compare-delta-bar">
              <span>
                예산 차이 <b className="mono">{fmtWon(Math.abs(mB.total - mA.total))}</b> {mB.total > mA.total ? '(B가 비쌈)' : mB.total < mA.total ? '(A가 비쌈)' : ''}
              </span>
              <span>
                사용성 <b className="mono">{mB.score - mA.score > 0 ? '+' : ''}{mB.score - mA.score}점</b> (B 기준)
              </span>
            </div>
            <div className="compare-diff-cols">
              <div>
                <div className="diff-head">A에만 있는 가구</div>
                {onlyA.length ? onlyA.map((n) => <div key={n} className="diff-item minus">− {n}</div>) : <div className="diff-item">없음</div>}
              </div>
              <div>
                <div className="diff-head">B에만 있는 가구</div>
                {onlyB.length ? onlyB.map((n) => <div key={n} className="diff-item plus">+ {n}</div>) : <div className="diff-item">없음</div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { Modal };
