import { Box, ExternalLink, Link2, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES } from '../catalog/categories';
import { PRODUCTS, productSearchUrl } from '../catalog/products';
import { fmtWon } from '../lib/geometry';
import { extractProductUrl } from '../lib/productImport';
import { getThumb } from '../lib/thumbs';
import { useStore } from '../store/store';
import type { CategoryId, Product } from '../types';
import { placeNow } from './actions';

export function Thumb({ p, size }: { p: Product; size?: number }) {
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
    <div className="catalog-thumb" ref={ref} style={size ? { width: size, height: size } : undefined}>
      {url ? <img src={url} alt="" /> : <Box size={22} strokeWidth={1.5} aria-hidden="true" />}
    </div>
  );
}

export function ProductTags({ p }: { p: Product }) {
  const label = p.custom
    ? p.asset
      ? '3D'
      : '직접'
    : p.mount && p.mount !== 'floor'
      ? { wall: '벽', ceiling: '천장', surface: '위', floor: '' }[p.mount]
      : p.approx
        ? '근사'
        : '';
  if (!label) return null;
  const cls = p.custom ? 'badge-custom' : p.approx ? 'badge-approx' : 'badge-mount';
  const title = p.approx ? '치수가 근사값이에요. 구매 전 판매처 상세 치수를 확인하세요.' : undefined;
  return (
    <span className={cls} title={title}>
      {label}
    </span>
  );
}

type Filter = CategoryId | 'all' | 'star' | 'builtin' | `tag:${string}`;

/** Who put a product in the catalog: preset (the app's catalog and the home's pre-loaded items) or the user. */
type Origin = 'all' | 'preset' | 'mine';
const ORIGINS: { id: Origin; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'preset', label: '기본 가구' },
  { id: 'mine', label: '내가 추가' },
];

/** Shortlist tags carried by a home's own products (e.g. "○○ 후보") become catalog chips. */
const isListTag = (t: string) => t.endsWith('후보');

export function CatalogPanel({ onCustom }: { onCustom: (base?: Product, importUrl?: string) => void }) {
  const project = useStore((s) => s.project)!;
  const placing = useStore((s) => s.placing);
  const mutate = useStore((s) => s.mutate);
  const notify = useStore((s) => s.notify);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Filter>('all');
  const [origin, setOrigin] = useState<Origin>('all');
  const [brand, setBrand] = useState('');
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [pageUrl, setPageUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const all = useMemo(() => [...project.customProducts, ...PRODUCTS], [project.customProducts]);
  const brands = useMemo(() => Array.from(new Set(all.map((p) => p.brand))).sort((a, b) => a.localeCompare(b, 'ko')), [all]);
  const shortlist = project.shortlist;
  const listTags = useMemo(() => Array.from(new Set(project.customProducts.flatMap((p) => (p.tags ?? []).filter(isListTag)))), [project.customProducts]);
  const hasBuiltin = useMemo(() => all.some((p) => p.builtin), [all]);
  const originCount = useMemo(() => {
    const mine = all.filter((p) => p.custom).length;
    return { all: all.length, preset: all.length - mine, mine };
  }, [all]);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return all.filter((p) => {
      if ((cat === 'builtin') !== !!p.builtin) return false;
      if (cat === 'star' && !shortlist.includes(p.id)) return false;
      if (origin === 'mine' && !p.custom) return false;
      if (origin === 'preset' && p.custom) return false;
      if (cat.startsWith('tag:') && !p.tags?.includes(cat.slice(4))) return false;
      if (!['all', 'star', 'builtin'].includes(cat) && !cat.startsWith('tag:') && p.category !== cat) return false;
      if (brand && p.brand !== brand) return false;
      if (qq && !`${p.name} ${p.brand} ${p.sub ?? ''} ${p.notes ?? ''}`.toLowerCase().includes(qq)) return false;
      return true;
    });
  }, [all, q, cat, origin, brand, shortlist]);

  const toggleStar = (id: string) =>
    mutate((p) => {
      p.shortlist = p.shortlist.includes(id) ? p.shortlist.filter((x) => x !== id) : [...p.shortlist, id];
    }, false);

  const selectCatValue = cat === 'star' ? 'all' : cat;

  return (
    <div className="panel-scroll catalog-scroll">
      <div className="catalog-head">
        <div className="search-row">
          <div className="search-box">
            <Search size={13} className="muted-icon" />
            <input placeholder="가구·브랜드 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && (
              <button className="icon-xs" onClick={() => setQ('')} aria-label="검색어 지우기">
                <X size={12} />
              </button>
            )}
          </div>
          <button
            className={'btn-icon-sq' + (showUrlForm ? ' on' : '')}
            onClick={() => setShowUrlForm((x) => !x)}
            title="판매 페이지 링크로 후보 불러오기"
            aria-label="판매 링크 불러오기"
            aria-pressed={showUrlForm}
          >
            <Link2 size={14} />
          </button>
          <button className="btn-icon-sq" onClick={() => onCustom()} title="구매 후보 직접 등록" aria-label="후보 직접 등록">
            <Plus size={14} />
          </button>
        </div>

        {showUrlForm && (
          <form
            className="product-link-form"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const url = extractProductUrl(pageUrl);
                setUrlError('');
                setShowUrlForm(false);
                setPageUrl('');
                onCustom(undefined, url);
              } catch {
                setUrlError('판매 페이지 주소(http 또는 https)를 입력하세요');
              }
            }}
          >
            <label htmlFor="catalog-product-url">판매 페이지 주소로 불러오기</label>
            <div className="product-link-row">
              <input
                id="catalog-product-url"
                className="inp"
                type="text"
                inputMode="url"
                required
                placeholder="오늘의집·이케아·네이버 등 판매 링크 붙여넣기"
                value={pageUrl}
                onChange={(e) => {
                  setPageUrl(e.target.value);
                  setUrlError('');
                }}
              />
              <button className="btn-primary" type="submit" style={{ height: 30, padding: '0 10px' }}>
                불러오기
              </button>
            </div>
            {urlError && (
              <p className="note" role="alert" style={{ color: 'var(--bad)' }}>
                {urlError}
              </p>
            )}
          </form>
        )}

        <div className="seg-grid-3" role="group" aria-label="가구 출처">
          {ORIGINS.map((o) => (
            <button
              key={o.id}
              className={'seg-btn' + (origin === o.id ? ' on' : '')}
              aria-pressed={origin === o.id}
              onClick={() => setOrigin(o.id)}
              title={o.id === 'preset' ? '앱에 미리 들어 있던 가구' : o.id === 'mine' ? '직접 등록하거나 링크로 불러온 가구' : undefined}
            >
              {o.label} <span className="mono">{originCount[o.id]}</span>
            </button>
          ))}
        </div>

        <div className="catalog-filter-row">
          <select
            className="brand-select"
            aria-label="카테고리 선택"
            value={selectCatValue}
            onChange={(e) => setCat(e.target.value as Filter)}
          >
            <option value="all">전체 카테고리</option>
            {listTags.map((t) => (
              <option key={t} value={`tag:${t}`}>
                {t}
              </option>
            ))}
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            {hasBuiltin && <option value="builtin">붙박이</option>}
          </select>
          <button
            className={'cat-star-btn' + (cat === 'star' ? ' on' : '')}
            aria-pressed={cat === 'star'}
            onClick={() => setCat(cat === 'star' ? 'all' : 'star')}
            title="즐겨찾기 후보만 보기"
          >
            <Star size={12} fill={cat === 'star' ? 'currentColor' : 'none'} />
            <span className="mono">{shortlist.length}</span>
          </button>
        </div>

        <select className="brand-select" aria-label="브랜드 필터" value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">모든 브랜드 ({list.length})</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>

        {listTags.length > 0 && (
          <div className="cat-chips cat-scroll" style={{ marginBottom: 0 }}>
            {listTags.map((t) => {
              const id: Filter = `tag:${t}`;
              return (
                <button key={id} className={'chip sm' + (cat === id ? ' active' : '')} aria-pressed={cat === id} onClick={() => setCat(cat === id ? 'all' : id)}>
                  {t}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {cat === 'star' && !list.length && <div className="empty-hint">가구의 별 버튼을 눌러 후보를 모아 두세요.</div>}
      {cat !== 'star' && !list.length && (
        <div className="empty-hint">
          {origin === 'mine' && !originCount.mine ? '+ 버튼이나 판매 링크로 가구를 추가하면 여기에 모여요.' : '조건에 맞는 가구가 없어요.'}
        </div>
      )}

      <div className="catalog-grid">
        {list.map((p) => {
          const starred = shortlist.includes(p.id);
          const fullTitle = `${p.name} (${p.dims.w}×${p.dims.d}×H${p.dims.h}cm)${p.notes ? `\n${p.notes}` : ''}`;
          return (
            <div key={p.id} className={'catalog-tile' + (placing?.productId === p.id ? ' placing' : '')} title={fullTitle}>
              <div className="catalog-tile-stage">
                <Thumb p={p} />
                <div className="tile-top-left">
                  <ProductTags p={p} />
                </div>
                <button
                  className={'tile-star' + (starred ? ' on' : '')}
                  title={starred ? '후보에서 빼기' : '후보에 담기'}
                  aria-label={`${p.name} ${starred ? '후보에서 빼기' : '후보에 담기'}`}
                  aria-pressed={starred}
                  onClick={() => toggleStar(p.id)}
                >
                  <Star size={13} fill={starred ? 'currentColor' : 'none'} />
                </button>
                <div className="tile-overlay">
                  <button className="tile-place-btn" onClick={() => placeNow(p.id)} title="배치하기">
                    <Plus size={12} /> 배치
                  </button>
                  <div className="tile-mini-acts">
                    <a className="tile-mini-btn" href={productSearchUrl(p)} target="_blank" rel="noreferrer" title="판매처 보기" aria-label="판매처 보기">
                      <ExternalLink size={11} />
                    </a>
                    <button className="tile-mini-btn" title={p.custom ? '수정' : '치수·색 수정해 내 후보 만들기'} aria-label="수정" onClick={() => onCustom(p)}>
                      <Pencil size={11} />
                    </button>
                    {p.custom && (
                      <button
                        className="tile-mini-btn danger"
                        title="후보 삭제"
                        aria-label="삭제"
                        onClick={() => {
                          mutate((d) => {
                            d.customProducts = d.customProducts.filter((x) => x.id !== p.id);
                          });
                          notify('직접 등록한 후보가 삭제되었어요');
                        }}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="catalog-tile-meta">
                <div className="tile-brand">{p.brand}</div>
                <div className="tile-name">{p.name}</div>
                <div className="tile-specs mono">
                  <span>
                    {p.dims.w}×{p.dims.d}
                  </span>
                  {p.price ? <span className="tile-price">{fmtWon(p.price)}</span> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
