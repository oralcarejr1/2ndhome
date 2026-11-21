import { uid } from '../lib/geometry';
import { getBlob } from '../store/persistence';
import { getProduct } from '../store/store';
import type { PlacedItem, Project } from '../types';

/** Full project backup including locally stored images and 3D files. */
export async function exportProject(p: Project) {
  const ids = new Set<string>();
  for (const r of p.moodboard) if (r.blobId && !r.blobId.startsWith('asset:')) ids.add(r.blobId);
  if (p.plan.underlay && !p.plan.underlay.blobId.startsWith('asset:')) ids.add(p.plan.underlay.blobId);
  for (const c of p.customProducts) if (c.asset) ids.add(c.asset.blobId);
  const blobs: Record<string, { type: string; data: string }> = {};
  for (const id of ids) {
    const b = await getBlob(id);
    if (!b) continue;
    const data = await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.readAsDataURL(b);
    });
    blobs[id] = { type: b.type, data };
  }
  return JSON.stringify({ format: '2ndhome', version: 1, project: p, blobs });
}

/** Layout code for the current version (copy/paste between devices or into the old 2D tool). */
export function layoutCode(items: PlacedItem[]) {
  return JSON.stringify({ format: '2ndhome-items', items: items.filter((i) => !i.locked) });
}

const LEGACY_MAP: Record<string, string> = {
  bed: 'gen-bed-q',
  sofa: 'gen-sofa-3',
  table: 'gen-table-4',
  desk: 'gen-desk-120',
  chair: 'gen-dining-chair',
  storage: 'gen-dresser',
  fridge: 'gen-fridge-s',
  washer: 'gen-dryer-mini',
  rug: 'gen-rug-160',
  etc: 'gen-box',
};

/**
 * Accepts this app's layout code, or another planner's JSON (metres, items with kind/w/d/x/y/rot, optional catalogId).
 * Returns the non-built-in items converted to placed items, or null.
 */
export function parseLayoutCode(raw: string, project?: Project): PlacedItem[] | null {
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  const obj = o as { format?: string; items?: unknown[] };
  if (!obj || !Array.isArray(obj.items)) return null;
  if (obj.format === '2ndhome-items') return (obj.items as PlacedItem[]).map((i) => ({ ...i, id: uid('i') }));
  const out: PlacedItem[] = [];
  for (const r of obj.items as Record<string, unknown>[]) {
    if (r.builtin) continue;
    const w = Number(r.w);
    const d = Number(r.d);
    if (!(w > 0 && d > 0)) continue;
    const studioId = typeof r.catalogId === 'string' && getProduct(r.catalogId, project) ? (r.catalogId as string) : null;
    const productId = studioId ?? LEGACY_MAP[String(r.kind)] ?? 'gen-box';
    const prod = getProduct(productId, project)!;
    const h = Number(r.h) > 0 ? Number(r.h) * 100 : prod.dims.h;
    out.push({
      id: uid('i'),
      productId,
      x: Number(r.x) * 100,
      z: Number(r.y) * 100,
      y: Number(r.elevation ?? 0) * 100,
      rot: (((-Number(r.rot ?? 0)) % 360) + 360) % 360,
      dims: { w: w * 100, d: d * 100, h },
      label: typeof r.name === 'string' ? r.name : undefined,
    });
  }
  return out;
}
