import { ExternalLink, Frame, Heart, ImagePlus, Link2, Palette, Trash2, X } from 'lucide-react';
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
  const selection = useStore((s) => s.selection);
  const [zone, setZone] = useState('all');
  const [newZone, setNewZone] = useState('전체 무드');
  const [showUrl, setShowUrl] = useState(false);
  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [target, setTarget] = useState<'wall' | 'item'>('wall');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(0);
  const [lightId, setLightId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refs = project.moodboard;
  const v = activeVersion(project)!;
  const selItem = v.items.find((i) => i.id === selection[0]);
  const selProd = selItem ? getProduct(selItem.productId, project) : undefined;
  useEffect(() => {
    if (!compact) return;
    setTarget(selItem ? 'item' : 'wall');
  }, [compact, selItem?.id]);
  const shown = refs
    .filter((r) => zone === 'all' || (zone === 'fav' ? r.favorite : zoneOf(r) === zone))
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || b.createdAt - a.createdAt);
  const light = lightId ? refs.find((r) => r.id === lightId) ?? null : null;

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
          p.moodboard.unshift({
            id: uid('ref'),
            kind: 'image',
            blobId: id,
            title: f.name.replace(/\.[^.]+$/, '') || '붙여넣은 이미지',
            note: '',
            tags: [newZone],
            palette,
            createdAt: Date.now(),
          });
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
      p.moodboard.unshift({
        id: uid('ref'),
        kind: isImg ? 'image' : 'link',
        url: u,
        title: urlTitle || (isImg ? '레퍼런스' : u.replace(/^https?:\/\//, '').slice(0, 50)),
        note: '',
        tags: [newZone],
        palette,
        createdAt: Date.now(),
      });
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

  const removeRef = (id: string) => {
    if (lightId === id) setLightId(null);
    mutate((p) => (p.moodboard = p.moodboard.filter((x) => x.id !== id)));
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
            <Palette size={compact ? 14 : 16} /> 무드보드 <span className="mood-count mono">{refs.length}</span>
          </h3>
          {!compact && <p className="mood-sub">드래그 · ⌘V 붙여넣기로 이미지 추가 · 하단 컬러 클릭으로 벽지/가구 즉시 적용 {busy > 0 ? `· 저장 중 ${busy}…` : ''}</p>}
        </div>
        <div className="mood-actions">
          {!compact && (
            <select className="paste-zone-sel" value={newZone} onChange={(e) => setNewZone(e.target.value)} aria-label="추가 구역">
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          )}
          <button className="btn-primary" onClick={() => fileRef.current?.click()} title="이미지 추가">
            <ImagePlus size={13} /> {compact ? '' : '이미지 추가'}
          </button>
          <button className="btn-secondary" onClick={() => setShowUrl((x) => !x)} title="URL 추가">
            <Link2 size={13} /> {compact ? '' : 'URL'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        </div>
      </div>

      {showUrl && (
        <div className="mood-url-form">
          <input placeholder="이미지 주소 또는 참고 링크" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addUrl()} autoFocus />
          <input placeholder="제목 (선택)" value={urlTitle} onChange={(e) => setUrlTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addUrl()} />
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

      <div className="mood-toolbar">
        <div className="cat-chips cat-scroll" style={{ marginBottom: 0 }}>
          {zones.map((z) => (
            <button key={z} className={'chip sm' + (zone === z ? ' active' : '')} onClick={() => setZone(z)}>
              {z === 'all' ? '전체' : z === 'fav' ? '즐겨찾기' : z}
            </button>
          ))}
        </div>
        <div className="mood-target-toggle">
          <span className="mini-cap" style={{ margin: 0 }}>컬러 적용:</span>
          <button className={'btn-xs' + (target === 'wall' ? ' on' : '')} onClick={() => setTarget('wall')}>
            벽지
          </button>
          <button className={'btn-xs' + (target === 'item' ? ' on' : '')} onClick={() => setTarget('item')} disabled={!selItem} title={selItem ? selItem.label || selProd?.name : '가구를 선택하세요'}>
            {selItem ? (selItem.label || selProd?.name || '선택 가구').slice(0, 10) : '선택 가구'}
          </button>
        </div>
      </div>

      {!shown.length && <div className="empty-hint">사진을 끌어 놓거나 ⌘V로 붙여넣어 무드보드를 시작하세요.</div>}

      <div className={'mood-grid' + (compact ? ' cols-1' : '')}>
        {shown.map((r) => (
          <MoodCard
            key={r.id}
            r={r}
            update={update}
            onOpen={() => setLightId(r.id)}
            onApply={applyColor}
            onFrame={() => hangAsFrame(r)}
            onDelete={() => removeRef(r.id)}
          />
        ))}
      </div>

      {light && (
        <Lightbox
          r={light}
          update={update}
          onApply={applyColor}
          onFrame={() => {
            setLightId(null);
            hangAsFrame(light);
          }}
          onDelete={() => removeRef(light.id)}
          onClose={() => setLightId(null)}
        />
      )}
    </div>
  );
}

function MoodCard({
  r,
  update,
  onOpen,
  onApply,
  onFrame,
  onDelete,
}: {
  r: RefItem;
  update: (id: string, fn: (r: RefItem) => void) => void;
  onOpen: () => void;
  onApply: (hex: string) => void;
  onFrame: () => void;
  onDelete: () => void;
}) {
  const src = useImageUrl(r);
  const [broken, setBroken] = useState(false);

  if (r.kind === 'link') {
    return (
      <div className="mood-card mood-link-card">
        <div className="mood-caption">
          <div className="mood-cap-main">
            <span className="mood-cap-zone">{zoneOf(r)}</span>
            <div className="mood-cap-title">{r.title || '참고 링크'}</div>
            {r.url && (
              <a href={r.url} target="_blank" rel="noreferrer" className="mood-link-url">
                <ExternalLink size={11} /> {r.url}
              </a>
            )}
            {r.note && <div className="mood-cap-note">{r.note}</div>}
          </div>
          <button className="icon-xs danger" title="삭제" onClick={onDelete}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mood-card">
      <div className="mood-img-wrap" onClick={onOpen}>
        {src && !broken ? (
          <img src={src} alt={r.title} loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <div className="compare-thumb-empty">{broken ? '외부 이미지를 열 수 없어요 — 파일로 올려 주세요' : ''}</div>
        )}
        <span className="mood-zone-badge">{zoneOf(r)}</span>
        <div className="mood-img-actions" onClick={(e) => e.stopPropagation()}>
          <button className={'mood-float-btn' + (r.favorite ? ' fav-on' : '')} title="즐겨찾기" onClick={() => update(r.id, (x) => (x.favorite = !x.favorite))}>
            <Heart size={13} fill={r.favorite ? 'currentColor' : 'none'} />
          </button>
          <button className="mood-float-btn" title="벽에 액자로 걸기" onClick={onFrame}>
            <Frame size={13} />
          </button>
          <button className="mood-float-btn danger" title="삭제" onClick={onDelete}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {r.palette && r.palette.length > 0 && (
        <div className="mood-swatch-strip-bar">
          {r.palette.slice(0, 5).map((c) => (
            <button key={c} className="mood-swatch-seg" style={{ background: c }} title={`${c.toUpperCase()} 적용`} aria-label={`${c} 적용`} onClick={() => onApply(c)} />
          ))}
        </div>
      )}

      <div className="mood-caption" onClick={onOpen}>
        <div className="mood-cap-main">
          <div className="mood-cap-title">{r.title || '제목 없음'}</div>
          {r.note && <div className="mood-cap-note">{r.note}</div>}
        </div>
      </div>
    </div>
  );
}

function Lightbox({
  r,
  update,
  onApply,
  onFrame,
  onDelete,
  onClose,
}: {
  r: RefItem;
  update: (id: string, fn: (r: RefItem) => void) => void;
  onApply: (hex: string) => void;
  onFrame: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const src = useImageUrl(r);
  const notify = useStore((s) => s.notify);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card modal-xl">
        <div className="modal-header">
          <div>
            <h3>{r.title || '레퍼런스 상세'}</h3>
            <p className="modal-sub">{zoneOf(r)}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={15} />
          </button>
        </div>
        <div className="mood-detail-grid">
          <div className="mood-detail-media">{src && <img src={src} alt={r.title} />}</div>
          <div className="mood-detail-side">
            <label className="field">
              <span>제목</span>
              <input className="inp" value={r.title} placeholder="제목" onChange={(e) => update(r.id, (x) => (x.title = e.target.value))} />
            </label>
            <label className="field">
              <span>공간 구역</span>
              <select className="inp" value={zoneOf(r)} onChange={(e) => update(r.id, (x) => (x.tags = [e.target.value, ...x.tags.filter((t) => !ZONES.includes(t))]))}>
                {ZONES.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>메모</span>
              <textarea className="inp" rows={3} placeholder="우리 집에 적용할 포인트 메모" value={r.note} onChange={(e) => update(r.id, (x) => (x.note = e.target.value))} />
            </label>
            <div className="insp-section">
              <div className="insp-label-row">
                <span className="insp-label">추출 컬러 (클릭 시 적용)</span>
                {!r.palette?.length && src && (
                  <button
                    className="btn-xs"
                    onClick={async () => {
                      try {
                        const pal = (await extractPalette(src, 5)).slice(0, 5);
                        update(r.id, (x) => (x.palette = pal));
                      } catch {
                        notify('외부 이미지는 색을 뽑을 수 없어요');
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
            <div className="insp-section" style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={onFrame}>
                <Frame size={13} /> 벽에 액자로 걸기
              </button>
              <button className="btn-danger" onClick={onDelete}>
                <Trash2 size={13} /> 삭제
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
