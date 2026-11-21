import {
  Box,
  Camera,
  Cloud,
  CloudOff,
  Columns2,
  Crosshair,
  Eye,
  Footprints,
  HelpCircle,
  History,
  Layers,
  LayoutGrid,
  Moon,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Ruler,
  Save,
  SlidersHorizontal,
  Sofa,
  Sun,
  Sunrise,
  Sunset,
  Undo2,
  User,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { anthro, ideals } from './lib/ergonomics';
import { fmtWon, normDeg, polyArea, pyeong } from './lib/geometry';
import { requestCamera, useScene } from './scene/sceneState';
import { Viewport } from './scene/Viewport';
import { activeVersion, getProduct, syncText, useStore } from './store/store';
import type { Product } from './types';
import { mainAvatar, updateAvatar } from './ui/actions';
import { CatalogPanel } from './ui/CatalogPanel';
import { dataUrlToBlob, download, Modal } from './ui/common';
import { useErgo } from './ui/ergo';
import { Inspector } from './ui/Inspector';
import { LoginScreen } from './ui/Login';
import { Moodboard } from './ui/Moodboard';
import { PlanEditor } from './ui/PlanEditor';
import { ProductEditor } from './ui/ProductEditor';
import { CompareModal, HumanPanel, LayoutListPanel, VersionsPanel } from './ui/StudioPanels';

type LeftTab = 'catalog' | 'placed' | 'human' | 'versions';

const TIMES: { id: string; hour: number; lamps: boolean }[] = [
  { id: 'morning', hour: 8, lamps: false },
  { id: 'noon', hour: 13, lamps: false },
  { id: 'golden', hour: 17, lamps: false },
  { id: 'night', hour: 21, lamps: true },
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

export default function App() {
  const ready = useStore((s) => s.ready);
  const gate = useStore((s) => s.gate);
  const init = useStore((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);
  if (gate === 'login') return <LoginScreen />;
  if (!ready) return <div style={{ padding: 40, color: '#8c857b' }}>불러오는 중…</div>;
  return <Studio />;
}

function Studio() {
  const project = useStore((s) => s.project)!;
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const rightOpen = useStore((s) => s.rightOpen);
  const selection = useStore((s) => s.selection);
  const toast = useStore((s) => s.toast);
  const isMobile = useIsMobile();
  const [leftTab, setLeftTab] = useState<LeftTab>('catalog');
  const [splitMood, setSplitMood] = useState(false);
  const [editPlan, setEditPlan] = useState(false);
  const [compare, setCompare] = useState(false);
  const [editor, setEditor] = useState<{ base?: Product } | null>(null);
  const [help, setHelp] = useState(false);
  const [mtab, setMtab] = useState<'left' | 'right' | 'none'>('none');
  const [toastOn, setToastOn] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setToastOn(true);
    const t = setTimeout(() => setToastOn(false), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (selection.length) {
      useStore.setState({ rightOpen: true });
      if (isMobile) setMtab('right');
    }
  }, [selection, isMobile]);
  useKeys();

  const stage3d = view === '3d' || view === 'top' || view === 'walk';
  return (
    <div className="studio-root">
      <Header
        leftTab={leftTab}
        onVersions={() => {
          setLeftTab('versions');
          if (view === 'mood') setView('3d');
          if (isMobile) setMtab('left');
        }}
        splitMood={splitMood}
        onSplitMood={() => setSplitMood((x) => !x)}
        onHelp={() => setHelp(true)}
      />
      <div className="studio-body">
        {view !== 'mood' && (
          <aside className={'left-panel' + (isMobile && mtab !== 'left' ? ' m-hidden' : '')}>
            <div className="left-tabs">
              {(
                [
                  ['catalog', <Sofa key="c" size={15} />, '가구 후보'],
                  ['placed', <Layers key="p" size={15} />, '배치목록'],
                  ['human', <User key="h" size={15} />, '사람·동선'],
                  ['versions', <History key="v" size={15} />, '버전저장'],
                ] as [LeftTab, JSX.Element, string][]
              ).map(([id, ic, l]) => (
                <button key={id} className={leftTab === id ? 'on' : ''} onClick={() => setLeftTab(id)}>
                  {ic}
                  <span>{l}</span>
                </button>
              ))}
            </div>
            <div className="left-panel-content">
              {leftTab === 'catalog' && <CatalogPanel onCustom={(base) => setEditor({ base })} />}
              {leftTab === 'placed' && <LayoutListPanel />}
              {leftTab === 'human' && <HumanPanel />}
              {leftTab === 'versions' && <VersionsPanel onCompare={() => setCompare(true)} />}
            </div>
          </aside>
        )}

        <main className="center-stage">
          <div style={{ position: 'absolute', inset: 0, display: stage3d ? 'block' : 'none' }}>
            <Viewport />
          </div>
          {(view === '3d' || view === 'top') && <CameraBar />}
          {view === '3d' && <div className="stage-hint">가구 클릭→드래그 이동 · 파란 고리→회전 · 빈 곳 드래그→화면 회전 · 우클릭/Shift→화면 이동</div>}
          {view === 'walk' && <PovHud />}
          {view === '2d' && <PlanEditor editing={editPlan} onToggleEdit={setEditPlan} />}
          {view === 'mood' && <Moodboard />}
          <PlaceHint />
          <HeatLegend />
          {toastOn && toast && <div className="studio-toast">{toast.msg}</div>}
        </main>

        {view !== 'mood' && splitMood && (
          <aside className={'split-mood-drawer' + (isMobile ? ' m-hidden' : '')}>
            <Moodboard compact />
          </aside>
        )}

        {view !== 'mood' && rightOpen && (
          <aside className={'right-panel' + (isMobile && mtab !== 'right' ? ' m-hidden' : '')}>
            <Inspector
              onEditPlan={() => {
                setView('2d');
                setEditPlan(true);
              }}
            />
          </aside>
        )}
      </div>
      {isMobile && view !== 'mood' && (
        <nav className="mobile-tabs">
          <button className={mtab === 'left' ? 'on' : ''} onClick={() => setMtab(mtab === 'left' ? 'none' : 'left')}>
            <Sofa size={15} /> 가구·목록
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
      {editor && <ProductEditor base={editor.base} onClose={() => setEditor(null)} />}
      {compare && <CompareModal onClose={() => setCompare(false)} />}
      {help && <Help onClose={() => setHelp(false)} />}
      <ShotModal />
      <span hidden>{project.id}</span>
    </div>
  );
}

// ------------------------------------------------------------------ header
function Header({ onVersions, splitMood, onSplitMood, onHelp }: { leftTab: LeftTab; onVersions: () => void; splitMood: boolean; onSplitMood: () => void; onHelp: () => void }) {
  const project = useStore((s) => s.project)!;
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const show = useStore((s) => s.show);
  const setShow = useStore((s) => s.setShow);
  const rightOpen = useStore((s) => s.rightOpen);
  const sync = useStore((s) => s.sync);
  const saveState = useStore((s) => s.saveState);
  const st = syncText(sync);
  const mutateVersion = useStore((s) => s.mutateVersion);
  const rep = useErgo();
  const v = activeVersion(project)!;
  const prof = project.profiles.find((p) => p.id === project.activeProfileId) ?? project.profiles[0];
  const area = project.info?.area ?? project.plan.rooms.reduce((a, r) => a + polyArea(r.points), 0) / 10000;
  const mark = project.name.match(/\d{3,4}/)?.[0] ?? '2nd';
  const f = v.finishes;
  const tIdx = Math.max(0, TIMES.findIndex((t) => Math.abs(t.hour - f.hour) < 1.5 && t.lamps === f.lampsOn));
  const cur = TIMES[tIdx]?.id ?? 'noon';
  const cycle = () => {
    const n = TIMES[(tIdx + 1) % TIMES.length];
    mutateVersion((vv) => Object.assign(vv.finishes, { hour: n.hour, lampsOn: n.lamps }), false);
  };
  const avatar = mainAvatar(project, v);
  return (
    <header className="studio-header">
      <div className="brand-block">
        <div className="brand-mark">{mark}</div>
        <div style={{ minWidth: 0 }}>
          <div className="brand-title">{project.name} Studio</div>
          <div className="brand-meta">
            전용 {area.toFixed(2)}㎡ ({pyeong(area * 10000).toFixed(1)}평){project.info?.note ? ` · ${project.info.note}` : ''} · 사용성 <b>{rep?.score ?? '–'}점</b>
          </div>
        </div>
      </div>

      <nav className="mode-switcher">
        <button className={view === '3d' || view === 'top' ? 'on' : ''} onClick={() => setView('3d')}>
          <Box size={15} /> 3D 공간
        </button>
        <button className={view === '2d' ? 'on' : ''} onClick={() => setView('2d')}>
          <LayoutGrid size={15} /> 2D 평면
        </button>
        <button className={view === 'walk' ? 'on' : ''} onClick={() => setView('walk')}>
          <Footprints size={15} /> 1인칭 체험
        </button>
        <button className={view === 'mood' ? 'on' : ''} onClick={() => setView('mood')}>
          <Palette size={15} /> 무드보드 ({project.moodboard.length})
        </button>
      </nav>

      <div className="header-actions">
        <button className="icon-pill" disabled={!past} onClick={undo} title="되돌리기 (Cmd+Z)">
          <Undo2 size={15} />
        </button>
        <button className="icon-pill" disabled={!future} onClick={redo} title="다시 실행 (Cmd+Shift+Z)">
          <Redo2 size={15} />
        </button>
        <button className="icon-pill hide-m" onClick={cycle} title="채광·시간대 전환 (아침/낮/노을/밤)" aria-label="채광·시간대 전환">
          {cur === 'morning' && <Sunrise size={15} />}
          {cur === 'noon' && <Sun size={15} />}
          {cur === 'golden' && <Sunset size={15} />}
          {cur === 'night' && <Moon size={15} />}
        </button>
        <button
          className={'pill-toggle hide-m' + (show.people && avatar ? ' on' : '')}
          onClick={() => (avatar ? setShow({ people: !show.people }) : updateAvatar({}))}
          title="실제 사람 사이즈 아바타 표시"
        >
          <User size={14} /> {prof?.height}cm
        </button>
        {view !== 'mood' && (
          <button className={'pill-toggle hide-m' + (splitMood ? ' on' : '')} onClick={onSplitMood} title="3D 화면 옆에 무드보드 레퍼런스 함께 띄우기">
            <Columns2 size={14} /> 무드 함께보기
          </button>
        )}
        <div className="budget-chip mono" title="현재 배치된 가구 예상 합계">
          {fmtWon(rep?.total ?? 0)}
        </div>
        <span className="sync-dot hide-m" title={st.long}>
          {st.shared ? <Cloud size={13} /> : <CloudOff size={13} />}
          {saveState === 'saving' ? '저장 중' : saveState === 'error' ? (sync === 'server' ? '연결 대기 · 이 기기에 보관' : '저장 실패') : '저장됨'}
        </span>
        <button className="btn-save-top" onClick={onVersions}>
          <Save size={14} /> 버전 ({project.versions.length})
        </button>
        {view !== 'mood' && (
          <button className="icon-pill hide-m" onClick={() => useStore.setState({ rightOpen: !rightOpen })} title="오른쪽 속성 패널 열기/닫기">
            {rightOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
        )}
        <button className="icon-pill hide-m" onClick={onHelp} title="도움말">
          <HelpCircle size={15} />
        </button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ stage overlays
function CameraBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const measure = useStore((s) => s.measure);
  const requestShot = useStore((s) => s.requestShot);
  const go = (p: 'iso' | 'window' | 'entry' | 'desk') => {
    if (view !== '3d') {
      setView('3d');
      setTimeout(() => requestCamera(p), 60);
    } else requestCamera(p);
  };
  return (
    <div className="camera-bar">
      <button onClick={() => go('iso')}>전체 3D</button>
      <button onClick={() => go('window')}>창가 뷰</button>
      <button onClick={() => go('entry')}>현관→거실</button>
      <button onClick={() => go('desk')}>책상·붙박이장</button>
      <button className={view === 'top' ? 'on' : ''} onClick={() => setView(view === 'top' ? '3d' : 'top')}>
        탑뷰
      </button>
      <span className="cam-sep" />
      <button onClick={() => requestCamera('zoom', { f: 0.8 })} disabled={view === 'top'}>
        ＋
      </button>
      <button onClick={() => requestCamera('zoom', { f: 1.25 })} disabled={view === 'top'}>
        －
      </button>
      <span className="cam-sep" />
      <button
        className={measure ? 'on' : ''}
        title="줄자 — 두 점을 클릭해 길이 재기"
        onClick={() => {
          useStore.setState({ measure: !measure, placing: null, placingPerson: null });
          useScene.getState().set({ measureStart: null, measureHover: null });
        }}
      >
        <Ruler size={13} />
      </button>
      <button title="3D PNG 캡처" onClick={requestShot}>
        <Camera size={13} />
      </button>
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
      {placing && `${name} — 놓을 곳 클릭 · R 회전 · Shift+클릭 여러 개`}
      {placingPerson && '사람을 세울 곳을 클릭'}
      {measure && '두 점을 클릭해 길이 재기'}
      {measure && measures.length > 0 && <button onClick={() => useScene.getState().set({ measures: [] })}>지우기</button>}
      <button
        onClick={() => {
          useStore.setState({ placing: null, placingPerson: null, measure: false });
          useScene.getState().set({ ghost: null, guides: [], measureStart: null });
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
  const project = useStore((s) => s.project)!;
  if (!on || !(view === '3d' || view === 'top')) return null;
  const prof = project.profiles.find((p) => p.id === project.activeProfileId) ?? project.profiles[0];
  const id = ideals(prof.height, prof.shoulder);
  return (
    <div className="stage-legend">
      <span style={{ color: '#e5484d' }}>■</span> 몸이 못 지나감 (&lt;{Math.round(id.passMin)}cm)
      <span style={{ color: '#f08c00' }}>■</span> 옆으로 지나가야 함 (&lt;75)
      <span style={{ color: '#e0b100' }}>■</span> 한 사람 OK (&lt;90)
      <span style={{ color: '#30a46c' }}>■</span> 넉넉함
      <span style={{ color: '#7c4dff' }}>■</span> 현관에서 갈 수 없는 곳
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
    <>
      <div className="walk-cross" />
      <div className="pov-hud">
        <div className="pov-hud-title">
          <Eye size={15} />
          <span>
            1인칭 눈높이 체험 (키 {prof.height}cm · {pose === 'sit' ? '착석 시점' : pose === 'lie' ? '침대 와식 시점' : '서서/걷기 시점'} · 눈높이 {Math.round(eye ?? a.eyeH)}cm)
          </span>
        </div>
        <div className="pov-hud-sub">
          <b>W·A·S·D</b> 또는 방향키로 걸어 다니기 · <b>마우스 드래그</b>로 둘러보기 · Shift 빠르게
        </div>
        <div className="pov-hud-btns">
          <button className={pose === 'stand' ? 'on' : ''} onClick={() => set({ walkPose: 'stand' })}>
            서서 걷기
          </button>
          <button className={pose === 'sit' ? 'on' : ''} onClick={() => set({ walkPose: 'sit', walkSurface: 45 })}>
            앉은 눈높이
          </button>
          <button className={pose === 'lie' ? 'on' : ''} onClick={() => set({ walkPose: 'lie', walkSurface: 42 })}>
            누운 눈높이
          </button>
          <button className="exit-pov" onClick={() => setView('3d')}>
            3D 전체로 나가기
          </button>
        </div>
      </div>
    </>
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
      sub="버전 썸네일로도 저장했어요"
      onClose={() => setShot(null)}
      size="lg"
      foot={
        <button className="btn-primary" onClick={() => void download(`2ndhome-${shot.version}.png`, dataUrlToBlob(shot.full))}>
          PNG 저장
        </button>
      }
    >
      <p className="mini-note" style={{ marginTop: 0 }}>
        저장 버튼이 안 되면 이미지를 길게 누르거나 우클릭해서 저장하세요.
      </p>
      <img src={shot.full} alt="" style={{ width: '100%', borderRadius: 10 }} />
    </Modal>
  );
}

function Help({ onClose }: { onClose: () => void }) {
  const items: [string, string][] = [
    ['3D 공간', '가구를 끌어 옮기고 파란 고리로 돌려요. 벽·다른 가구 모서리에 자석처럼 붙어요. 아래 카메라 바로 창가·현관·책상 시점과 탑뷰로 바로 이동해요.'],
    ['2D 평면', '도면 위에서 가구를 끌어 배치해요. 도면 편집으로 벽·문·창·방을 고치고 분양 도면 이미지를 깔아 축척을 맞출 수 있어요.'],
    ['1인칭 체험', '기준 인물 눈높이로 걸어 다녀요. 앉은·누운 눈높이로 바꿔 답답함을 확인해요.'],
    ['가구 후보', '실제 판매 제품 치수로 만든 3D 가구. 직접 등록에서 판매 페이지 치수·형태·색을 넣거나 제조사 3D 파일(GLB/OBJ/FBX/STL)을 올려요.'],
    ['후보 교체', '가구를 선택하면 같은 자리에 다른 판매 후보를 바로 바꿔 넣어요 (뒤쪽 면 위치 유지).'],
    ['사람·동선', '키를 넣으면 100점 사용성 점수와 항목별 진단(책상·식탁·조리대 높이, 통로, 침대 옆, TV, 펜던트, 거울, 반입, 조립 후 세우기)이 나와요.'],
    ['버전저장', '배치를 여러 버전으로 저장하고 두 버전을 나란히 비교해요. 전체 백업·배치 코드·PNG 캡처도 여기서.'],
    ['무드보드', '사진을 끌어 놓거나 붙여넣으면 5가지 컬러를 뽑아 벽지·가구에 바로 적용해요.'],
  ];
  return (
    <Modal title="2ndhome Studio 사용법" onClose={onClose}>
      <div className="findings-list">
        {items.map(([t, d]) => (
          <div key={t} className="finding-card">
            <div className="finding-title">{t}</div>
            <div className="finding-detail">{d}</div>
          </div>
        ))}
      </div>
      <p className="mini-note" style={{ lineHeight: 1.8 }}>
        단축키: R / Shift+R 90° 회전 · Q / E 15° · 화살표 1cm (Shift 10cm) · PgUp/PgDn 높이 · Ctrl+D 복제 · Delete 삭제 · H 숨기기 · L 고정 · Ctrl+Z 되돌리기 · 1 3D · 2 평면 · 3 1인칭 · M 줄자 · Esc 취소
      </p>
    </Modal>
  );
}

// ------------------------------------------------------------------ keyboard
function useKeys() {
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
        else s.select([]);
        useScene.getState().set({ ghost: null, guides: [], measureStart: null });
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
        if (g) useScene.getState().set({ ghost: { ...g, rot: normDeg(g.rot + (e.shiftKey ? -90 : 90)) } });
        return;
      }
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
