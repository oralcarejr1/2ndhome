import {
  Box,
  Camera,
  Check,
  ChevronDown,
  Columns2,
  Copy,
  Crosshair,
  Eye,
  FlipHorizontal,
  Footprints,
  HelpCircle,
  Layers,
  LayoutGrid,
  Lock,
  Minus,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  RefreshCw,
  RotateCw,
  Ruler,
  SlidersHorizontal,
  Sofa,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  Undo2,
  Unlock,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { PRODUCTS } from './catalog/products';
import { anthro, ideals } from './lib/ergonomics';
import { fmtWon, itemAxes, normDeg, polyArea } from './lib/geometry';
import { resolveMats } from './models';
import { requestCamera, useScene } from './scene/sceneState';
import { Viewport } from './scene/Viewport';
import { activeVersion, getProduct, syncText, useStore } from './store/store';
import type { PlacedItem, Pose, Product } from './types';
import { mainAvatar, testWithHuman, updateAvatar } from './ui/actions';
import { CatalogPanel } from './ui/CatalogPanel';
import { dataUrlToBlob, download, Modal } from './ui/common';
import { useLayoutTotals } from './ui/ergo';
import { Inspector } from './ui/Inspector';
import { LoginScreen } from './ui/Login';
import { Moodboard } from './ui/Moodboard';
import { PlanEditor } from './ui/PlanEditor';
import { ProductEditor } from './ui/ProductEditor';
import { CompareModal, HumanPanel, LayoutListPanel, VersionsPanel } from './ui/StudioPanels';

type LeftTab = 'catalog' | 'placed' | 'human' | 'versions';

const TIMES: { id: string; label: string; short: string; hour: number; lamps: boolean }[] = [
  { id: 'morning', label: '아침 8시', short: '아침', hour: 8, lamps: false },
  { id: 'noon', label: '한낮 13시', short: '낮', hour: 13, lamps: false },
  { id: 'golden', label: '노을 17시', short: '노을', hour: 17, lamps: false },
  { id: 'night', label: '밤 + 조명', short: '밤', hour: 21, lamps: true },
];

const WALL_MODES: { id: 'auto' | 'full' | 'low' | 'hidden'; label: string }[] = [
  { id: 'auto', label: '자동 투시' },
  { id: 'full', label: '전체 벽' },
  { id: 'low', label: '낮은 벽' },
  { id: 'hidden', label: '벽 숨김' },
];

function useIsMobile() {
  const q = '(max-width: 760px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mm = window.matchMedia(q);
    const f = () => setM(mm.matches);
    mm.addEventListener('change', f);
    return () => mm.removeEventListener('change', f);
  }, []);
  return m;
}

function useOutsideClose(open: boolean, ref: RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, ref, onClose]);
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const gate = useStore((s) => s.gate);
  const init = useStore((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);
  if (gate === 'login') return <LoginScreen />;
  if (!ready) return <div className="studio-loading">불러오는 중…</div>;
  return <Studio />;
}

function Studio() {
  const project = useStore((s) => s.project)!;
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const selection = useStore((s) => s.selection);
  const placing = useStore((s) => s.placing);
  const placingPerson = useStore((s) => s.placingPerson);
  const measure = useStore((s) => s.measure);
  const toast = useStore((s) => s.toast);
  const isMobile = useIsMobile();
  const [leftTab, setLeftTab] = useState<LeftTab>('catalog');
  const [splitMood, setSplitMood] = useState(false);
  const [editPlan, setEditPlan] = useState(false);
  const [planPanelEl, setPlanPanelEl] = useState<HTMLDivElement | null>(null);
  const [compare, setCompare] = useState(false);
  const [editor, setEditor] = useState<{ base?: Product; importUrl?: string } | null>(null);
  const [help, setHelp] = useState(false);
  const [mtab, setMtab] = useState<'left' | 'right' | 'none'>('none');
  const [toastOn, setToastOn] = useState(false);
  const v = activeVersion(project)!;
  const furnCount = v.items.filter((i) => !i.locked).length;

  const walkPanelsRef = useRef<{ left: boolean; right: boolean } | null>(null);
  const prevViewRef = useRef(view);

  useEffect(() => {
    if (!toast) return;
    setToastOn(true);
    const t = setTimeout(() => setToastOn(false), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Auto-collapse side panels when entering 1st-person walk mode, and restore on exit
  useEffect(() => {
    const prev = prevViewRef.current;
    prevViewRef.current = view;
    if (view === 'walk' && prev !== 'walk') {
      const st = useStore.getState();
      walkPanelsRef.current = { left: st.leftOpen, right: st.rightOpen };
      useStore.setState({ leftOpen: false, rightOpen: false });
      if (isMobile) setMtab('none');
    } else if (prev === 'walk' && view !== 'walk' && walkPanelsRef.current) {
      useStore.setState({ leftOpen: walkPanelsRef.current.left, rightOpen: walkPanelsRef.current.right });
      walkPanelsRef.current = null;
    }
  }, [view, isMobile]);

  useKeys(view === '2d' && editPlan);

  const toggleEditPlan = (on: boolean) => {
    setEditPlan(on);
    if (on) {
      useStore.getState().select([]);
      setSplitMood(false);
      useStore.setState({ rightOpen: true });
    }
  };

  const stage3d = view === '3d' || view === 'top' || view === 'walk';
  const planEditActive = view === '2d' && editPlan;
  const showSelectionBar =
    (view === '3d' || view === 'top' || (view === '2d' && !editPlan)) &&
    selection.length > 0 &&
    !placing &&
    !placingPerson &&
    !measure &&
    !(isMobile && mtab !== 'none');

  const toggleSplitMood = () => {
    setSplitMood((prev) => {
      const next = !prev;
      if (next) useStore.setState({ rightOpen: true });
      return next;
    });
  };

  const openInspector = () => {
    if (isMobile) {
      setSplitMood(false);
      useStore.setState({ rightOpen: true });
      setMtab('right');
      return;
    }
    if (rightOpen && !splitMood) {
      useStore.setState({ rightOpen: false });
    } else {
      setSplitMood(false);
      useStore.setState({ rightOpen: true });
    }
  };

  return (
    <div className="studio-root">
      <main className="center-stage">
        <div style={{ position: 'absolute', inset: 0, display: stage3d ? 'block' : 'none' }}>
          <Viewport />
        </div>
        {view === '2d' && <PlanEditor editing={editPlan} onToggleEdit={toggleEditPlan} panelEl={planPanelEl} />}
        {view === 'mood' && <Moodboard />}

        <Header
          isMobile={isMobile}
          onToggleLeft={() => {
            if (isMobile) setMtab(mtab === 'left' ? 'none' : 'left');
            else useStore.setState({ leftOpen: !leftOpen });
          }}
          onVersions={() => {
            setLeftTab('versions');
            if (view === 'mood') setView('3d');
            if (isMobile) setMtab('left');
            else useStore.setState({ leftOpen: true });
          }}
          splitMood={splitMood}
          onSplitMood={toggleSplitMood}
          onHelp={() => setHelp(true)}
        />

        {view !== 'mood' && (
          <aside className={'left-panel' + (!leftOpen ? ' collapsed' : '') + (isMobile && mtab !== 'left' ? ' m-hidden' : '')}>
            <div className="left-tabs">
              {(
                [
                  ['catalog', '카탈로그'],
                  ['placed', `배치 ${furnCount}`],
                  ['human', '동선'],
                  ['versions', '버전'],
                ] as [LeftTab, string][]
              ).map(([id, l]) => (
                <button key={id} className={leftTab === id ? 'on' : ''} onClick={() => setLeftTab(id)}>
                  <span>{l}</span>
                </button>
              ))}
            </div>
            <div className="left-panel-content">
              {leftTab === 'catalog' && <CatalogPanel onCustom={(base, importUrl) => setEditor({ base, importUrl })} />}
              {leftTab === 'placed' && <LayoutListPanel />}
              {leftTab === 'human' && <HumanPanel />}
              {leftTab === 'versions' && <VersionsPanel onCompare={() => setCompare(true)} />}
            </div>
          </aside>
        )}

        {view !== 'mood' && (
          <aside className={'right-panel' + (!rightOpen ? ' collapsed' : '') + (isMobile && mtab !== 'right' ? ' m-hidden' : '')}>
            {splitMood ? (
              <div className="right-panel-inner">
                <div className="drawer-subhead">
                  <span>무드보드 레퍼런스</span>
                  <button className="icon-xs" onClick={() => setSplitMood(false)} title="속성 패널로 돌아가기">
                    <X size={14} />
                  </button>
                </div>
                <div className="right-panel-body">
                  <Moodboard compact />
                </div>
              </div>
            ) : planEditActive ? (
              <div className="panel-scroll" ref={setPlanPanelEl} />
            ) : (
              <Inspector />
            )}
          </aside>
        )}

        {(view === '3d' || view === 'top') && <ViewportHud />}
        {showSelectionBar && <SelectionBar inspectorOpen={rightOpen && !splitMood} onToggleInspector={openInspector} />}
        {(view === '3d' || view === 'top') && <CameraBar />}
        {view === 'walk' && <PovHud />}
        <PlaceHint />
        <HeatLegend />
        {toastOn && toast && <div className={'studio-toast' + (showSelectionBar ? ' raised' : '')}>{toast.msg}</div>}
      </main>

      {isMobile && view !== 'mood' && (
        <nav className="mobile-tabs">
          <button className={mtab === 'left' ? 'on' : ''} onClick={() => setMtab(mtab === 'left' ? 'none' : 'left')}>
            <Sofa size={15} /> 카탈로그·목록
          </button>
          <button
            className={mtab === 'right' ? 'on' : ''}
            onClick={() => {
              useStore.setState({ rightOpen: true });
              setMtab(mtab === 'right' ? 'none' : 'right');
            }}
          >
            <SlidersHorizontal size={15} /> 속성·마감
          </button>
          <button className={mtab === 'none' ? 'on' : ''} onClick={() => setMtab('none')}>
            <Box size={15} /> 화면 크게
          </button>
        </nav>
      )}
      {editor && <ProductEditor base={editor.base} importUrl={editor.importUrl} onClose={() => setEditor(null)} />}
      {compare && <CompareModal onClose={() => setCompare(false)} />}
      {help && <Help onClose={() => setHelp(false)} />}
      <ShotModal />
      <span hidden>{project.id}</span>
    </div>
  );
}

// ------------------------------------------------------------------ floating 3-zone header
function Header({
  isMobile,
  onToggleLeft,
  onVersions,
  splitMood,
  onSplitMood,
  onHelp,
}: {
  isMobile: boolean;
  onToggleLeft: () => void;
  onVersions: () => void;
  splitMood: boolean;
  onSplitMood: () => void;
  onHelp: () => void;
}) {
  const project = useStore((s) => s.project)!;
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const setActiveVersion = useStore((s) => s.setActiveVersion);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const sync = useStore((s) => s.sync);
  const saveState = useStore((s) => s.saveState);
  const st = syncText(sync);
  const totals = useLayoutTotals();
  const v = activeVersion(project)!;
  const area = project.info?.area ?? project.plan.rooms.reduce((a, r) => a + polyArea(r.points), 0) / 10000;
  const [verOpen, setVerOpen] = useState(false);
  const verRef = useRef<HTMLDivElement>(null);
  useOutsideClose(verOpen, verRef, () => setVerOpen(false));
  const sortedVersions = useMemo(() => [...project.versions].sort((a, b) => b.updatedAt - a.updatedAt), [project.versions]);

  const syncLabel =
    saveState === 'saving'
      ? '저장 중'
      : saveState === 'error'
        ? sync === 'server'
          ? '연결 대기 · 이 기기에 보관'
          : '저장 실패'
        : st.long;

  return (
    <header className="studio-header">
      {/* Left Pill: Drawer toggle + Project / Version switcher + Meta */}
      <div className="header-pill header-pill-left" ref={verRef}>
        {view !== 'mood' && !isMobile && (
          <>
            <button className="icon-pill" onClick={onToggleLeft} title={leftOpen ? '좌측 패널 접기' : '좌측 패널 열기'} aria-label="좌측 패널 토글">
              {leftOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
            <span className="pill-sep" />
          </>
        )}
        <span className="brand-title" title={project.name}>
          {project.name}
        </span>
        <span className="crumb-slash">/</span>
        <button className={'ver-trigger' + (verOpen ? ' on' : '')} onClick={() => setVerOpen((x) => !x)} title="버전 전환">
          <span className="ver-trigger-name">{v.name}</span>
          <ChevronDown size={12} />
        </button>
        <span className="header-meta mono" title={syncLabel}>
          <span className={'sync-pip st-' + saveState} />
          {area.toFixed(1)}㎡ · {fmtWon(totals.total)}
        </span>

        {verOpen && (
          <div className="popover-menu ver-popover">
            <div className="popover-head">배치 버전 ({sortedVersions.length})</div>
            <div className="popover-list">
              {sortedVersions.map((ver) => {
                const active = ver.id === v.id;
                return (
                  <button
                    key={ver.id}
                    className={'popover-item' + (active ? ' on' : '')}
                    onClick={() => {
                      setActiveVersion(ver.id);
                      setVerOpen(false);
                    }}
                  >
                    <span className="popover-item-title">{ver.name}</span>
                    {active && <Check size={13} />}
                  </button>
                );
              })}
            </div>
            <div className="popover-foot">
              <button
                className="popover-action"
                onClick={() => {
                  setVerOpen(false);
                  onVersions();
                }}
              >
                새 버전 저장 · 비교 관리…
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Center Pill: Mode Switcher */}
      <nav className="mode-switcher" aria-label="화면 모드">
        <button className={view === '3d' || view === 'top' ? 'on' : ''} onClick={() => setView('3d')}>
          <Box size={14} /> <span>3D</span>
        </button>
        <button className={view === '2d' ? 'on' : ''} onClick={() => setView('2d')}>
          <LayoutGrid size={14} /> <span>2D 평면</span>
        </button>
        <button className={view === 'walk' ? 'on' : ''} onClick={() => setView('walk')}>
          <Footprints size={14} /> <span>1인칭</span>
        </button>
        <button className={view === 'mood' ? 'on' : ''} onClick={() => setView('mood')}>
          <Palette size={14} /> <span>무드보드</span>
          {project.moodboard.length > 0 && <em className="mode-count mono">{project.moodboard.length}</em>}
        </button>
      </nav>

      {/* Right Pill: Minimal Utility Cluster */}
      <div className="header-pill header-pill-right">
        <button className="icon-pill" disabled={!past} onClick={undo} title="되돌리기 (Cmd+Z)" aria-label="되돌리기">
          <Undo2 size={15} />
        </button>
        <button className="icon-pill" disabled={!future} onClick={redo} title="다시 실행 (Cmd+Shift+Z)" aria-label="다시 실행">
          <Redo2 size={15} />
        </button>
        <span className="pill-sep hide-m" />
        <button className="icon-pill" onClick={toggleTheme} title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'} aria-label="테마 전환">
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        {view !== 'mood' && (
          <button
            className={'icon-pill hide-m' + (splitMood && rightOpen ? ' on' : '')}
            onClick={onSplitMood}
            title="우측 패널에 무드보드 레퍼런스 띄우기"
            aria-label="무드보드 함께보기"
          >
            <Columns2 size={15} />
          </button>
        )}
        {view !== 'mood' && (
          <button
            className="icon-pill hide-m"
            onClick={() => useStore.setState({ rightOpen: !rightOpen })}
            title={rightOpen ? '우측 속성 패널 접기' : '우측 속성 패널 열기'}
            aria-label="우측 패널 토글"
          >
            {rightOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
        )}
        <button className="icon-pill hide-m" onClick={onHelp} title="단축키 · 도움말" aria-label="도움말">
          <HelpCircle size={15} />
        </button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ persistent bottom-left viewport HUD
function ViewportHud() {
  const project = useStore((s) => s.project)!;
  const show = useStore((s) => s.show);
  const setShow = useStore((s) => s.setShow);
  const snap = useStore((s) => s.snap);
  const setSnap = useStore((s) => s.setSnap);
  const mutateVersion = useStore((s) => s.mutateVersion);
  const v = activeVersion(project)!;
  const f = v.finishes;
  const prof = project.profiles.find((p) => p.id === project.activeProfileId) ?? project.profiles[0];
  const avatar = mainAvatar(project, v);
  const [pop, setPop] = useState<'light' | 'walls' | 'layers' | null>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  useOutsideClose(pop !== null, hudRef, () => setPop(null));

  const tIdx = Math.max(0, TIMES.findIndex((t) => Math.abs(t.hour - f.hour) < 1.5 && t.lamps === f.lampsOn));
  const curTime = TIMES[tIdx] ?? TIMES[1];
  const curWall = WALL_MODES.find((w) => w.id === show.walls) ?? WALL_MODES[0];
  const extraLayersOn = show.heatmap || show.clearance || show.grid;

  return (
    <div className="viewport-hud" ref={hudRef}>
      <button className={'hud-btn' + (pop === 'light' ? ' on' : '')} onClick={() => setPop(pop === 'light' ? null : 'light')} title="채광 및 조명 설정">
        {curTime.id === 'morning' && <Sunrise size={14} />}
        {curTime.id === 'noon' && <Sun size={14} />}
        {curTime.id === 'golden' && <Sunset size={14} />}
        {curTime.id === 'night' && <Moon size={14} />}
        <span>{curTime.short}</span>
      </button>
      <span className="pill-sep" />
      <button className={'hud-btn' + (pop === 'walls' ? ' on' : '')} onClick={() => setPop(pop === 'walls' ? null : 'walls')} title="벽 표시 모드">
        <span>{curWall.label}</span>
      </button>
      <span className="pill-sep" />
      <button className={'hud-btn' + (pop === 'layers' || extraLayersOn ? ' accent' : '')} onClick={() => setPop(pop === 'layers' ? null : 'layers')} title="표시 레이어 및 스냅">
        <Layers size={14} />
        <span>레이어</span>
      </button>
      <span className="pill-sep" />
      <button
        className={'hud-btn' + (show.people && avatar ? ' accent' : '')}
        onClick={() => (avatar ? setShow({ people: !show.people }) : updateAvatar({}))}
        title="실제 사람 크기 아바타 표시"
      >
        <User size={14} />
        <span className="mono">{prof?.height}cm</span>
      </button>

      {pop === 'light' && (
        <div className="hud-popover">
          <div className="popover-head">채광 · 조명</div>
          <div className="seg-grid-4" style={{ marginBottom: 10 }}>
            {TIMES.map((t) => (
              <button
                key={t.id}
                className={'seg-btn' + (curTime.id === t.id ? ' on' : '')}
                onClick={() => mutateVersion((vv) => Object.assign(vv.finishes, { hour: t.hour, lampsOn: t.lamps }), false)}
              >
                {t.short}
              </button>
            ))}
          </div>
          <div className="insp-label-row">
            <span className="mini-cap" style={{ margin: 0 }}>시간대</span>
            <b className="mono" style={{ fontSize: 12 }}>{Math.floor(f.hour)}:{f.hour % 1 >= 0.5 ? '30' : '00'}</b>
          </div>
          <input
            type="range"
            min={5}
            max={23}
            step={0.5}
            value={f.hour}
            onPointerDown={() => useStore.getState().checkpoint()}
            onChange={(e) => mutateVersion((vv) => (vv.finishes.hour = +e.target.value), false)}
            style={{ width: '100%', margin: '6px 0 10px' }}
          />
          <div className="seg-grid-2">
            <button className={'toggle-pill' + (f.lampsOn ? ' on' : '')} onClick={() => mutateVersion((vv) => (vv.finishes.lampsOn = !vv.finishes.lampsOn), false)}>
              <span>스탠드·펜던트</span>
              <b>{f.lampsOn ? '켜짐' : '꺼짐'}</b>
            </button>
            <button className={'toggle-pill' + (f.ceilingLights ? ' on' : '')} onClick={() => mutateVersion((vv) => (vv.finishes.ceilingLights = !vv.finishes.ceilingLights), false)}>
              <span>천장등</span>
              <b>{f.ceilingLights ? '켜짐' : '꺼짐'}</b>
            </button>
          </div>
        </div>
      )}

      {pop === 'walls' && (
        <div className="hud-popover hud-popover-sm">
          <div className="popover-head">벽 표시 모드</div>
          <div className="popover-list">
            {WALL_MODES.map((w) => (
              <button
                key={w.id}
                className={'popover-item' + (show.walls === w.id ? ' on' : '')}
                onClick={() => {
                  setShow({ walls: w.id });
                  setPop(null);
                }}
              >
                <span>{w.label}</span>
                {show.walls === w.id && <Check size={13} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {pop === 'layers' && (
        <div className="hud-popover">
          <div className="popover-head">표시 레이어 · 스냅</div>
          <label className="chk-row">
            <input type="checkbox" checked={show.dims} onChange={(e) => setShow({ dims: e.target.checked })} />
            <span>선택 가구 치수 · 4방향 여유(cm)</span>
          </label>
          <label className="chk-row">
            <input type="checkbox" checked={show.clearance} onChange={(e) => setShow({ clearance: e.target.checked })} />
            <span>사용 공간 가이드 (문·서랍·의자)</span>
          </label>
          <label className="chk-row">
            <input type="checkbox" checked={show.heatmap} onChange={(e) => setShow({ heatmap: e.target.checked })} />
            <span>동선 폭 히트맵</span>
          </label>
          <label className="chk-row">
            <input type="checkbox" checked={show.collisions} onChange={(e) => setShow({ collisions: e.target.checked })} />
            <span>겹침·문 막힘 표시</span>
          </label>
          <label className="chk-row">
            <input type="checkbox" checked={show.grid} onChange={(e) => setShow({ grid: e.target.checked })} />
            <span>바닥 50cm 격자</span>
          </label>
          <label className="chk-row">
            <input type="checkbox" checked={show.labels} onChange={(e) => setShow({ labels: e.target.checked })} />
            <span>방·가구 이름표</span>
          </label>
          <div className="hud-sep" />
          <label className="chk-row">
            <input
              type="checkbox"
              checked={snap.walls && snap.objects}
              onChange={(e) => setSnap({ walls: e.target.checked, objects: e.target.checked, grid: e.target.checked ? 1 : 0, angle: e.target.checked ? 15 : 0 })}
            />
            <span>자석 스냅 (1cm · 벽/가구 밀착)</span>
          </label>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ contextual selection action bar
function swapPosition(it: PlacedItem, from: Product, to: Product) {
  const oldD = (it.dims ?? from.dims).d;
  const { uz } = itemAxes(it.rot);
  const back: [number, number] = [it.x - (uz[0] * oldD) / 2, it.z - (uz[1] * oldD) / 2];
  return { x: back[0] + (uz[0] * to.dims.d) / 2, z: back[1] + (uz[1] * to.dims.d) / 2 };
}

function SelectionBar({ inspectorOpen, onToggleInspector }: { inspectorOpen: boolean; onToggleInspector: () => void }) {
  const project = useStore((s) => s.project)!;
  const selection = useStore((s) => s.selection);
  const updateItems = useStore((s) => s.updateItems);
  const duplicateSelected = useStore((s) => s.duplicateSelected);
  const removeSelected = useStore((s) => s.removeSelected);
  const notify = useStore((s) => s.notify);
  const v = activeVersion(project)!;
  const items = v.items.filter((i) => selection.includes(i.id));
  const people = v.people.filter((h) => selection.includes(h.id));
  const [swapOpen, setSwapOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  useOutsideClose(swapOpen, barRef, () => setSwapOpen(false));

  useEffect(() => {
    setSwapOpen(false);
  }, [selection]);

  // Single person avatar selected
  if (people.length === 1 && !items.length) {
    const h = people[0];
    const prof = project.profiles.find((p) => p.id === h.profileId) ?? project.profiles[0];
    const setH = (pose: Pose) =>
      updateItems([h.id], (x) => Object.assign(x as unknown as typeof h, { pose, y: pose === 'sit' ? h.y || 45 : pose === 'lie' ? h.y || 42 : 0 }));
    return (
      <div className="selection-bar" ref={barRef}>
        <span className="sel-bar-name">
          {prof?.name} <em className="mono">{prof?.height}cm</em>
        </span>
        <span className="pill-sep" />
        {(
          [
            ['stand', '서기'],
            ['sit', '앉기'],
            ['lie', '눕기'],
          ] as [Pose, string][]
        ).map(([pose, label]) => (
          <button key={pose} className={'sel-bar-btn' + (h.pose === pose ? ' on' : '')} onClick={() => setH(pose)}>
            {label}
          </button>
        ))}
        <span className="pill-sep" />
        <button className={'sel-bar-btn' + (inspectorOpen ? ' on' : '')} onClick={onToggleInspector} title="속성 패널 열기/닫기">
          <SlidersHorizontal size={14} />
        </button>
        <button className="sel-bar-btn danger" onClick={removeSelected} title="아바타 삭제">
          <Trash2 size={14} />
        </button>
      </div>
    );
  }

  // Multiple furniture items selected
  if (items.length > 1) {
    const allLocked = items.every((i) => i.locked);
    return (
      <div className="selection-bar" ref={barRef}>
        <span className="sel-bar-name mono">{items.length}개 선택</span>
        <span className="pill-sep" />
        <button className="sel-bar-btn" onClick={duplicateSelected} title="복제 (Cmd+D)">
          <Copy size={14} /> <span>복제</span>
        </button>
        <button className="sel-bar-btn" onClick={() => updateItems(selection, (x) => (x.locked = !allLocked))} title="고정 전환">
          {allLocked ? <Unlock size={14} /> : <Lock size={14} />} <span>{allLocked ? '고정 해제' : '고정'}</span>
        </button>
        <button className={'sel-bar-btn' + (inspectorOpen ? ' on' : '')} onClick={onToggleInspector} title="속성 · 정렬 패널 열기/닫기">
          <SlidersHorizontal size={14} /> <span>속성</span>
        </button>
        <button className="sel-bar-btn danger" onClick={removeSelected} title="삭제">
          <Trash2 size={14} />
        </button>
      </div>
    );
  }

  // Single furniture item selected
  if (items.length !== 1) return null;
  const it = items[0];
  const prod = getProduct(it.productId, project);
  if (!prod) return null;

  const all = [...project.customProducts, ...PRODUCTS];
  const candidates = prod.builtin
    ? []
    : all
        .filter((p) => p.category === prod.category && p.id !== prod.id)
        .sort((a, b) => (project.shortlist.includes(b.id) ? 1 : 0) - (project.shortlist.includes(a.id) ? 1 : 0))
        .slice(0, 12);

  const doSwap = (to: Product) => {
    const pos = swapPosition(it, prod, to);
    updateItems([it.id], (x) => {
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
    setSwapOpen(false);
    notify(`'${to.name}'로 교체했어요`);
  };

  return (
    <div className="selection-bar" ref={barRef}>
      <span className="sel-bar-name" title={it.label || prod.name}>
        {it.label || prod.name}
      </span>
      <span className="pill-sep" />
      <button
        className="sel-bar-btn"
        disabled={it.locked}
        onClick={() => updateItems([it.id], (x) => (x.rot = normDeg(x.rot - 90)))}
        title="90° 회전 (R)"
      >
        <RotateCw size={14} /> <span>90°</span>
      </button>
      <button
        className={'sel-bar-btn' + (it.mirror ? ' on' : '')}
        disabled={it.locked}
        onClick={() => updateItems([it.id], (x) => (x.mirror = !x.mirror))}
        title="좌우 반전"
      >
        <FlipHorizontal size={14} />
      </button>
      {candidates.length > 0 && (
        <button className={'sel-bar-btn' + (swapOpen ? ' on' : '')} onClick={() => setSwapOpen((x) => !x)} title="이 자리에 다른 판매 후보 교체">
          <RefreshCw size={14} /> <span>교체</span>
        </button>
      )}
      <button className="sel-bar-btn" onClick={() => testWithHuman(it, prod)} title="사람 아바타로 사용 공간 확인">
        <UserCheck size={14} /> <span>사람</span>
      </button>
      <span className="pill-sep" />
      <button className={'sel-bar-btn' + (inspectorOpen ? ' on' : '')} onClick={onToggleInspector} title="속성 패널 열기/닫기">
        <SlidersHorizontal size={14} />
      </button>
      <button className="sel-bar-btn" onClick={duplicateSelected} title="복제 (Cmd+D)">
        <Copy size={14} />
      </button>
      <button className={'sel-bar-btn' + (it.locked ? ' on' : '')} onClick={() => updateItems([it.id], (x) => (x.locked = !x.locked))} title={it.locked ? '고정 풀기 (L)' : '고정 (L)'}>
        {it.locked ? <Unlock size={14} /> : <Lock size={14} />}
      </button>
      <button className="sel-bar-btn danger" disabled={it.locked} onClick={removeSelected} title="삭제 (Delete)">
        <Trash2 size={14} />
      </button>

      {swapOpen && (
        <div className="hud-popover swap-popover">
          <div className="popover-head">이 자리 후보 교체 · 뒷면 위치 유지</div>
          <div className="popover-list">
            {candidates.map((cand) => (
              <button key={cand.id} className="popover-item swap-pop-item" onClick={() => doSwap(cand)}>
                <span className="color-dot" style={{ background: Object.values(resolveMats(cand))[0]?.color }} />
                <div className="swap-pop-info">
                  <div className="swap-pop-name">{cand.name}</div>
                  <div className="swap-pop-sub mono">
                    {cand.brand} · {cand.dims.w}×{cand.dims.d}
                    {cand.price ? ` · ${fmtWon(cand.price)}` : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ compact bottom-right camera bar
function CameraBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const measure = useStore((s) => s.measure);
  const requestShot = useStore((s) => s.requestShot);
  const [presetOpen, setPresetOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  useOutsideClose(presetOpen, barRef, () => setPresetOpen(false));

  const go = (p: 'iso' | 'window' | 'entry' | 'desk') => {
    setPresetOpen(false);
    if (view !== '3d') {
      setView('3d');
      setTimeout(() => requestCamera(p), 60);
    } else requestCamera(p);
  };

  return (
    <div className="camera-bar" ref={barRef}>
      <button className={view === '3d' ? 'on' : ''} onClick={() => go('iso')} title="전체 3D 시점">
        ISO
      </button>
      <button className={view === 'top' ? 'on' : ''} onClick={() => setView(view === 'top' ? '3d' : 'top')} title="수직 탑뷰">
        탑뷰
      </button>
      <button className={presetOpen ? 'on' : ''} onClick={() => setPresetOpen((x) => !x)} title="시점 프리셋">
        시점 <ChevronDown size={11} />
      </button>
      <span className="cam-sep" />
      <button onClick={() => requestCamera('zoom', { f: 0.8 })} title="확대" aria-label="확대">
        <Plus size={13} />
      </button>
      <button onClick={() => requestCamera('zoom', { f: 1.25 })} title="축소" aria-label="축소">
        <Minus size={13} />
      </button>
      <span className="cam-sep" />
      <button
        className={measure ? 'accent' : ''}
        title="줄자 (M) — 두 점을 클릭해 길이 재기"
        aria-label="줄자"
        onClick={() => {
          useStore.setState({ measure: !measure, placing: null, placingPerson: null });
          useScene.getState().set({ measureStart: null, measureHover: null });
        }}
      >
        <Ruler size={13} />
      </button>
      <button title="3D PNG 캡처" aria-label="3D 캡처" onClick={requestShot}>
        <Camera size={13} />
      </button>

      {presetOpen && (
        <div className="hud-popover hud-popover-right hud-popover-sm">
          <div className="popover-head">시점 이동</div>
          <div className="popover-list">
            <button className="popover-item" onClick={() => go('iso')}>전체 3D</button>
            <button className="popover-item" onClick={() => go('window')}>창가 뷰</button>
            <button className="popover-item" onClick={() => go('entry')}>현관 → 거실</button>
            <button className="popover-item" onClick={() => go('desk')}>책상 · 붙박이장</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlaceHint() {
  const placing = useStore((s) => s.placing);
  const placingPerson = useStore((s) => s.placingPerson);
  const measure = useStore((s) => s.measure);
  const measures = useScene((s) => s.measures);
  const project = useStore((s) => s.project)!;
  if (!placing && !placingPerson && !measure) return null;
  const name = placing ? getProduct(placing.productId, project)?.name : '';
  return (
    <div className="place-hint">
      <Crosshair size={13} />
      {placing && `${name} — 놓을 곳 클릭 · R 회전 · Shift+클릭 연속 배치`}
      {placingPerson && '사람을 세울 곳을 클릭'}
      {measure && '두 점을 클릭해 거리 측정'}
      {measure && measures.length > 0 && <button onClick={() => useScene.getState().set({ measures: [] })}>지우기</button>}
      <button
        onClick={() => {
          useStore.getState().cancelPlacing();
          useStore.setState({ measure: false });
          useScene.getState().set({ measureStart: null });
        }}
      >
        취소 (Esc)
      </button>
    </div>
  );
}

function HeatLegend() {
  const on = useStore((s) => s.show.heatmap);
  const view = useStore((s) => s.view);
  const leftOpen = useStore((s) => s.leftOpen);
  const project = useStore((s) => s.project)!;
  if (!on || !(view === '3d' || view === 'top')) return null;
  const prof = project.profiles.find((p) => p.id === project.activeProfileId) ?? project.profiles[0];
  const id = ideals(prof.height, prof.shoulder);
  return (
    <div className={'stage-legend' + (leftOpen ? ' shifted' : '')}>
      <span className="legend-dot" style={{ background: '#e5484d' }} /> 통과 불가 (&lt;{Math.round(id.passMin)}cm)
      <span className="legend-dot" style={{ background: '#f08c00' }} /> 좁음 (&lt;75cm)
      <span className="legend-dot" style={{ background: '#e0b100' }} /> 1인 통행 (&lt;90cm)
      <span className="legend-dot" style={{ background: '#30a46c' }} /> 여유
      <span className="legend-dot" style={{ background: '#7c4dff' }} /> 도달 불가
    </div>
  );
}

function PovHud() {
  const project = useStore((s) => s.project)!;
  const setView = useStore((s) => s.setView);
  const pose = useScene((s) => s.walkPose);
  const eye = useScene((s) => s.walkEye);
  const prof = project.profiles.find((p) => p.id === project.activeProfileId) ?? project.profiles[0];
  const a = anthro(prof.height, prof.shoulder);
  const set = useScene.getState().set;
  return (
    <div className="pov-hud">
      <div className="pov-hud-title">
        <Eye size={14} />
        <span>
          1인칭 눈높이 · {prof.height}cm ({pose === 'sit' ? '착석' : pose === 'lie' ? '와식' : '보행'} {Math.round(eye ?? a.eyeH)}cm)
        </span>
      </div>
      <div className="pov-hud-sub">드래그 둘러보기 · 바닥 클릭 이동 · 소파/침대 클릭 앉기·눕기 · WASD</div>
      <div className="pov-hud-btns">
        <button className={pose === 'stand' ? 'on' : ''} onClick={() => set({ walkPose: 'stand' })}>
          서서 걷기
        </button>
        <button className={pose === 'sit' ? 'on' : ''} onClick={() => set({ walkPose: 'sit', walkSurface: 45, walkTarget: null })}>
          앉은 눈높이
        </button>
        <button className={pose === 'lie' ? 'on' : ''} onClick={() => set({ walkPose: 'lie', walkSurface: 42, walkTarget: null })}>
          누운 눈높이
        </button>
        <button className="exit-pov" onClick={() => setView('3d')}>
          나가기 (Esc)
        </button>
      </div>
    </div>
  );
}

function ShotModal() {
  const [shot, setShot] = useState<{ full: string; version: string } | null>(null);
  useEffect(() => {
    const f = (e: Event) => setShot((e as CustomEvent).detail);
    window.addEventListener('2ndhome:shot', f);
    return () => window.removeEventListener('2ndhome:shot', f);
  }, []);
  if (!shot) return null;
  return (
    <Modal
      title="3D 이미지 캡처"
      sub="현재 버전 썸네일에도 함께 반영했어요"
      onClose={() => setShot(null)}
      size="lg"
      foot={
        <button className="btn-primary" onClick={() => void download(`2ndhome-${shot.version}.png`, dataUrlToBlob(shot.full))}>
          PNG 저장
        </button>
      }
    >
      <img src={shot.full} alt="" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
    </Modal>
  );
}

function Help({ onClose }: { onClose: () => void }) {
  const shortcuts: [string, string][] = [
    ['클릭 → 드래그 / 파란 고리', '가구 선택 후 이동 · 회전 (벽 자동 밀착, Alt 스냅 해제)'],
    ['미선택 영역 드래그 / 우클릭', '3D 카메라 회전 · 평행 이동'],
    ['1인칭 바닥·가구 클릭', '바닥으로 걸어가기 · 소파/침대 앉기·눕기'],
    ['R / Shift+R', '선택·배치 가구 90° 회전'],
    ['Q / E', '선택 가구 15° 미세 회전'],
    ['화살표 / Shift+화살표', '1cm / 10cm 이동'],
    ['PgUp / PgDn', '바닥에서 띄우기 높이 ±5cm'],
    ['Cmd+D / Delete', '복제 / 삭제'],
    ['H / L', '숨기기 / 고정 전환'],
    ['1 / 2 / 3 / M', '3D / 2D 평면 / 1인칭 / 줄자'],
    ['Cmd+Z / Cmd+Shift+Z', '되돌리기 / 다시 실행'],
    ['Esc', '선택·배치·줄자·1인칭 해제'],
  ];
  return (
    <Modal title="조작 및 단축키" sub="2ndhome Studio" onClose={onClose}>
      <div className="shortcut-list">
        {shortcuts.map(([k, desc]) => (
          <div key={k} className="shortcut-row">
            <kbd className="mono">{k}</kbd>
            <span>{desc}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ keyboard
function useKeys(planEditActive: boolean) {
  const planEditRef = useRef(planEditActive);
  planEditRef.current = planEditActive;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.closest('input,textarea,select,[contenteditable]')) return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (s.view === 'mood') return;
      if (e.key === 'Escape') {
        if (s.placing || s.placingPerson) s.cancelPlacing();
        else if (s.measure) useStore.setState({ measure: false });
        else if (s.view === 'walk') s.setView('3d');
        else if (!planEditRef.current) s.select([]);
        useScene.getState().set({ ghost: null, guides: [], measureStart: null, walkTarget: null });
        return;
      }
      if (s.view !== 'walk') {
        if (e.key === '1') return s.setView('3d');
        if (e.key === '2') return s.setView('2d');
        if (e.key === '3') return s.setView('walk');
        if (e.key.toLowerCase() === 'm' && !mod) {
          useStore.setState({ measure: !s.measure, placing: null });
          return;
        }
      }
      if (s.placing && (e.key === 'r' || e.key === 'R')) {
        const g = useScene.getState().ghost;
        if (g) useScene.getState().set({ ghost: { ...g, rot: normDeg(g.rot + (e.shiftKey ? 90 : -90)) }, ghostManualRot: true });
        return;
      }
      if (planEditRef.current) return;
      const sel = s.selection;
      if (!sel.length || s.view === 'walk') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.removeSelected();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        s.duplicateSelected();
        return;
      }
      const v = activeVersion(s.project)!;
      const movable = sel.filter((id) => !v.items.find((i) => i.id === id)?.locked);
      if (!movable.length) return;
      if (e.key === 'r' || e.key === 'R') return s.updateItems(movable, (it) => (it.rot = normDeg(it.rot + (e.shiftKey ? 90 : -90))));
      if (e.key === 'q' || e.key === 'Q') return s.updateItems(movable, (it) => (it.rot = normDeg(it.rot + (s.snap.angle || 15))));
      if (e.key === 'e' || e.key === 'E') return s.updateItems(movable, (it) => (it.rot = normDeg(it.rot - (s.snap.angle || 15))));
      if (e.key === 'h' || e.key === 'H') return s.updateItems(movable, (it) => (it.hidden = true));
      if (e.key === 'l' || e.key === 'L') return s.updateItems(sel, (it) => (it.locked = !it.locked));
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        return s.updateItems(movable, (it) => (it.y = Math.max(0, it.y + (e.key === 'PageUp' ? 5 : -5))));
      }
      const d = e.shiftKey ? 10 : 1;
      const m = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (m) {
        e.preventDefault();
        s.updateItems(movable, (it) => {
          it.x += m[0];
          it.z += m[1];
        });
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
}

export { useMemo };
