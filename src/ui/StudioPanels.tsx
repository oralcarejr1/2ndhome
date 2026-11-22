import {
  BedDouble,
  Camera,
  Check,
  Columns2,
  CookingPot,
  Copy,
  DoorOpen,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Footprints,
  Laptop,
  Lock,
  MapPin,
  Plus,
  Save,
  Shirt,
  Sofa,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { catLabel } from '../catalog/categories';
import { productSearchUrl } from '../catalog/products';
import { computeIssues, resolveItems } from '../lib/analysis';
import { anthro, ideals } from '../lib/ergonomics';
import { fmtWon, uid } from '../lib/geometry';
import { requestCamera, useScene } from '../scene/sceneState';
import { putBlob } from '../store/persistence';
import { activeVersion, getProduct, syncText, useStore } from '../store/store';
import type { Pose, Project, Version } from '../types';
import { mainAvatar, runScenario, setPose, updateAvatar, type Scenario } from './actions';
import { exportProject, layoutCode, parseLayoutCode } from './backup';
import { Confirm, dataUrlToBlob, download, Modal, Num } from './common';
import { ergoReport, layoutTotals, scoreClass, useErgo, useLayoutTotals } from './ergo';

// ------------------------------------------------------------------ 배치목록
export function LayoutListPanel() {
  const project = useStore((s) => s.project)!;
  const v = activeVersion(project)!;
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const updateItems = useStore((s) => s.updateItems);
  const mutate = useStore((s) => s.mutate);
  const mutateVersion = useStore((s) => s.mutateVersion);
  const totals = useLayoutTotals();
  const issues = useMemo(() => computeIssues(project, v), [project.plan, v, project.customProducts]);
  const badIssueCount = useMemo(() => {
    let n = 0;
    for (const [, list] of issues) if (list.some((x) => x.level === 'bad')) n++;
    return n;
  }, [issues]);
  const furniture = v.items.filter((i) => !i.locked);
  const builtins = v.items.filter((i) => i.locked);
  const budget = project.budget ?? 0;
  const total = totals.total;
  const budgetPct = budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : 0;
  const overBudget = budget > 0 && total > budget;

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
    const csv = '\ufeff' + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
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
        <span className="color-dot" style={{ background: Object.values(it.mats ?? p?.mats ?? {})[0]?.color ?? '#999' }} />
        <div className="placed-info">
          <div className="placed-name">
            {it.locked && <Lock size={10} className="ic-lock" />}
            <span>{it.label || p?.name}</span>
          </div>
          <div className="placed-sub mono">
            {d ? `${Math.round(d.w)}×${Math.round(d.d)}` : ''}
            {p?.price && !it.locked ? ` · ${fmtWon(p.price)}` : ''}
            {it.y > 1 ? ` · +${Math.round(it.y)}cm` : ''}
          </div>
          {iss && iss.length > 0 && <div className={'placed-warn lvl-' + lvl}>{iss.map((x) => x.msg).join(' · ')}</div>}
        </div>
        <div className="placed-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-xs" title={it.hidden ? '보이기' : '숨기기'} aria-label={it.hidden ? '보이기' : '숨기기'} onClick={() => updateItems([it.id], (x) => (x.hidden = !x.hidden))}>
            {it.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          {!it.locked && (
            <button className="icon-xs danger" title="삭제" aria-label="삭제" onClick={() => mutateVersion((vv) => (vv.items = vv.items.filter((x) => x.id !== it.id)))}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="panel-scroll">
      <div className="kpi-strip cols-4">
        <div>
          <span>합계</span>
          <b className="mono">{fmtWon(total)}</b>
        </div>
        <div>
          <span>가구</span>
          <b className="mono">{furniture.length}</b>
        </div>
        <div>
          <span>점유</span>
          <b className="mono">{totals.floorArea.toFixed(1)}㎡</b>
        </div>
        <div>
          <span>간섭</span>
          <b className={'mono ' + (badIssueCount ? 'sc-bad' : 'sc-good')}>{badIssueCount}</b>
        </div>
      </div>

      <div className="list-group-head">배치 가구 ({furniture.length})</div>
      <div className="placed-list-hairline">{furniture.map((i) => row(i.id))}</div>
      {!furniture.length && <div className="empty-hint">카탈로그에서 가구를 배치해 보세요.</div>}

      {builtins.length > 0 && (
        <>
          <div className="list-group-head" style={{ marginTop: 14 }}>
            붙박이 · 고정 ({builtins.length})
          </div>
          <div className="placed-list-hairline">{builtins.map((i) => row(i.id))}</div>
        </>
      )}

      <div className="insp-section">
        <div className="inline-field">
          <span className="insp-label" style={{ margin: 0 }}>목표 예산</span>
          <div style={{ width: 132 }}>
            <Num value={budget} unit="원" step={100000} onChange={(b) => mutate((p) => (p.budget = b))} />
          </div>
        </div>
        {budget > 0 && (
          <div className="budget-meter">
            <div className="budget-bar">
              <div className={'budget-fill' + (overBudget ? ' bad' : '')} style={{ width: `${budgetPct}%` }} />
            </div>
            <div className={'budget-meta mono' + (overBudget ? ' bad' : '')}>
              <span>{budgetPct}%</span>
              <span>{overBudget ? `${fmtWon(total - budget)} 초과` : `${fmtWon(budget - total)} 남음`}</span>
            </div>
          </div>
        )}
        <button className="btn-secondary full-width" style={{ marginTop: 8 }} onClick={exportCsv}>
          <Download size={13} /> 구매 목록 CSV 내보내기
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 사람·동선 (Architectural Spec Sheet)
const POSES: { id: Pose; label: string }[] = [
  { id: 'stand', label: '서기' },
  { id: 'walk', label: '걷기' },
  { id: 'sit', label: '앉기' },
  { id: 'lie', label: '눕기' },
  { id: 'reach', label: '팔' },
];

const SCENARIOS: [Scenario, string, typeof DoorOpen][] = [
  ['entry', '현관 진입', DoorOpen],
  ['sofa', '소파 착석', Sofa],
  ['bed', '침대 취침', BedDouble],
  ['desk', '책상 작업', Laptop],
  ['kitchen', '주방 조리', CookingPot],
  ['wardrobe', '옷장 열기', Shirt],
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
  const setHeight = (h: number, history = true) =>
    mutate((p) => {
      const target = p.profiles.find((x) => x.id === prof.id);
      if (target) target.height = h;
    }, history);
  const score = rep?.score ?? 100;
  const findings = rep?.findings ?? [];
  const badCnt = findings.filter((f) => f.level === 'bad').length;
  const warnCnt = findings.filter((f) => f.level === 'warn').length;
  const okCnt = findings.length - badCnt - warnCnt;

  return (
    <div className="panel-scroll">
      <div className="ergo-spec-head">
        <div>
          <div className="insp-eyebrow">동선 · 인체치수 점검</div>
          <div className="ergo-spec-summary">
            {badCnt > 0 || warnCnt > 0 ? (
              <>
                {badCnt > 0 && <span className="sc-bad">충돌 {badCnt}</span>}
                {badCnt > 0 && warnCnt > 0 && ' · '}
                {warnCnt > 0 && <span className="sc-warn">주의 {warnCnt}</span>}
                {' · '}
                <span>양호 {okCnt}</span>
              </>
            ) : (
              <span className="sc-good">문제 없음 · 양호 {okCnt}건</span>
            )}
          </div>
        </div>
        <span className={'spec-score mono ' + scoreClass(score)} title="배치 사용성 지표">
          {score}점
        </span>
      </div>

      {view === 'walk' ? (
        <button className="btn-primary full-width pov-active-btn" onClick={() => setView('3d')}>
          <Eye size={14} /> 1인칭 종료 → 3D 전체
        </button>
      ) : (
        <button className="btn-primary full-width" onClick={() => setView('walk')}>
          <Footprints size={14} /> 눈높이 {Math.round(a.eyeH)}cm로 1인칭 걷기
        </button>
      )}

      <div className="kpi-strip cols-3" style={{ marginTop: 10 }}>
        <div>
          <span>최소 통로</span>
          <b className="mono">{rep?.minPassageCm != null ? `${rep.minPassageCm}cm` : '여유'}</b>
        </div>
        <div>
          <span>개방 바닥</span>
          <b className="mono">{Math.round((rep?.usableFloorRatio ?? 1) * 100)}%</b>
        </div>
        <div>
          <span>기준 키</span>
          <b className="mono">{prof.height}cm</b>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-label-row">
          <span className="insp-label">기준 인물 ({prof.name})</span>
          <label className="chk-inline">
            <input type="checkbox" checked={show.people && !!av} onChange={(e) => (av ? setShow({ people: e.target.checked }) : updateAvatar({}))} />
            아바타 표시
          </label>
        </div>
        <input
          type="range"
          min={140}
          max={200}
          step={1}
          value={prof.height}
          onPointerDown={() => useStore.getState().checkpoint()}
          onChange={(e) => setHeight(Number(e.target.value), false)}
        />
        <div className="quick-elev-row">
          {[160, 168, 175, 182].map((cm) => (
            <button key={cm} className={'btn-xs mono' + (prof.height === cm ? ' on' : '')} onClick={() => setHeight(cm)}>
              {cm}
            </button>
          ))}
        </div>
        <div className="seg-grid-5" style={{ marginTop: 8 }}>
          {POSES.map((p) => (
            <button key={p.id} className={'seg-btn' + (av?.pose === p.id ? ' on' : '')} onClick={() => setPose(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="kpi-strip cols-4" style={{ marginTop: 8, marginBottom: 0 }}>
          <div>
            <span>좌판</span>
            <b className="mono">{Math.round(idl.chairSeat)}</b>
          </div>
          <div>
            <span>책상</span>
            <b className="mono">{Math.round(idl.deskH)}</b>
          </div>
          <div>
            <span>조리대</span>
            <b className="mono">{Math.round(idl.counterH)}</b>
          </div>
          <div>
            <span>통로</span>
            <b className="mono">{Math.round(idl.passMin)}</b>
          </div>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-label">생활 시점 바로가기</div>
        <div className="scenario-grid">
          {SCENARIOS.map(([id, label, Icon]) => (
            <button key={id} className="scenario-btn" onClick={() => runScenario(id)}>
              <Icon size={13} strokeWidth={1.7} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-label">항목별 점검표</div>
        <div className="spec-findings">
          {findings
            .slice()
            .sort((x, y) => ({ bad: 0, warn: 1, info: 2, ok: 3 })[x.level] - { bad: 0, warn: 1, info: 2, ok: 3 }[y.level])
            .map((f) => {
              const it = f.itemId ? v.items.find((i) => i.id === f.itemId) : undefined;
              const tone = f.level === 'bad' ? 'bad' : f.level === 'warn' ? 'warn' : 'good';
              return (
                <div
                  key={f.id}
                  className={'spec-finding' + (it ? ' clickable' : '')}
                  onClick={() => {
                    if (!it) return;
                    select([it.id]);
                    if (view === 'walk') setView('3d');
                    requestCamera('focus', { x: it.x, z: it.z });
                  }}
                >
                  <span className={'spec-dot ' + tone} />
                  <div className="spec-finding-body">
                    <div className="spec-finding-top">
                      <span className="spec-finding-title">{f.title}</span>
                      <span className="spec-finding-group">{f.group}</span>
                    </div>
                    <div className="spec-finding-detail">{f.detail}</div>
                  </div>
                  {it && <MapPin size={11} className="spec-pin" />}
                </div>
              );
            })}
        </div>
      </div>

      <details className="insp-section more">
        <summary>
          <User size={12} /> 함께 사는 사람 · 현관 반입 조건
        </summary>
        {project.profiles.map((p) => (
          <div key={p.id} className="row">
            <input type="color" value={p.color} onChange={(e) => setProfiles((ps) => (ps.find((x) => x.id === p.id)!.color = e.target.value))} />
            <input className="inp" style={{ flex: 1 }} value={p.name} onChange={(e) => setProfiles((ps) => (ps.find((x) => x.id === p.id)!.name = e.target.value))} />
            <div style={{ width: 76 }}>
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
        <div className="insp-label" style={{ marginTop: 10 }}>
          현관 반입 문틀 치수
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
        {project.moveIn.entryW === 61 && <div className="callout warn">문틀 안쪽 실측 폭을 입력하면 반입 체크가 정확해집니다.</div>}
      </details>
    </div>
  );
}

// ------------------------------------------------------------------ 버전저장
/** Drawn plan thumbnail for versions that have no 3D capture yet. */
export function MiniPlan({ v }: { v: Version }) {
  const project = useStore((s) => s.project)!;
  const theme = useStore((s) => s.theme);
  const res = resolveItems(project, v);
  const pts = project.plan.rooms.flatMap((r) => r.points).concat(project.plan.walls.flatMap((w) => [w.a, w.b]));
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - 10;
  const y0 = Math.min(...ys) - 10;
  const w = Math.max(...xs) - x0 + 10;
  const h = Math.max(...ys) - y0 + 10;
  const dark = theme === 'dark';
  return (
    <svg viewBox={`${x0} ${y0} ${w} ${h}`} style={{ width: '100%', height: '100%', display: 'block', background: dark ? '#1f2126' : '#ece8e0' }} preserveAspectRatio="xMidYMid meet">
      {project.plan.rooms.map((r) => (
        <polygon key={r.id} points={r.points.map((p) => p.join(',')).join(' ')} fill={dark ? 'rgba(216,191,152,0.16)' : '#e2d3ba'} />
      ))}
      {res
        .filter((r) => r.prod.mount !== 'ceiling')
        .sort((a, b) => (a.prod.model === 'rug' ? -1 : 0) - (b.prod.model === 'rug' ? -1 : 0))
        .map((r) => (
          <polygon
            key={r.it.id}
            points={r.poly.map((p) => p.join(',')).join(' ')}
            fill={r.it.locked ? (dark ? '#383c44' : '#cfc9be') : (Object.values(r.it.mats ?? r.prod.mats ?? {})[0]?.color ?? (dark ? '#444954' : '#fff'))}
            stroke={dark ? '#8d9098' : '#5a544c'}
            strokeWidth={1.2}
            opacity={r.prod.model === 'rug' ? 0.5 : 1}
          />
        ))}
      {project.plan.walls.map((wl) => (
        <line key={wl.id} x1={wl.a[0]} y1={wl.a[1]} x2={wl.b[0]} y2={wl.b[1]} stroke={dark ? '#dcd8d0' : '#23201c'} strokeWidth={wl.thickness} />
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
  const replaceProject = useStore((s) => s.replaceProject);
  const [pendingRestore, setPendingRestore] = useState<Project | null>(null);
  const switchProject = useStore((s) => s.switchProject);
  const newProject = useStore((s) => s.newProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const sync = useStore((s) => s.sync);
  const logout = useStore((s) => s.logout);
  const syncError = useStore((s) => s.syncError);
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [projName, setProjName] = useState('');
  const dragging = useScene((s) => s.dragging);
  const active = activeVersion(project)!;

  const save = () => {
    const label = name.trim() || `배치 버전 ${project.versions.length + 1}`;
    newVersion(label);
    mutateVersion((v) => (v.notes = note.trim()), false);
    setName('');
    setNote('');
    setShowSave(false);
    notify(`'${label}' 버전이 저장되었어요`);
  };

  return (
    <div className="panel-scroll">
      <div className="ver-top-actions">
        <button className="btn-primary" style={{ flex: 1 }} onClick={() => setShowSave((x) => !x)}>
          <Save size={13} /> 새 버전 저장
        </button>
        {project.versions.length >= 2 && (
          <button
            className="btn-secondary"
            onClick={() => {
              useScene.getState().captureThumb?.();
              onCompare();
            }}
            title="버전 2개 나란히 비교"
          >
            <Columns2 size={13} /> 비교
          </button>
        )}
      </div>

      {showSave && (
        <div className="save-box">
          <input type="text" placeholder="버전 이름 (예: 거실 개방형 안)" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
          <input type="text" placeholder="메모 (선택)" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <div className="seg-grid-2">
            <button className="btn-secondary" onClick={() => setShowSave(false)}>
              취소
            </button>
            <button className="btn-primary" onClick={save}>
              저장하기
            </button>
          </div>
        </div>
      )}

      <div className="list-group-head">
        저장된 버전 ({project.versions.length}) · <span style={{ fontWeight: 400 }}>{syncText(sync).short}</span>
      </div>

      <div className="versions-list">
        {[...project.versions]
          .sort((x, y) => y.updatedAt - x.updatedAt)
          .map((v) => {
            const isActive = v.id === active.id;
            const fast = layoutTotals(project, v);
            const m = isActive && dragging ? null : ergoReport(project, v);
            return (
              <div key={v.id} className={'version-card' + (isActive ? ' active' : '')}>
                <div className="version-thumb" onClick={() => setActiveVersion(v.id)}>
                  {v.thumb ? <img src={v.thumb} alt={v.name} /> : <MiniPlan v={v} />}
                  {isActive && <span className="ver-active-tag">열림</span>}
                </div>
                <div className="version-body">
                  <div className="version-title-row">
                    {isActive ? (
                      <input className="mood-title-edit" style={{ fontSize: 12.5 }} value={v.name} onChange={(e) => mutateVersion((vv) => (vv.name = e.target.value), false)} />
                    ) : (
                      <b className="version-title">{v.name}</b>
                    )}
                    <span className="version-date mono">{fmtDate(v.updatedAt)}</span>
                  </div>
                  {isActive ? (
                    <textarea className="mood-note-edit" rows={1} placeholder="메모" value={v.notes} onChange={(e) => mutateVersion((vv) => (vv.notes = e.target.value), false)} style={{ margin: '4px 0 6px' }} />
                  ) : (
                    v.notes && <p className="version-note">{v.notes}</p>
                  )}
                  <div className="version-metrics mono">
                    <span>{fast.itemCount}개</span>
                    <span>{fmtWon(fast.total)}</span>
                    {m && <span className={scoreClass(m.score)}>{m.score}점</span>}
                  </div>
                  <div className="version-actions">
                    <button className="btn-xs primary" onClick={() => setActiveVersion(v.id)} disabled={isActive}>
                      <FolderOpen size={11} /> {isActive ? '열려 있음' : '열기'}
                    </button>
                    {!isActive && (
                      <button
                        className="btn-xs"
                        title="현재 배치로 이 버전 덮어쓰기"
                        onClick={() => {
                          useScene.getState().captureThumb?.();
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

      <details className="insp-section more">
        <summary>
          <Download size={12} /> 내보내기 · 백업 · 초기화
        </summary>
        <div className="util-btn-grid">
          <button className="btn-secondary" onClick={requestShot}>
            <Camera size={13} /> 3D 캡처
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
                notify('아래 칸의 코드를 복사하세요');
              }
            }}
          >
            <Copy size={13} /> 배치 코드
          </button>
          <button className="btn-secondary" onClick={async () => void download(`${project.name}-전체백업-${new Date().toISOString().slice(0, 10)}.json`, await exportProject(project), 'application/json')}>
            <Download size={13} /> 백업 저장
          </button>
          <label className="btn-secondary">
            <Upload size={13} /> 백업 복원
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
                  e.target.value = '';
                  if (list.some((x) => x.id === o.project.id)) {
                    setPendingRestore(o.project);
                    return;
                  }
                  importProject(o.project);
                  notify('백업 데이터를 모두 복원했어요');
                } catch {
                  notify('2ndhome 백업 파일이 아니에요');
                }
              }}
            />
          </label>
        </div>

        {pendingRestore && (
          <div className="callout info" style={{ marginTop: 8 }}>
            <b>'{list.find((x) => x.id === pendingRestore.id)?.name ?? pendingRestore.name}'</b>이(가) 이미 있어요. 이 파일로 바꿀까요?
            <div className="row" style={{ marginTop: 6, marginBottom: 0 }}>
              <button
                className="btn-xs primary"
                onClick={() => {
                  const p = pendingRestore;
                  setPendingRestore(null);
                  void replaceProject(p).then(() => notify('기존 프로젝트를 교체했어요'));
                }}
              >
                기존 교체
              </button>
              <button
                className="btn-xs"
                onClick={() => {
                  importProject(pendingRestore);
                  setPendingRestore(null);
                  notify('새 프로젝트로 추가했어요');
                }}
              >
                따로 추가
              </button>
              <button className="btn-xs" onClick={() => setPendingRestore(null)}>
                취소
              </button>
            </div>
          </div>
        )}

        <button className="btn-xs full-width" style={{ marginTop: 8 }} onClick={() => setShowImport((x) => !x)}>
          {showImport ? '배치 코드 입력 닫기' : '배치 코드 · JSON 불러오기'}
        </button>
        {showImport && (
          <div className="import-box">
            <textarea rows={3} placeholder="배치 코드 또는 JSON 붙여넣기…" value={importText} onChange={(e) => setImportText(e.target.value)} />
            <button
              className="btn-primary full-width"
              onClick={() => {
                const items = parseLayoutCode(importText, project);
                if (!items) return notify('JSON 형식이 올바르지 않아요');
                mutateVersion((v) => {
                  v.items = [...v.items.filter((i) => i.locked), ...items];
                });
                setImportText('');
                setShowImport(false);
                notify(`총 ${items.length}개 가구를 불러왔어요`);
              }}
            >
              3D 공간으로 불러오기
            </button>
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <Confirm
            className="btn-danger full-width"
            label={
              <>
                <Trash2 size={13} /> 가구 모두 비우기
              </>
            }
            onConfirm={() => {
              mutateVersion((v) => {
                v.items = v.items.filter((i) => i.locked);
              });
              notify('붙박이만 남기고 가구를 비웠어요 (Cmd+Z로 되돌리기)');
            }}
          />
        </div>
      </details>

      <details className="insp-section more">
        <summary>
          <FolderOpen size={12} /> 다른 집 · 프로젝트 ({list.length})
        </summary>
        <div className="placed-list-hairline">
          {list.map((p) => (
            <div key={p.id} className={'placed-row' + (p.id === project.id ? ' sel' : '')} onClick={() => void switchProject(p.id)}>
              <div className="placed-info">
                <div className="placed-name">{p.name}</div>
                <div className="placed-sub mono">{new Date(p.t).toLocaleDateString('ko-KR')}</div>
              </div>
              {p.id !== project.id && list.length > 1 && (
                <span onClick={(e) => e.stopPropagation()}>
                  <Confirm label={<Trash2 size={11} />} onConfirm={() => deleteProject(p.id)} />
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="save-box" style={{ marginTop: 8, marginBottom: 0 }}>
          <input type="text" placeholder="새 집 이름" value={projName} onChange={(e) => setProjName(e.target.value)} />
          <div className="util-btn-grid">
            <button className="btn-secondary" onClick={() => newProject(projName || '새 집', 'blank')}>
              빈 방 시작
            </button>
            <button className="btn-secondary" onClick={() => newProject(projName || `${project.name} (사본)`, 'copy')}>
              현재 집 복사
            </button>
          </div>
        </div>
      </details>

      {(sync === 'server' || sync === 'server-nostore') && (
        <details className="insp-section more">
          <summary>이 기기 · 동기화</summary>
          <p className="mini-note" style={{ marginTop: 0 }}>
            {syncText(sync).long}
          </p>
          {syncError && syncError !== 'not_configured' && (
            <div className="callout bad" style={{ wordBreak: 'break-word' }}>
              서버 저장소 오류: {syncError}
            </div>
          )}
          <button className="btn-xs full-width" style={{ marginTop: 6 }} onClick={() => void logout()}>
            이 기기에서 로그아웃
          </button>
        </details>
      )}
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
            <span>사용성</span>
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
            <span>겹침 · 주의</span>
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
            <h3>버전 비교</h3>
            <p className="modal-sub">예산 · 동선 · 가구 구성 차이</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={15} />
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
                예산 차이 <b className="mono">{fmtWon(Math.abs(mB.total - mA.total))}</b> {mB.total > mA.total ? '(B 높음)' : mB.total < mA.total ? '(A 높음)' : ''}
              </span>
              <span>
                사용성{' '}
                <b className="mono">
                  {mB.score - mA.score > 0 ? '+' : ''}
                  {mB.score - mA.score}점
                </b>
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
