import sharp, { type Metadata, type Sharp } from 'sharp';
import type { InlineImage } from './productAi.js';

/**
 * Korean store detail pages are long stacks of images, and the size chart is often a
 * small band inside one very tall image (gallery + SPEC + notice in a single JPEG).
 * Vision models downscale tall images until the numbers are unreadable, so we cut every
 * detail image into page-sized slices and keep the ones that look like a drawing or
 * spec table: mostly light background, dark thin lines/text, little colour.
 */

export interface SliceCandidate extends InlineImage {
  score: number;
  source: number;
  order: number;
}

const TARGET_W = 1000;
const SPEC_URL = /spec|size|dimension|사이즈|치수|규격|도면|sizeinfo/i;

async function sliceStats(img: Sharp) {
  const { data, info } = await img.clone().resize({ width: 200, fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let white = 0;
  let ink = 0;
  let mid = 0;
  let sat = 0;
  const ch = info.channels;
  const px = info.width * info.height;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i];
    const g = data[i + 1] ?? r;
    const b = data[i + 2] ?? r;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (l > 222) white++;
    if (l < 170) ink++;
    if (l > 70 && l < 205) mid++;
    sat += mx === 0 ? 0 : (mx - mn) / mx;
  }
  return { white: white / px, ink: ink / px, mid: mid / px, sat: sat / px };
}

/** Diagram-likeness: light paper, a little dark ink, few mid-tone areas, low colour (photos score low). */
export function diagramScore(s: { white: number; ink: number; mid: number; sat: number }, specUrl: boolean): number {
  if (s.ink < 0.003) return -10; // blank band
  let score = s.white * 3 + Math.min(s.ink * 10, 1) - s.mid * 3 - s.sat * 2;
  if (s.white < 0.4) score -= 1.5; // photo / dark banner
  if (specUrl) score += 3;
  return score;
}

export async function sliceForVision(
  sources: { url: string; body: Buffer }[],
  opts: { maxSlices?: number } = {},
): Promise<SliceCandidate[]> {
  const maxSlices = opts.maxSlices ?? 12;
  const all: SliceCandidate[] = [];
  let order = 0;
  for (let si = 0; si < sources.length; si++) {
    const { url, body } = sources[si];
    let meta: Metadata;
    try {
      meta = await sharp(body, { limitInputPixels: 80_000_000 }).metadata();
    } catch {
      continue;
    }
    if (!meta.width || !meta.height || meta.width < 200 || meta.height < 150) continue;
    const scale = Math.min(1, TARGET_W / meta.width);
    const w = Math.round(meta.width * scale);
    const h = Math.round(meta.height * scale);
    const base = sharp(body, { limitInputPixels: 80_000_000 }).resize({ width: w }).flatten({ background: '#ffffff' });
    const normalized = await base.jpeg({ quality: 90 }).toBuffer().catch(() => null);
    if (!normalized) continue;
    const sliceH = Math.round(w * 1.3);
    const overlap = Math.round(w * 0.12);
    const specUrl = SPEC_URL.test(url);
    for (let top = 0; top < h; top += sliceH - overlap) {
      const height = Math.min(sliceH, h - top);
      if (height < 120) break;
      const part = sharp(normalized).extract({ left: 0, top, width: w, height });
      const stats = await sliceStats(part).catch(() => null);
      if (!stats) continue;
      const score = diagramScore(stats, specUrl);
      if (score <= -5) continue;
      const jpg = await part.jpeg({ quality: 82 }).toBuffer();
      all.push({ mimeType: 'image/jpeg', base64: jpg.toString('base64'), score, source: si, order: order++ });
      if (top + height >= h) break;
    }
  }
  return all
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSlices)
    .sort((a, b) => a.order - b.order);
}

/** Ask the CDN for a smaller copy when it supports it (Ohouse prs/image hosts). */
export function cdnSized(url: string, width = 1000): string {
  try {
    const u = new URL(url);
    if (/^prs\.ohou(?:se\.com|\.se)$|^prs\.ohousecdn\.com$/i.test(u.hostname) && !u.searchParams.has('w')) {
      u.searchParams.set('w', String(width));
      return u.href;
    }
  } catch { /* keep */ }
  return url;
}
