import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { normalizeProductUrl, type ImportedProduct } from '../src/lib/productImport.js';

const MAX_BYTES = 2_000_000;

export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

/** Resolve and pin a public IP on every hop; never forward the user's cookies. */
export async function readProductPage(input: string, signal = AbortSignal.timeout(12_000)): Promise<ImportedProduct> {
  let url = new URL(normalizeProductUrl(input));
  for (let hop = 0; hop < 4; hop++) {
    const addresses = await lookup(url.hostname, { family: 4, all: true });
    signal.throwIfAborted();
    if (!addresses.length || addresses.some((a) => !isPublicIPv4(a.address))) throw new Error('public_url_required');
    const result = await new Promise<{ status: number; location?: string; html: string }>((resolve, reject) => {
      const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const req = request(url, {
        signal,
        family: 4,
        lookup: (_hostname, options, callback) => options.all
          ? callback(null, [{ address: addresses[0].address, family: 4 }])
          : callback(null, addresses[0].address, 4),
        headers: { 'user-agent': '2ndhome Product Import', accept: 'text/html, application/xhtml+xml', 'accept-encoding': 'identity' },
      }, (res) => {
        const status = res.statusCode ?? 500;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, html: '' });
        }
        if (status !== 200 || !/text\/html|application\/xhtml\+xml/i.test(res.headers['content-type'] ?? '')) {
          res.resume();
          return reject(new Error('page_unavailable'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) req.destroy(new Error('page_too_large'));
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          try {
            const bytes = Buffer.concat(chunks);
            const charset = /charset\s*=\s*["']?([\w-]+)/i.exec(res.headers['content-type'] ?? '')?.[1]
              ?? /charset\s*=\s*["']?([\w-]+)/i.exec(bytes.subarray(0, 2048).toString('ascii'))?.[1] ?? 'utf-8';
            resolve({ status, html: new TextDecoder(charset).decode(bytes) });
          } catch { reject(new Error('page_encoding')); }
        });
      });
      req.on('error', reject);
      req.end();
    });
    if (result.status >= 300 && result.status < 400) {
      if (!result.location) throw new Error('page_unavailable');
      url = new URL(normalizeProductUrl(new URL(result.location, url).href));
      continue;
    }
    return parseProductPage(result.html, url.href);
  }
  throw new Error('too_many_redirects');
}

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  return value.replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi, (entity, num, name) => {
    if (num) {
      const code = num[0].toLowerCase() === 'x' ? parseInt(num.slice(1), 16) : Number(num);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' } as Record<string, string>)[name.toLowerCase()] ?? entity;
  }).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300) || undefined;
}

function attrs(tag: string) {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
  return out;
}

function dimension(raw: any): number | undefined {
  const value = typeof raw === 'object' && raw ? raw.value : raw;
  const unit = typeof raw === 'object' && raw ? raw.unitCode ?? raw.unitText : typeof raw === 'string' ? raw.replace(/[\d.,\s]/g, '') : '';
  const factor: Record<string, number> = { mm: 0.1, mmt: 0.1, cm: 1, cmt: 1, m: 100, mtr: 100, in: 2.54, inch: 2.54, inh: 2.54, '밀리미터': 0.1, '센티미터': 1, '미터': 100 };
  const f = factor[String(unit).toLowerCase()];
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  if (f && Number.isFinite(n) && n * f >= 0.5 && n * f <= 10000) return Math.round(n * f * 10) / 10;
}

export function parseProductPage(html: string, url: string): ImportedProduct {
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (a.property || a.name || a.itemprop) meta[(a.property ?? a.name ?? a.itemprop).toLowerCase()] = a.content;
  }
  let product: any;
  let visited = 0;
  const walk = (node: any, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 30 || ++visited > 10000 || product) return;
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.some((t: unknown) => typeof t === 'string' && /(?:^|\/)Product$/i.test(t))) { product = node; return; }
    for (const value of Object.values(node)) walk(value, depth + 1);
  };
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attrs(m[1]).type?.toLowerCase() !== 'application/ld+json') continue;
    try { walk(JSON.parse(m[2])); } catch { /* Other metadata may still be useful. */ }
  }
  const p = product ?? {};
  const name = clean(p.name) ?? clean(meta['og:title']) ?? clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const brand = clean(typeof p.brand === 'string' ? p.brand : p.brand?.name) ?? clean(meta['product:brand']);
  const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
  const currency = offer?.priceCurrency ?? meta['product:price:currency'] ?? meta['og:price:currency'];
  const rawPrice = offer?.price ?? offer?.lowPrice ?? meta['product:price:amount'] ?? meta['og:price:amount'];
  const price = Number(String(rawPrice ?? '').replace(/,/g, ''));
  const dims = { w: dimension(p.width), d: dimension(p.depth), h: dimension(p.height) };
  const categories: [ImportedProduct['category'], RegExp][] = [
    ['desk', /책상|데스크|\bdesk\b/i], ['sofa', /소파|쇼파|\bsofa\b|\bcouch\b/i], ['chair', /의자|체어|\bchair\b/i],
    ['bed', /침대|매트리스|\bbed\b|mattress/i], ['table', /테이블|식탁|\btable\b/i], ['shelf', /선반|행거|\bshelf\b|bookcase/i],
    ['storage', /수납|서랍|옷장|캐비닛|cabinet|wardrobe/i], ['lighting', /조명|스탠드|\blamp\b/i], ['textile', /러그|카펫|커튼|\brug\b/i],
  ];
  const category = categories.find(([, pattern]) => pattern.test(`${p.category ?? ''} ${name ?? ''}`))?.[0];
  return { url, name, brand, category, ...(typeof currency === 'string' && currency.toUpperCase() === 'KRW' && Number.isFinite(price) && price > 0 ? { price } : {}),
    ...(Object.values(dims).some((v) => v !== undefined) ? { dims } : {}) };
}
