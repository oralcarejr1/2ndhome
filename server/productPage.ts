import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import {
  inferProductAttributes,
  normalizeProductUrl,
  type ImportedProduct,
  type ImportedProductOption,
} from '../src/lib/productImport.js';
import {
  extractWithAi,
  isAiConfigured,
  lookupUrlWithGemini,
  mergeImportedProducts,
  type InlineImage,
} from './productAi.js';
import {
  cleanText as clean,
  cleanTitleAndBrand,
  extractDimensionsFromText,
  extractPriceFromText,
  MARKETPLACE_BRAND,
  parseProductText,
  toCm,
} from './productText.js';

export { extractDimensionsFromText, parseProductText };

export const MAX_BYTES = 5_000_000;
const MAX_IMAGE_BYTES = 2_500_000;
const MAX_REDIRECTS = 8;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CHALLENGE_TITLE =
  /^(?:just a moment\.{0,3}|attention required!?|access denied|403 forbidden|404 not found|robot or human\??|verify you are human|security check|please wait\.{0,3}|에러\s*페이지|접근\s*제한|잠시만\s*기다려\s*주세요)$/i;

const CHALLENGE_BODY =
  /(?:cdn-cgi\/challenge-platform|cf-browser-verification|cf-challenge-running|g-recaptcha|hcaptcha|비정상적인\s*접근이\s*감지|로봇이\s*아닙니다|보안문자를\s*입력|자동\s*입력\s*방지)/i;

export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

interface RemoteFetchResult {
  status: number;
  url: string;
  contentType: string;
  body: Buffer;
  blocked?: boolean;
}

function decodeCharset(bytes: Buffer, contentType: string): string {
  const rawCharset =
    /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1] ??
    /charset\s*=\s*["']?([\w-]+)/i.exec(bytes.subarray(0, 4096).toString('ascii'))?.[1] ??
    'utf-8';
  const normalized = rawCharset.toLowerCase();
  const mapped =
    normalized === 'ks_c_5601-1987' ||
    normalized === 'cp949' ||
    normalized === 'ms949' ||
    normalized === 'x-windows-949' ||
    normalized === 'euc_kr'
      ? 'euc-kr'
      : normalized;
  try {
    return new TextDecoder(mapped).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** Resolve and pin a public IP on every hop; decompress safely; never forward user cookies. */
async function fetchRemoteBuffer(
  input: string,
  opts: {
    accept: string;
    contentTypePattern: RegExp;
    maxBytes: number;
    signal: AbortSignal;
    followMetaRefresh?: boolean;
  },
): Promise<RemoteFetchResult> {
  let url = new URL(normalizeProductUrl(input));
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    const addresses = await lookup(url.hostname, { family: 4, all: true });
    opts.signal.throwIfAborted();
    if (!addresses.length || addresses.some((a) => !isPublicIPv4(a.address))) {
      throw new Error('public_url_required');
    }

    const result = await new Promise<{
      status: number;
      location?: string;
      contentType: string;
      cfMitigated?: string;
      body: Buffer;
    }>((resolve, reject) => {
      const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      const done = (val: {
        status: number;
        location?: string;
        contentType: string;
        cfMitigated?: string;
        body: Buffer;
      }) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };

      const req = request(
        url,
        {
          signal: opts.signal,
          family: 4,
          lookup: (_hostname, options, callback) =>
            options.all
              ? callback(null, [{ address: addresses[0].address, family: 4 }])
              : callback(null, addresses[0].address, 4),
          headers: {
            'user-agent': BROWSER_UA,
            accept: opts.accept,
            'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'accept-encoding': 'gzip, deflate, br',
            'cache-control': 'no-cache',
            'upgrade-insecure-requests': '1',
          },
        },
        (res) => {
          const status = res.statusCode ?? 500;
          const contentType = String(res.headers['content-type'] ?? '');
          const cfMitigated = typeof res.headers['cf-mitigated'] === 'string' ? res.headers['cf-mitigated'] : undefined;

          if (status >= 300 && status < 400) {
            res.resume();
            return done({ status, location: res.headers.location, contentType, cfMitigated, body: Buffer.alloc(0) });
          }

          if (status === 403 || status === 406 || status === 429 || (status === 503 && cfMitigated)) {
            res.resume();
            return done({ status, contentType, cfMitigated, body: Buffer.alloc(0) });
          }

          if (status !== 200 || !opts.contentTypePattern.test(contentType)) {
            res.resume();
            return fail(new Error('page_unavailable'));
          }

          const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase().trim();
          let stream: NodeJS.ReadableStream = res;
          if (encoding === 'gzip' || encoding === 'x-gzip') {
            const gunzip = createGunzip();
            res.on('error', fail);
            stream = res.pipe(gunzip);
          } else if (encoding === 'deflate') {
            const inflate = createInflate();
            res.on('error', fail);
            stream = res.pipe(inflate);
          } else if (encoding === 'br') {
            const brotli = createBrotliDecompress();
            res.on('error', fail);
            stream = res.pipe(brotli);
          }

          const chunks: Buffer[] = [];
          let rawSize = 0;
          let decodedSize = 0;
          if (stream !== res) {
            res.on('data', (chunk: Buffer) => {
              rawSize += chunk.length;
              if (rawSize > opts.maxBytes) {
                const err = new Error('page_too_large');
                req.destroy(err);
                fail(err);
              }
            });
          }

          stream.on('data', (chunk: Buffer) => {
            decodedSize += chunk.length;
            if (decodedSize > opts.maxBytes) {
              const err = new Error('page_too_large');
              req.destroy(err);
              fail(err);
            } else {
              chunks.push(chunk);
            }
          });
          stream.on('error', (err) => fail(err instanceof Error ? err : new Error('page_encoding')));
          stream.on('end', () => done({ status, contentType, cfMitigated, body: Buffer.concat(chunks) }));
        },
      );
      req.on('error', fail);
      req.end();
    });

    if (result.status >= 300 && result.status < 400) {
      if (!result.location) throw new Error('page_unavailable');
      url = new URL(normalizeProductUrl(new URL(result.location, url).href));
      continue;
    }

    if (result.status === 403 || result.status === 406 || result.status === 429 || (result.status === 503 && result.cfMitigated)) {
      return { status: result.status, url: url.href, contentType: result.contentType, body: Buffer.alloc(0), blocked: true };
    }

    if (opts.followMetaRefresh && result.body.length > 0 && result.body.length < 32_000) {
      const headSnippet = result.body.subarray(0, 4096).toString('utf-8');
      const refresh = /<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url\s*=\s*([^"'\s;>]+)/i.exec(headSnippet);
      if (refresh?.[1]) {
        try {
          const nextUrl = new URL(normalizeProductUrl(new URL(refresh[1], url).href));
          if (nextUrl.href !== url.href) {
            url = nextUrl;
            continue;
          }
        } catch { /* ignore invalid meta refresh target */ }
      }
    }

    return { status: result.status, url: url.href, contentType: result.contentType, body: result.body };
  }
  throw new Error('too_many_redirects');
}

function ohouseAlternateUrls(href: string): string[] {
  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    if (host === 'ohou.se' || host === 'www.ohou.se') {
      const m = /^\/(?:productions|goods)\/(\d+)/.exec(u.pathname);
      if (m) return [`https://store.ohou.se/goods/${m[1]}`];
    } else if (host === 'store.ohou.se') {
      const m = /^\/goods\/(\d+)/.exec(u.pathname);
      if (m) return [`https://ohou.se/productions/${m[1]}/selling`];
    }
  } catch { /* ignore */ }
  return [];
}

function attrs(tag: string) {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
  }
  return out;
}

function dimension(raw: any): number | undefined {
  const value = typeof raw === 'object' && raw ? raw.value : raw;
  const unit =
    typeof raw === 'object' && raw
      ? raw.unitCode ?? raw.unitText
      : typeof raw === 'string'
        ? raw.replace(/[\d.,\s]/g, '')
        : '';
  return toCm(value, unit, 10000);
}

interface EmbeddedData {
  name?: string;
  brand?: string;
  price?: number;
  currency?: string;
  categoryText: string[];
  descriptions: string[];
  specLines: string[];
  options: ImportedProductOption[];
  imageUrls: string[];
}

function resolveImageUrl(raw: string, baseUrl: string): string | undefined {
  const s = raw.trim();
  if (!s || s.startsWith('data:') || s.startsWith('blob:')) return undefined;
  try {
    const u = new URL(s.startsWith('//') ? `https:${s}` : s, baseUrl);
    if (!['https:', 'http:'].includes(u.protocol)) return undefined;
    if (/\.svg(?:$|\?)/i.test(u.pathname)) return undefined;
    if (/(?:icon|logo|favicon|sprite|badge|avatar|profile|banner_ad|pixel|tracking|spacer|1x1)/i.test(u.href)) return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

function collectEmbeddedJsonBlobs(html: string): unknown[] {
  const blobs: unknown[] = [];

  // 1) __NEXT_DATA__ (Next.js — used by Ohouse store.ohou.se and many modern shops)
  const nextData = /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i.exec(html);
  if (nextData?.[1]) {
    try {
      blobs.push(JSON.parse(nextData[1]));
    } catch { /* ignore */ }
  }

  // 2) Next.js App Router RSC payload chunks: self.__next_f.push([1,"..."])
  let rscJoined = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[\s*1\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]\)/g)) {
    try {
      const decoded = JSON.parse(`"${m[1]}"`) as string;
      if (decoded.length < 400_000 && /(?:sellingPrice|brandName|productNotices|goodsName|production|dimensions|크기|사이즈)/i.test(decoded)) {
        rscJoined += `${decoded}\n`;
      }
    } catch { /* ignore */ }
    if (rscJoined.length > 500_000) break;
  }
  if (rscJoined) {
    for (const line of rscJoined.split('\n')) {
      const idx = line.indexOf('{');
      if (idx < 0) continue;
      try {
        blobs.push(JSON.parse(line.slice(idx)));
      } catch { /* ignore partial lines */ }
    }
  }

  // 3) Common hydration globals: __INITIAL_STATE__, __PRELOADED_STATE__, __NUXT__, __DATA__
  const globalPatterns = [
    /(?:window\.|self\.)__(?:INITIAL_STATE__|PRELOADED_STATE__|NUXT__|DATA__|PRODUCT_DATA__)\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script/gi,
  ];
  for (const re of globalPatterns) {
    for (const m of html.matchAll(re)) {
      try {
        blobs.push(JSON.parse(m[1]));
      } catch { /* ignore */ }
    }
  }

  return blobs;
}

function extractEmbeddedData(html: string, baseUrl: string): EmbeddedData {
  const out: EmbeddedData = {
    categoryText: [],
    descriptions: [],
    specLines: [],
    options: [],
    imageUrls: [],
  };
  const seenImages = new Set<string>();
  const addImage = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const resolved = resolveImageUrl(raw, baseUrl);
    if (resolved && !seenImages.has(resolved) && seenImages.size < 40) {
      seenImages.add(resolved);
      out.imageUrls.push(resolved);
    }
  };

  const blobs = collectEmbeddedJsonBlobs(html);
  let visited = 0;

  const walk = (node: unknown, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 18 || ++visited > 15_000) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;

    // Korean 상품정보제공고시 / notice / spec key-value item
    const noticeKey = obj.title ?? obj.name ?? obj.label ?? obj.key ?? obj.noticeItemName;
    const noticeVal = obj.description ?? obj.value ?? obj.content ?? obj.noticeItemValue;
    if (typeof noticeKey === 'string' && typeof noticeVal === 'string' && noticeKey.length <= 40 && noticeVal.length <= 500) {
      if (/(?:크기|사이즈|치수|규격|색상|소재|재질|제조사|품명|모델명|가로|세로|깊이|높이|width|depth|height|dimension|size|material|color)/i.test(noticeKey)) {
        const k = clean(noticeKey, 40);
        const v = clean(noticeVal, 300);
        if (k && v && !/^상세\s*(?:페이지|설명|이미지)\s*참조$/i.test(v)) {
          out.specLines.push(`${k}: ${v}`);
        }
      }
    }

    // Product-like record (Ohouse goods/production, Naver SmartStore, Shopify, Cafe24, etc.)
    const hasPriceKey =
      obj.sellingPrice !== undefined ||
      obj.discountedPrice !== undefined ||
      obj.salePrice !== undefined ||
      obj.finalPrice !== undefined ||
      obj.originalPrice !== undefined;
    const hasNameKey =
      typeof obj.goodsName === 'string' ||
      typeof obj.productionName === 'string' ||
      typeof obj.productName === 'string' ||
      (hasPriceKey && (typeof obj.name === 'string' || typeof obj.title === 'string'));

    if (hasNameKey) {
      const candidateName = clean(obj.goodsName ?? obj.productionName ?? obj.productName ?? obj.name ?? obj.title, 220);
      if (candidateName && !out.name) out.name = candidateName;

      const brandVal =
        typeof obj.brandName === 'string'
          ? obj.brandName
          : typeof obj.brandTitle === 'string'
            ? obj.brandTitle
            : typeof obj.makerName === 'string'
              ? obj.makerName
              : typeof obj.brand === 'string'
                ? obj.brand
                : obj.brand && typeof obj.brand === 'object'
                  ? (obj.brand as Record<string, unknown>).name ?? (obj.brand as Record<string, unknown>).title
                  : undefined;
      const cleanedBrand = clean(brandVal, 80);
      if (cleanedBrand && !MARKETPLACE_BRAND.test(cleanedBrand) && !out.brand) {
        out.brand = cleanedBrand;
      }

      if (typeof obj.currency === 'string' && !out.currency) out.currency = obj.currency;
      const rawPrice = obj.finalPrice ?? obj.discountedPrice ?? obj.sellingPrice ?? obj.salePrice ?? obj.price ?? obj.originalPrice;
      const n = typeof rawPrice === 'number' ? rawPrice : Number(String(rawPrice ?? '').replace(/,/g, ''));
      if (Number.isFinite(n) && n >= 100 && n <= 500_000_000 && out.price === undefined) {
        out.price = Math.round(n);
      }

      if (typeof obj.categoryName === 'string') out.categoryText.push(obj.categoryName);
      if (Array.isArray(obj.categories)) {
        for (const c of obj.categories) {
          if (typeof c === 'string') out.categoryText.push(c);
          else if (c && typeof c === 'object' && typeof (c as Record<string, unknown>).name === 'string') {
            out.categoryText.push(String((c as Record<string, unknown>).name));
          }
        }
      }
      if (typeof obj.description === 'string' && obj.description.length > 5 && out.descriptions.length < 5) {
        out.descriptions.push(clean(obj.description, 1000) ?? '');
      }
    }

    // Detail/description image URLs
    for (const key of ['detailImages', 'descriptionImages', 'contentImages', 'coverImages', 'images']) {
      const val = obj[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === 'string') addImage(item);
          else if (item && typeof item === 'object') {
            const imgObj = item as Record<string, unknown>;
            addImage(imgObj.url ?? imgObj.imageUrl ?? imgObj.originalUrl ?? imgObj.src);
          }
        }
      }
    }
    if (typeof obj.contentHtml === 'string' || typeof obj.descriptionHtml === 'string' || typeof obj.detailHtml === 'string') {
      const dhtml = String(obj.contentHtml ?? obj.descriptionHtml ?? obj.detailHtml);
      for (const m of dhtml.matchAll(/<img\b[^>]*\b(?:src|data-src|data-original)\s*=\s*["']([^"']+)["']/gi)) {
        addImage(m[1]);
      }
      const plain = clean(dhtml, 2000);
      if (plain) out.descriptions.push(plain);
    }

    for (const value of Object.values(obj)) walk(value, depth + 1);
  };

  for (const blob of blobs) walk(blob, 0);
  return out;
}

function extractHtmlTablesAndText(html: string, baseUrl: string): { specLines: string[]; visibleText: string; imageUrls: string[] } {
  const specLines: string[] = [];
  const imageUrls: string[] = [];
  const seenImages = new Set<string>();

  for (const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const row = m[1];
    const th = /<th\b[^>]*>([\s\S]*?)<\/th\s*>/i.exec(row);
    const td = /<td\b[^>]*>([\s\S]*?)<\/td\s*>/i.exec(row);
    if (th && td) {
      const k = clean(th[1], 60);
      const v = clean(td[1], 300);
      if (k && v && !/^상세\s*(?:페이지|설명|이미지)\s*참조$/i.test(v)) {
        specLines.push(`${k}: ${v}`);
      }
    }
  }

  for (const m of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt\s*>\s*<dd\b[^>]*>([\s\S]*?)<\/dd\s*>/gi)) {
    const k = clean(m[1], 60);
    const v = clean(m[2], 300);
    if (k && v && !/^상세\s*(?:페이지|설명|이미지)\s*참조$/i.test(v)) {
      specLines.push(`${k}: ${v}`);
    }
  }

  const scoredImages: { url: string; score: number }[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rawSrc = a['data-original'] ?? a['data-src'] ?? a['data-lazy-src'] ?? a.src;
    if (!rawSrc) continue;
    const resolved = resolveImageUrl(rawSrc, baseUrl);
    if (!resolved || seenImages.has(resolved)) continue;
    seenImages.add(resolved);
    const hint = `${resolved} ${a.alt ?? ''} ${a.class ?? ''}`;
    let score = 0;
    if (/(?:size|spec|dim|사이즈|치수|규격|도면|스펙)/i.test(hint)) score += 10;
    if (/(?:detail|info|desc|product_detail|상세|ohousecdn|smartstore|pstatic)/i.test(hint)) score += 3;
    if (/(?:thumb|thumbnail|review|recommend|related|banner|event|ad_|popup)/i.test(hint)) score -= 5;
    scoredImages.push({ url: resolved, score });
  }
  scoredImages.sort((a, b) => b.score - a.score);
  for (const item of scoredImages.slice(0, 20)) imageUrls.push(item.url);

  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|noscript|template|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/?(?:p|div|li|tr|br|h[1-6]|dt|dd|section|article|header|footer|table)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');

  const visibleText = stripped
    .split('\n')
    .map((line) => clean(line, 400))
    .filter((line): line is string => Boolean(line))
    .join('\n')
    .slice(0, 40_000);

  return { specLines, visibleText, imageUrls };
}

interface PageSignals {
  product: ImportedProduct;
  textSummary: string;
  imageUrls: string[];
  blocked: boolean;
}

function extractPageSignals(html: string, url: string): PageSignals {
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = a.property ?? a.name ?? a.itemprop;
    if (key && a.content !== undefined) meta[key.toLowerCase()] = a.content;
  }

  const rawPageTitle = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const blocked =
    (rawPageTitle !== undefined && CHALLENGE_TITLE.test(rawPageTitle)) ||
    (html.length < 40_000 && CHALLENGE_BODY.test(html) && !meta['og:title']);

  if (blocked) {
    return { product: { url, blocked: true }, textSummary: '', imageUrls: [], blocked: true };
  }

  // 1) JSON-LD Products & Breadcrumbs
  const products: any[] = [];
  const breadcrumbs: string[] = [];
  let visited = 0;
  const walkLd = (node: any, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 30 || ++visited > 15_000) return;
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.some((t: unknown) => typeof t === 'string' && /(?:^|\/)(?:Product|ProductGroup)$/i.test(t))) {
      products.push(node);
    }
    if (types.some((t: unknown) => typeof t === 'string' && /(?:^|\/)BreadcrumbList$/i.test(t))) {
      const items = Array.isArray(node.itemListElement) ? node.itemListElement : [];
      for (const it of items) {
        const n = clean(it?.name ?? it?.item?.name, 60);
        if (n) breadcrumbs.push(n);
      }
    }
    for (const value of Object.values(node)) walkLd(value, depth + 1);
  };
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attrs(m[1]).type?.toLowerCase() !== 'application/ld+json') continue;
    try {
      walkLd(JSON.parse(m[2]));
    } catch { /* Other metadata may still be useful. */ }
  }

  const p = products[0] ?? {};
  const ldOffersRaw = p.offers ?? (Array.isArray(p.hasVariant) ? p.hasVariant[0]?.offers : undefined);
  const ldOffer = Array.isArray(ldOffersRaw) ? ldOffersRaw[0] : ldOffersRaw;
  const ldCurrency = ldOffer?.priceCurrency ?? ldOffer?.priceSpecification?.priceCurrency;
  const ldRawPrice = ldOffer?.price ?? ldOffer?.lowPrice ?? ldOffer?.priceSpecification?.price;

  const ldSpecLines: string[] = [];
  const ldProps = Array.isArray(p.additionalProperty) ? p.additionalProperty : [];
  for (const prop of ldProps) {
    if (prop && typeof prop === 'object') {
      const k = clean(prop.name, 50);
      const v = clean(
        prop.value !== undefined && prop.unitText ? `${prop.value} ${prop.unitText}` : String(prop.value ?? ''),
        200,
      );
      if (k && v) ldSpecLines.push(`${k}: ${v}`);
    }
  }

  const ldDims = {
    w: dimension(p.width),
    d: dimension(p.depth),
    h: dimension(p.height),
  };

  // 2) Microdata fallback (itemprop)
  const microPrice =
    /<[^>]*itemprop=["']price["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<[^>]*content=["']([^"']+)["'][^>]*itemprop=["']price["']/i.exec(html)?.[1];
  const microCurrency =
    /<[^>]*itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /<[^>]*content=["']([^"']+)["'][^>]*itemprop=["']priceCurrency["']/i.exec(html)?.[1];

  // 3) Embedded app state (__NEXT_DATA__, RSC, __INITIAL_STATE__, etc.)
  const embedded = extractEmbeddedData(html, url);

  // 4) HTML spec tables + visible text + images
  const htmlInfo = extractHtmlTablesAndText(html, url);

  // Combine title & brand cleanly
  const h1Title = clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1], 200);
  const rawName = clean(p.name) ?? embedded.name ?? clean(meta['og:title']) ?? clean(meta['twitter:title']) ?? h1Title ?? rawPageTitle;
  const rawBrand =
    clean(typeof p.brand === 'string' ? p.brand : p.brand?.name) ??
    embedded.brand ??
    clean(meta['product:brand']) ??
    clean(meta['og:brand']);
  const { name, brand } = cleanTitleAndBrand(rawName, rawBrand);

  // Combine price (strictly KRW only — never convert foreign currencies)
  const declaredCurrency =
    ldCurrency ??
    meta['product:price:currency'] ??
    meta['og:price:currency'] ??
    microCurrency ??
    embedded.currency;
  const isForeignCurrency =
    typeof declaredCurrency === 'string' && declaredCurrency.trim() !== '' && declaredCurrency.toUpperCase() !== 'KRW';

  let price: number | undefined;
  if (!isForeignCurrency) {
    const structuredRawPrice =
      ldRawPrice ??
      meta['product:sale_price:amount'] ??
      meta['product:price:amount'] ??
      meta['og:price:amount'] ??
      microPrice;
    const isExplicitKrw = typeof declaredCurrency === 'string' && declaredCurrency.toUpperCase() === 'KRW';
    const isKoreanPage = /\.(?:kr|se)$/i.test(new URL(url).hostname) || /[가-힣]/.test(`${name ?? ''} ${htmlInfo.visibleText.slice(0, 500)}`);

    if (structuredRawPrice !== undefined && (isExplicitKrw || isKoreanPage)) {
      const n = Number(String(structuredRawPrice).replace(/[,\s원₩]/g, ''));
      if (Number.isFinite(n) && n > 0) price = Math.round(n);
    }
    if (price === undefined && embedded.price !== undefined && (isExplicitKrw || isKoreanPage)) {
      price = embedded.price;
    }
    if (price === undefined) {
      const twitterPrice = /가격|price/i.test(meta['twitter:label1'] ?? '') ? meta['twitter:data1'] : undefined;
      if (twitterPrice) price = extractPriceFromText(twitterPrice);
    }
    if (price === undefined) {
      price = extractPriceFromText(
        [meta['og:description'], meta.description, ...embedded.descriptions, htmlInfo.visibleText.slice(0, 6000)]
          .filter(Boolean)
          .join('\n'),
      );
    }
  }

  // Combine dimensions: JSON-LD explicit dimensions first, then spec tables / embedded notices / description / title / body text
  const specCorpus = [
    ...ldSpecLines,
    ...embedded.specLines,
    ...htmlInfo.specLines,
    clean(p.description, 1200),
    clean(meta['og:description'], 500),
    clean(meta.description, 500),
    ...embedded.descriptions,
    name,
    htmlInfo.visibleText.slice(0, 12_000),
  ]
    .filter(Boolean)
    .join('\n');

  const textDimsResult = extractDimensionsFromText(specCorpus, `${p.category ?? ''} ${breadcrumbs.join(' ')} ${name ?? ''}`);

  const mergedDims = {
    w: ldDims.w ?? textDimsResult.dims?.w,
    d: ldDims.d ?? textDimsResult.dims?.d,
    h: ldDims.h ?? textDimsResult.dims?.h,
  };
  const hasAnyDim = Object.values(mergedDims).some((v) => v !== undefined);

  const attrSource = [
    p.category,
    meta['product:category'],
    ...breadcrumbs,
    ...embedded.categoryText,
    name,
    ...embedded.specLines.slice(0, 10),
    ...htmlInfo.specLines.slice(0, 10),
  ]
    .filter(Boolean)
    .join(' ');
  const inferred = inferProductAttributes(attrSource);

  const product: ImportedProduct = {
    url,
    ...(name !== undefined ? { name } : {}),
    ...(brand !== undefined ? { brand } : {}),
    ...(inferred.category !== undefined ? { category: inferred.category } : {}),
    ...(inferred.model !== undefined ? { model: inferred.model } : {}),
    ...(inferred.mount !== undefined ? { mount: inferred.mount } : {}),
    ...(inferred.ergo !== undefined ? { ergo: inferred.ergo } : {}),
    ...(inferred.material !== undefined ? { material: inferred.material } : {}),
    ...(inferred.color !== undefined ? { color: inferred.color } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(hasAnyDim ? { dims: mergedDims } : {}),
    ...(textDimsResult.options?.length ? { options: textDimsResult.options } : {}),
  };

  const imageUrls: string[] = [];
  const seenImg = new Set<string>();
  const pushImg = (u?: string) => {
    if (u && !seenImg.has(u) && imageUrls.length < 12) {
      seenImg.add(u);
      imageUrls.push(u);
    }
  };
  for (const u of htmlInfo.imageUrls) pushImg(u);
  for (const u of embedded.imageUrls) pushImg(u);
  if (meta['og:image']) pushImg(resolveImageUrl(meta['og:image'], url));

  const textSummary = [
    name ? `Title: ${name}` : '',
    brand ? `Brand: ${brand}` : '',
    price !== undefined ? `Price: ${price} KRW` : '',
    breadcrumbs.length ? `Category: ${breadcrumbs.join(' > ')}` : '',
    embedded.categoryText.length ? `Categories: ${embedded.categoryText.join(' > ')}` : '',
    meta['og:description'] ? `Summary: ${clean(meta['og:description'], 500)}` : '',
    ldSpecLines.length ? `Structured Specs:\n${ldSpecLines.join('\n')}` : '',
    embedded.specLines.length ? `Product Notices:\n${embedded.specLines.join('\n')}` : '',
    htmlInfo.specLines.length ? `Spec Table:\n${htmlInfo.specLines.slice(0, 40).join('\n')}` : '',
    htmlInfo.visibleText ? `Page Text:\n${htmlInfo.visibleText.slice(0, 12_000)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { product, textSummary, imageUrls, blocked: false };
}

export function parseProductPage(html: string, url: string): ImportedProduct {
  return extractPageSignals(html, url).product;
}

async function fetchSpecImages(imageUrls: string[], signal: AbortSignal): Promise<InlineImage[]> {
  const out: InlineImage[] = [];
  const candidates = imageUrls.slice(0, 3);
  const results = await Promise.allSettled(
    candidates.map(async (imgUrl) => {
      const imgSignal = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
      const res = await fetchRemoteBuffer(imgUrl, {
        accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8',
        contentTypePattern: /^image\/(?:png|jpeg|jpg|webp|gif)/i,
        maxBytes: MAX_IMAGE_BYTES,
        signal: imgSignal,
      });
      if (res.blocked || !res.body.length) return null;
      const mime = res.contentType.split(';')[0].trim().toLowerCase();
      const mimeType = mime === 'image/jpg' ? 'image/jpeg' : mime;
      return { mimeType, base64: res.body.toString('base64') } satisfies InlineImage;
    }),
  );
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) out.push(r.value);
  }
  return out;
}

export async function readProductPage(
  input: string,
  signal = AbortSignal.timeout(35_000),
): Promise<ImportedProduct> {
  const normalizedUrl = normalizeProductUrl(input);
  const aiReady = isAiConfigured();
  const urlsToTry = [normalizedUrl, ...ohouseAlternateUrls(normalizedUrl)];

  let lastBlockedUrl: string | undefined;
  let lastError: unknown;
  let fetched: { html: string; url: string } | undefined;

  for (const candidateUrl of urlsToTry) {
    try {
      const res = await fetchRemoteBuffer(candidateUrl, {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        contentTypePattern: /text\/html|application\/xhtml\+xml/i,
        maxBytes: MAX_BYTES,
        signal,
        followMetaRefresh: true,
      });
      if (res.blocked) {
        lastBlockedUrl = res.url;
        continue;
      }
      const html = decodeCharset(res.body, res.contentType);
      const signals = extractPageSignals(html, res.url);
      if (signals.blocked) {
        lastBlockedUrl = res.url;
        continue;
      }
      fetched = { html, url: res.url };
      break;
    } catch (err) {
      const msg = (err as Error)?.message;
      if (msg === 'public_url_required' || msg === 'page_too_large' || signal.aborted) {
        throw err;
      }
      lastError = err;
    }
  }

  if (!fetched) {
    if (lastBlockedUrl) {
      if (aiReady) {
        const aiWeb = await lookupUrlWithGemini(lastBlockedUrl, { signal });
        if (aiWeb) {
          return { ...aiWeb, url: lastBlockedUrl, source: 'ai-web', aiConfigured: true };
        }
      }
      return { url: lastBlockedUrl, blocked: true, aiConfigured: aiReady };
    }
    throw lastError instanceof Error ? lastError : new Error('page_unavailable');
  }

  const signals = extractPageSignals(fetched.html, fetched.url);
  const base = signals.product;
  const missingAnyDim =
    base.dims?.w === undefined || base.dims?.d === undefined || base.dims?.h === undefined;
  const needsAi =
    aiReady &&
    (missingAnyDim || !base.name || !base.brand || base.price === undefined || !base.category);

  if (!needsAi) {
    return { ...base, source: 'page', aiConfigured: aiReady };
  }

  const specImages =
    missingAnyDim && signals.imageUrls.length > 0 ? await fetchSpecImages(signals.imageUrls, signal) : [];

  const aiResult = await extractWithAi(
    {
      url: fetched.url,
      text: signals.textSummary,
      partial: base,
      images: specImages,
    },
    { signal },
  );

  const merged = mergeImportedProducts(base, aiResult, specImages.length > 0);
  return {
    ...merged,
    url: fetched.url,
    source: aiResult ? 'page+ai' : 'page',
    aiConfigured: true,
  };
}
