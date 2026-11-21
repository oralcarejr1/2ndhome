import { Frame, Heart, ImagePlus, Link2, Palette, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { uid } from '../lib/geometry';
import { extractPalette } from '../lib/palette';
import { resolveMats } from '../models';
import { useImageUrl } from '../scene/ItemMesh';
import { compressImage, storeImage } from '../store/persistence';
import { activeVersion, getProduct, useStore } from '../store/store';
import type { RefItem } from '../types';

export const ZONES = ['전체 무드', '거실·소파', '침실', '다이닝', '데스크', '조명·식물', '컬러·소재'];
const zoneOf = (r: RefItem) => r.tags.find((t) => ZONES.includes(t)) ?? '전체 무드';

export function Moodboard({ compact = false }: { compact?: boolean }) {
  const project = useStore((s) => s.project)!;
  const mutate = useStore((s) => s.mutate);
  const notify = useStore((s) => s.notify);
  const sync = useStore((s) => s.sync);
  const selection = useStore((s) => s.selection);
  const [zone, setZone] = useState('all');
  const [newZone, setNewZone] = useState('전체 무드');
  const [showUrl, setShowUrl] = useState(false);
  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [target, setTarget] = useState<'wall' | 'item'>('wall');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(0);
  const [light, setLight] = useState<RefItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refs = project.moodboard;
  const v = activeVersion(project)!;
  const selItem = v.items.find((i) => i.id === selection[0]);
  const shown = refs.filter((r) => zone === 'all' || (zone === 'fav' ? r.favorite : zoneOf(r) === zone)).sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || b.createdAt - a.createdAt);

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!arr.length) return;
    setBusy((b) => b + arr.length);
    for (const f of arr) {
      try {
        const small = await compressImage(f);
        const { id } = await storeImage(small);
        let palette: string[] = [];
        try {
          const u = URL.createObjectURL(small);
          palette = (await extractPalette(u, 5)).slice(0, 5);
          URL.revokeObjectURL(u);
        } catch {
          palette = [];
        }
        mutate((p) => {
          p.moodboard.unshift({ id: uid('ref'), kind: 'image', blobId: id, title: f.name.replace(/\.[^.]+$/, '') || '붙여넣은 이미지', note: '', tags: [newZone], palette, createdAt: Date.now() });
        });
        notify('레퍼런스를 추가하고 컬러 5개를 뽑았어요');
      } catch {
        notify('이미지를 저장하지 못했어요');
      }
      setBusy((b) => b - 1);
    }
  };

  useEffect(() => {
    if (compact) return;
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea')) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const addUrl = async () => {
    const u = url.trim();
    if (!u) return;
    const isImg = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u) || u.startsWith('data:image');
    let palette: string[] = [];
    if (isImg) {
      try {
        palette = (await extractPalette(u, 5)).slice(0, 5);
      } catch {
        palette = [];
      }
    }
    mutate((p) => {
      p.moodboard.unshift({ id: uid('ref'), kind: isImg ? 'image' : 'link', url: u, title: urlTitle || (isImg ? '레퍼런스' : u.replace(/^https?:\/\//, '').slice(0, 50)), note: '', tags: [newZone], palette, createdAt: Date.now() });
    });
    setUrl('');
    setUrlTitle('');
    setShowUrl(false);
  };

  const update = (id: string, fn: (r: RefItem) => void) =>
    mutate((p) => {
      const r = p.moodboard.find((x) => x.id === id);
      if (r) fn(r);
    }, false);

  const applyColor = (hex: string) => {
    const s = useStore.getState();
    if (target === 'item' && selItem) {
      const prod = getProduct(selItem.productId, project);
      if (!prod) return;
      const mats = resolveMats(prod, selItem);
      const slot = Object.keys(mats)[0];
      if (!slot) return notify('이 가구는 색을 바꿀 수 없어요');
      s.updateItems([selItem.id], (x) => (x.mats = { ...(x.mats ?? {}), [slot]: { ...mats[slot], color: hex } }));
      notify(`'${selItem.label || prod.name}' 컬러를 ${hex}로 변경했어요`);
    } else {
      s.mutateVersion((vv) => (vv.finishes.wallColor = hex));
      notify(`벽지 컬러를 ${hex}로 변경했어요`);
    }
  };

  const hangAsFrame = (r: RefItem) => {
    const s = useStore.getState();
    s.startPlacing('gen-frame-60');
    s.setView('3d');
    notify('벽을 클릭해 액자를 거세요 — 이 이미지가 들어가요');
    const unsub = useStore.subscribe((st, prev) => {
      if (st.selection.length === 1 && st.selection[0] !== prev.selection[0]) {
        const it = activeVersion(st.project)?.items.find((x) => x.id === st.selection[0]);
        if (it?.productId === 'gen-frame-60') st.updateItems([it.id], (x) => (x.imageRef = r.id), false);
        unsub();
      }
    });
  };

  const zones = useMemo(() => ['all', 'fav', ...ZONES], []);

  return (
    <div
      className={'mood-studio' + (compact ? ' compact' : '') + (over ? ' drag-over' : '')}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
        else {
          const t = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
          if (t) {
            setUrl(t);
            setShowUrl(true);
          }
        }
      }}
    >
      <div className="mood-header">
        <div>
          <h3>
            <Palette size={compact ? 15 : 18} /> Aesthetic Reference
          </h3>
          {!compact && (
            <p className="mood-sub">
              좋아하는 인테리어 사진을 모으고, 사진에서 뽑은 5가지 컬러를 벽지나 선택한 가구에 바로 적용해 보세요.{' '}
              {sync === 'server' ? '이미지는 서버에 저장돼 다른 기기에서도 보여요.' : sync === 'artifact' ? '이미지는 계정에 저장돼요.' : '이미지는 이 브라우저에 저장돼요.'}
            </p>
          )}
        </div>
        <div className="mood-actions">
          <button className="btn-primary" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={14} /> {compact ? '' : '이미지 추가'}
          </button>
          <button className="btn-secondary" onClick={() => setShowUrl((x) => !x)}>
            <Link2 size={14} /> {compact ? '' : 'URL'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        </div>
      </div>

      {showUrl && (
        <div className="mood-url-form">
          <input placeholder="이미지 주소 또는 참고 링크 (핀터레스트·오늘의집·판매 페이지)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addUrl()} />
          <input placeholder="제목 (선택)" value={urlTitle} onChange={(e) => setUrlTitle(e.target.value)} />
          <div className="mood-url-foot">
            <button className="btn-secondary" onClick={() => setShowUrl(false)}>
              취소
            </button>
            <button className="btn-primary" onClick={addUrl}>
              추가
            </button>
          </div>
        </div>
      )}

      {!compact && (
        <div className="paste-banner">
          <ImagePlus size={14} />
          <span>
            이미지를 <b>끌어 놓거나</b> 복사한 이미지를 <b>⌘V / Ctrl+V</b>로 붙여넣기 {busy > 0 ? `· 저장 중 ${busy}…` : ''}
          </span>
          <select className="paste-zone-sel" value={newZone} onChange={(e) => setNewZone(e.target.value)}>
            {ZONES.map((z) => (
              <option key={z} value={z}>
                → {z}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="cat-chips">
        {zones.map((z) => (
          <button key={z} className={'chip sm' + (zone === z ? ' active' : '')} onClick={() => setZone(z)}>
            {z === 'all' ? `전체 ${refs.length}` : z === 'fav' ? '♥ 즐겨찾기' : z}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: -2, marginBottom: 10 }}>
        <span className="mini-cap" style={{ margin: 0 }}>
          컬러 칩 클릭 시 적용:
        </span>
        <button className={'btn-xs' + (target === 'wall' ? ' on' : '')} onClick={() => setTarget('wall')}>
          벽지
        </button>
        <button className={'btn-xs' + (target === 'item' ? ' on' : '')} onClick={() => setTarget('item')} disabled={!selItem}>
          선택한 가구{selItem ? '' : ' (가구 선택 필요)'}
        </button>
      </div>

      {!shown.length && <div className="empty-hint">아직 레퍼런스가 없어요. 사진을 끌어 놓거나 붙여넣어 보세요.</div>}
      <div className={'mood-grid' + (compact ? ' cols-1' : '')}>
        {shown.map((r) => (
          <MoodCard key={r.id} r={r} update={update} onOpen={() => setLight(r)} onApply={applyColor} onFrame={() => hangAsFrame(r)} onDelete={() => mutate((p) => (p.moodboard = p.moodboard.filter((x) => x.id !== r.id)))} />
        ))}
      </div>

      {light && <Lightbox r={light} onClose={() => setLight(null)} />}
    </div>
  );
}

function MoodCard({ r, update, onOpen, onApply, onFrame, onDelete }: { r: RefItem; update: (id: string, fn: (r: RefItem) => void) => void; onOpen: () => void; onApply: (hex: string) => void; onFrame: () => void; onDelete: () => void }) {
  const src = useImageUrl(r);
  const [broken, setBroken] = useState(false);
  const notify = useStore((s) => s.notify);
  return (
    <div className="mood-card">
      {r.kind === 'image' && (
        <div className="mood-img-wrap" onClick={onOpen}>
          {src && !broken ? <img src={src} alt={r.title} loading="lazy" onError={() => setBroken(true)} /> : <div className="compare-thumb-empty">{broken ? '이 주소의 이미지는 여기서 열리지 않아요 — 파일로 올려 주세요' : ''}</div>}
          <span className="mood-zone-badge">{zoneOf(r)}</span>
          <button
            className={'mood-fav-btn' + (r.favorite ? ' on' : '')}
            onClick={(e) => {
              e.stopPropagation();
              update(r.id, (x) => (x.favorite = !x.favorite));
            }}
          >
            <Heart size={15} fill={r.favorite ? 'currentColor' : 'none'} />
          </button>
        </div>
      )}
      <div className="mood-card-body">
        <div className="mood-card-head">
          <input className="mood-title-edit" value={r.title} placeholder="제목" onChange={(e) => update(r.id, (x) => (x.title = e.target.value))} />
          <div className="mood-card-icons">
            <select className="paste-zone-sel" style={{ marginLeft: 0, padding: '2px 4px' }} value={zoneOf(r)} onChange={(e) => update(r.id, (x) => (x.tags = [e.target.value, ...x.tags.filter((t) => !ZONES.includes(t))]))}>
              {ZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
            {r.kind === 'image' && (
              <button className="icon-xs" title="벽에 액자로 걸기" onClick={onFrame}>
                <Frame size={13} />
              </button>
            )}
            <button className="icon-xs danger" title="삭제" onClick={onDelete}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
        {r.kind === 'link' && r.url && (
          <a href={r.url} target="_blank" rel="noreferrer" className="mini-note" style={{ wordBreak: 'break-all', margin: 0 }}>
            {r.url}
          </a>
        )}
        <textarea className="mood-note-edit" rows={2} placeholder="메모 (왜 좋은지, 우리 집에 적용할 부분)" value={r.note} onChange={(e) => update(r.id, (x) => (x.note = e.target.value))} />
        {r.kind === 'image' && (
          <div className="mood-palette-block">
            <div className="mood-palette-label">
              <Palette size={11} /> 추출 컬러 팔레트
              {!r.palette?.length && src && (
                <button
                  className="btn-xs"
                  style={{ marginLeft: 'auto' }}
                  onClick={async () => {
                    try {
                      const pal = (await extractPalette(src, 5)).slice(0, 5);
                      update(r.id, (x) => (x.palette = pal));
                    } catch {
                      notify('외부 이미지는 색을 뽑을 수 없어요 (파일로 추가하면 가능)');
                    }
                  }}
                >
                  컬러 뽑기
                </button>
              )}
            </div>
            {r.palette && r.palette.length > 0 && (
              <div className="mood-palette-bar">
                {r.palette.slice(0, 5).map((c) => (
                  <div key={c} className="palette-chip-wrap">
                    <button className="palette-chip" style={{ background: c }} title={`${c} 적용`} onClick={() => onApply(c)} />
                    <span className="palette-hex mono">{c.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Lightbox({ r, onClose }: { r: RefItem; onClose: () => void }) {
  const src = useImageUrl(r);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card modal-lg">
        <div className="modal-header">
          <div>
            <h3>{r.title}</h3>
            <p className="modal-sub">{zoneOf(r)}</p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="lightbox-body">
          {src && <img src={src} alt={r.title} />}
          {r.note && <p className="lightbox-note">{r.note}</p>}
        </div>
      </div>
    </div>
  );
}
