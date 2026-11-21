import { Crosshair, ExternalLink, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES } from '../catalog/categories';
import { PRODUCTS, productSearchUrl } from '../catalog/products';
import { fmtWon } from '../lib/geometry';
import { getThumb } from '../lib/thumbs';
import { resolveMats } from '../models';
import { useStore } from '../store/store';
import type { CategoryId, Product } from '../types';
import { placeNow } from './actions';

export function Thumb({ p, size = 64 }: { p: Product; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting)) {
        io.disconnect();
        getThumb(p, (u) => alive && setUrl(u));
      }
    });
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [p]);
  return (
    <div className="catalog-thumb" ref={ref} style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : <span>{CATEGORIES.find((c) => c.id === p.category)?.icon}</span>}
    </div>
  );
}

export function ProductTags({ p }: { p: Product }) {
  return (
    <>
      {p.custom && <span className="badge-custom">{p.asset ? '3D 파일' : '직접 등록'}</span>}
      {p.mount && p.mount !== 'floor' && <span className={'badge-mount mount-' + p.mount}>{{ wall: '벽걸이', ceiling: '천장', surface: '위 거치', floor: '바닥' }[p.mount]}</span>}
      {p.approx && (
        <span className="badge-approx" title="치수가 근사값이에요. 구매 전 판매처 상세 치수를 확인하세요.">
          근사값
        </span>
      )}
      {p.flatpack && <span className="badge-flat">조립식</span>}
    </>
  );
}

const mainColor = (p: Product) => Object.values(resolveMats(p))[0]?.color ?? '#ccc';

type Filter = CategoryId | 'all' | 'star' | 'mine' | 'builtin' | `tag:${string}`;

/** Shortlist tags carried by a home's own products (e.g. "○○ 후보") become catalog chips. */
const isListTag = (t: string) => t.endsWith('후보');

export function CatalogPanel({ onCustom }: { onCustom: (base?: Product) => void }) {
  const project = useStore((s) => s.project)!;
  const placing = useStore((s) => s.placing);
  const startPlacing = useStore((s) => s.startPlacing);
  const mutate = useStore((s) => s.mutate);
  const notify = useStore((s) => s.notify);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Filter>('all');
  const [brand, setBrand] = useState('');
  const all = useMemo(() => [...project.customProducts, ...PRODUCTS], [project.customProducts]);
  const brands = useMemo(() => Array.from(new Set(all.map((p) => p.brand))).sort((a, b) => a.localeCompare(b, 'ko')), [all]);
  const shortlist = project.shortlist;
  const listTags = useMemo(() => Array.from(new Set(project.customProducts.flatMap((p) => (p.tags ?? []).filter(isListTag)))), [project.customProducts]);
  const hasBuiltin = useMemo(() => all.some((p) => p.builtin), [all]);
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return all.filter((p) => {
      if ((cat === 'builtin') !== !!p.builtin) return false; // built-ins only under their own chip, as before
      if (cat === 'star' && !shortlist.includes(p.id)) return false;
      if (cat === 'mine' && !p.custom) return false;
      if (cat.startsWith('tag:') && !p.tags?.includes(cat.slice(4))) return false;
      if (!['all', 'star', 'mine', 'builtin'].includes(cat) && !cat.startsWith('tag:') && p.category !== cat) return false;
      if (brand && p.brand !== brand) return false;
      if (qq && !`${p.name} ${p.brand} ${p.sub ?? ''} ${p.notes ?? ''}`.toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [all, q, cat, brand, shortlist]);

  const toggleStar = (id: string) =>
    mutate((p) => {
      p.shortlist = p.shortlist.includes(id) ? p.shortlist.filter((x) => x !== id) : [...p.shortlist, id];
    }, false);

  const chips: [Filter, string][] = [
    ['all', '전체'],
    ['star', `★ 후보 ${shortlist.length || ''}`],
    ...listTags.map((t) => [`tag:${t}`, t] as [Filter, string]),
    ['mine', '직접 등록'],
    ...CATEGORIES.map((c) => [c.id, c.label] as [Filter, string]),
    ...(hasBuiltin ? ([['builtin', '붙박이']] as [Filter, string][]) : []),
  ];

  return (
    <div className="panel-scroll">
      <div className="panel-top-actions">
        <div className="search-row">
          <div className="search-box">
            <Search size={14} className="muted-icon" />
            <input placeholder="가구·브랜드 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <button className="btn-primary" onClick={() => onCustom()}>
          <Plus size={14} /> 실제 구매 후보 직접 등록 (치수·3D 파일)
        </button>
      </div>
      <div className="cat-chips cat-scroll">
        {chips.map(([id, label]) => (
          <button key={id} className={'chip sm' + (cat === id ? (id === 'star' ? ' chip-star active' : ' active') : '')} onClick={() => setCat(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: -4 }}>
        <select className="brand-select" value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">모든 브랜드 ({list.length}개)</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      {cat === 'star' && !list.length && <div className="empty-hint">☆를 눌러 마음에 드는 가구를 후보로 모아 보세요.</div>}
      <div className="catalog-list">
        {list.map((p) => {
          const starred = shortlist.includes(p.id);
          return (
            <div key={p.id} className={'catalog-card' + (placing?.productId === p.id ? ' placing' : '')}>
              <div className="catalog-card-head">
                <div className="catalog-brand-row">
                  <span className="color-dot" style={{ background: mainColor(p) }} />
                  <span className="catalog-brand">{p.brand}</span>
                  <ProductTags p={p} />
                </div>
                <button className={'icon-star' + (starred ? ' on' : '')} title="후보에 담기" onClick={() => toggleStar(p.id)}>
                  <Star size={15} fill={starred ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="catalog-card-body">
                <Thumb p={p} />
                <div className="catalog-main">
                  <div className="catalog-title" style={{ marginTop: 0 }}>
                    {p.name}
                  </div>
                  <div className="catalog-specs">
                    <span className="mono">
                      {p.dims.w}×{p.dims.d}×H{p.dims.h}
                    </span>
                    {p.price ? <span className="price-tag mono">{fmtWon(p.price)}</span> : null}
                  </div>
                  {p.notes && <p className="catalog-desc">{p.notes}</p>}
                </div>
              </div>
              {p.variants && p.variants.length > 1 && (
                <div className="mini-swatches" style={{ marginTop: 6 }}>
                  {p.variants.map((v) => (
                    <span key={v.name} className="mini-swatch" title={v.name} style={{ background: Object.values(v.mats)[0]?.color }} />
                  ))}
                </div>
              )}
              <div className="catalog-card-foot" style={{ marginTop: 8 }}>
                <button className="btn-place" onClick={() => placeNow(p.id)}>
                  <Plus size={13} /> 배치하기
                </button>
                <button className="btn-link-icon" title="3D 화면에서 놓을 곳을 직접 찍기" onClick={() => startPlacing(p.id)}>
                  <Crosshair size={14} />
                </button>
                <a className="btn-link-icon" href={productSearchUrl(p)} target="_blank" rel="noreferrer" title="판매처 보기">
                  <ExternalLink size={14} />
                </a>
                <button className="btn-link-icon" title={p.custom ? '수정' : '이 제품 바탕으로 치수·색 수정해 내 후보 만들기'} onClick={() => onCustom(p)}>
                  <Pencil size={13} />
                </button>
                {p.custom && (
                  <button
                    className="btn-link-icon danger"
                    title="직접 등록한 후보 삭제"
                    onClick={() => {
                      mutate((d) => {
                        d.customProducts = d.customProducts.filter((x) => x.id !== p.id);
                      });
                      notify('직접 등록한 후보가 삭제되었어요');
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mini-note" style={{ marginTop: 12 }}>
        배치하기 = 알맞은 자리에 바로 놓기(위 거치는 책상 위, 벽걸이는 벽, 커튼은 창가) · <Crosshair size={11} /> = 3D 화면에서 놓을 곳 찍기. <b>근사값</b> 표시 제품은 구매 전 판매처 치수를 확인하세요.
      </p>
    </div>
  );
}
