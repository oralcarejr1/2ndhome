import { inferProductAttributes, type ImportedProduct } from '../src/lib/productImport.js';
import { parseOptionLabels, perCodeDims } from '../src/lib/productOptions.js';
import { classifyShape, type Axis, type Dims } from '../src/lib/productShape.js';
import type { ParamValue } from '../src/types.js';
import { finalizeProduct } from './productFinalize.js';
import { cleanText, cleanTitleAndBrand, extractDimensionsFromText } from './productText.js';

/**
 * Ohouse (store.ohou.se) product pages are server-rendered Next.js pages whose
 * `__NEXT_DATA__` holds the whole goods record: exact title, brand, selling price,
 * category path, the legally required notice table (상품정보제공고시 — often with
 * the size), option names and the seller's detail-page HTML (with the size chart
 * image). Reading that record is far more reliable than scraping visible text.
 */

export interface OhouseExtract {
  product: ImportedProduct;
  /** detail-page images ranked by how likely they hold the size chart */
  specImages: string[];
  /** plain-text summary for an AI pass */
  summary: string;
  /** product has dims stated in text (not only in images) */
  textDims: boolean;
  categoryPath: string[];
  extra: string;
  presetParams?: Record<string, ParamValue>;
}

const NOTICE_EMPTY = /^(?:상세\s*(?:페이지|설명|이미지)?\s*(?:참조|참고)|상품\s*상세\s*(?:페이지\s*)?(?:참조|참고)|상품상세참조|해당\s*(?:사항\s*)?없음|-)$/;

function isOhouseHost(url: string): boolean {
  try {
    return /(?:^|\.)ohou\.se$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function findGoods(data: unknown): Record<string, any> | undefined {
  const queries = (data as any)?.props?.pageProps?.dehydratedState?.queries;
  if (!Array.isArray(queries)) return undefined;
  for (const q of queries) {
    const key = q?.queryKey;
    const d = q?.state?.data;
    if (Array.isArray(key) && key[0] === 'goods' && d && typeof d === 'object' && d.production) return d;
  }
  return undefined;
}

function rankSpecImages(urls: string[]): string[] {
  const n = urls.length;
  return urls
    .map((u, i) => {
      let score = 0;
      if (/spec|size|dimension|사이즈|치수|규격|도면|info_?size|sizeinfo/i.test(u)) score += 50;
      if (/(?:delivery|notice|customer|common|event|review|banner|logo|coupon|gift|caution|guide_?a\/s|as_|_as\.|cs_|top_?p|intro|brand|story)/i.test(u)) score -= 30;
      if (/\.gif(?:$|\?)/i.test(u)) score -= 20;
      // size tables usually sit in the last third, before the shipping/notice banners
      const pos = n > 1 ? i / (n - 1) : 0;
      score += pos > 0.45 && pos < 0.97 ? 8 + pos * 6 : pos >= 0.97 ? 0 : pos * 4;
      return { u, score, i };
    })
    .sort((a, b) => b.score - a.score || b.i - a.i)
    .map((x) => x.u);
}

function htmlImages(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*?\b(?:data-src|data-original|src)\s*=\s*["']([^"']+)["']/gi)) {
    let u = m[1].trim();
    if (u.startsWith('//')) u = `https:${u}`;
    if (!/^https?:\/\//i.test(u) || /\.svg(?:$|\?)/i.test(u)) continue;
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

export function parseOhouseGoods(html: string, url: string): OhouseExtract | undefined {
  if (!isOhouseHost(url)) return undefined;
  const raw = /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i.exec(html)?.[1];
  if (!raw) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const goods = findGoods(data);
  if (!goods) return undefined;
  const p = goods.production as Record<string, any>;

  const notices: Record<string, string> = {};
  for (const it of p.informationNoticeItems?.items ?? []) {
    if (typeof it?.displayName === 'string' && typeof it?.content === 'string') notices[it.displayName.trim()] = it.content.trim();
  }
  const noticeValue = (re: RegExp) => {
    for (const [k, v] of Object.entries(notices)) if (re.test(k) && v && !NOTICE_EMPTY.test(v.replace(/\s+/g, ' ').trim())) return v;
    return undefined;
  };

  const rawName = typeof p.name === 'string' ? p.name : undefined;
  const rawBrand = typeof p.brand?.name === 'string' ? p.brand.name : typeof goods.brand?.name === 'string' ? goods.brand.name : undefined;
  const { name, brand } = cleanTitleAndBrand(rawName, rawBrand);

  const price = [p.sellingPrice, p.price?.sellingPrice, p.price?.salePrice, p.originalPrice].find(
    (v) => typeof v === 'number' && v >= 100,
  ) as number | undefined;

  const categoryPath: string[] = Array.isArray(goods.categories)
    ? goods.categories.map((c: any) => cleanText(c?.title, 40)).filter((x: string | undefined): x is string => Boolean(x))
    : [];
  const optionNames: string[] = Array.isArray(goods.seoOptionNames)
    ? goods.seoOptionNames.filter((x: unknown): x is string => typeof x === 'string')
    : [];

  const sizeText = noticeValue(/크기|치수|규격|사이즈/);
  const materialText = noticeValue(/소재|재질/);
  const colorText = noticeValue(/색상/);

  // dims stated in text: notice "크기" first, then the title ("1200x600")
  let dims: Dims | undefined;
  const codeDims = sizeText ? perCodeDims(sizeText) : {};
  if (sizeText) dims = extractDimensionsFromText(sizeText.split('\n').map((l) => `크기: ${l}`).join('\n'), `${name ?? ''} ${categoryPath.join(' ')}`).dims;
  if ((!dims || Object.keys(dims).length < 2) && name) {
    const fromName = extractDimensionsFromText(`크기: ${name}`, name).dims;
    if (fromName && Object.keys(fromName).length >= 2) dims = fromName;
  }

  const descHtml = typeof p.description === 'string' ? p.description : '';
  const descText = cleanText(descHtml, 4000);
  const detailImages = htmlImages(descHtml);
  if (descText) {
    const fromDesc = extractDimensionsFromText(descText, name ?? '').dims;
    if (fromDesc && (!dims || Object.keys(fromDesc).length > Object.keys(dims).length)) dims = { ...fromDesc, ...(dims ?? {}) };
  }

  const shape0 = classifyShape({
    name,
    categoryPath,
    extra: [optionNames.slice(0, 20).join(' '), sizeText ?? '', materialText ?? ''].join(' '),
    dims: dims ?? {},
  });

  const options = parseOptionLabels(optionNames, shape0, codeDims);
  const textDims = Boolean(dims && Object.keys(dims).length >= 2);

  // Product-level dims: stated text first; otherwise the first size option.
  let estimated: Axis[] = [];
  let presetParams = options[0]?.params;
  if (!textDims) {
    const firstWithDims = options.find((o) => o.dims && Object.keys(o.dims).length > 0);
    if (firstWithDims?.dims) {
      dims = { ...firstWithDims.dims, ...(dims ?? {}) };
      estimated = [...(firstWithDims.estimated ?? [])];
      presetParams = firstWithDims.params ?? presetParams;
    }
  }

  const inferred = inferProductAttributes(
    [name, colorText ?? '', optionNames[0] ?? '', materialText ?? ''].join(' '),
  );

  const extra = [optionNames.slice(0, 20).join(' '), sizeText ?? '', materialText ?? ''].join(' ');
  const product = finalizeProduct(
    {
      url,
      ...(name ? { name } : {}),
      ...(brand ? { brand } : {}),
      ...(price !== undefined ? { price } : {}),
      ...(inferred.color ? { color: inferred.color } : {}),
      ...(inferred.material ? { material: inferred.material } : {}),
      ...(dims && Object.keys(dims).length ? { dims } : {}),
      ...(estimated.length ? { dimsEstimated: estimated } : {}),
      ...(options.length > 1 ? { options } : {}),
      ...(typeof p.originalImageUrl === 'string' ? { imageUrl: p.originalImageUrl } : {}),
    },
    { categoryPath, extra, presetParams },
  );
  if (!product.category) Object.assign(product, inferProductAttributes(`${categoryPath.join(' ')} ${name ?? ''}`));

  const summary = [
    name ? `Title: ${name}` : '',
    brand ? `Brand: ${brand}` : '',
    price !== undefined ? `Price: ${price} KRW` : '',
    categoryPath.length ? `Store category: ${categoryPath.join(' > ')}` : '',
    optionNames.length ? `Options: ${optionNames.slice(0, 30).join(' | ')}` : '',
    Object.keys(notices).length
      ? `Product notice:\n${Object.entries(notices)
          .filter(([, v]) => !NOTICE_EMPTY.test(v))
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')}`
      : '',
    descText ? `Detail text: ${descText.slice(0, 3000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { product, specImages: rankSpecImages(detailImages), summary, textDims, categoryPath, extra, presetParams };
}
