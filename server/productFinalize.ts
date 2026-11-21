import type { ImportedProduct, ImportedProductOption } from '../src/lib/productImport.js';
import { parseOptionLabel } from '../src/lib/productOptions.js';
import { classifyShape, completeDims, fitParamsToDims, type Axis, type Dims } from '../src/lib/productShape.js';
import type { ParamValue } from '../src/types.js';

const AXES: Axis[] = ['w', 'd', 'h'];

/**
 * Last step of every import: decide what kind of furniture this is, give the 3D generator
 * matching form parameters, and fill only the axes the seller never stated with a typical
 * size for that kind (listed in `dimsEstimated` so the editor can flag them).
 */
export function finalizeProduct(
  p: ImportedProduct,
  ctx: { categoryPath?: string[]; extra?: string; presetParams?: Record<string, ParamValue> } = {},
): ImportedProduct {
  const shape = classifyShape({
    name: p.name,
    categoryPath: ctx.categoryPath,
    extra: [ctx.extra ?? '', p.notes ?? '', p.options?.map((o) => o.label).join(' ') ?? ''].join(' '),
    dims: p.dims ?? {},
    features: p.features,
  });
  if (!shape) return p;

  const estimated = new Set<Axis>(p.dimsEstimated ?? []);
  // A bed sold by mattress size ("SS", "Q") is sized from that mattress, not a generic bed.
  const typical = { ...shape.typical };
  const mw = Number(ctx.presetParams?.mattressW);
  const ml = Number(ctx.presetParams?.mattressL);
  if (shape.model === 'bed' && Number.isFinite(mw) && Number.isFinite(ml)) {
    const mattressOnly = shape.params.style === 'mattress';
    typical.w = mattressOnly ? mw : mw + (shape.params.style === 'floor' ? 4 : 8);
    typical.d = mattressOnly ? ml : ml + Number(ctx.presetParams?.headT ?? shape.params.headT ?? 6) + 6;
  }
  const frameH = Number(ctx.presetParams?.frameH);
  if (shape.model === 'bed' && Number(ctx.presetParams?.headT ?? shape.params.headT) === 0 && Number.isFinite(frameH)) {
    typical.h = frameH + 25;
  }
  let dims: Dims = { ...(p.dims ?? {}) };
  if (!AXES.some((a) => dims[a] !== undefined)) {
    dims = typical;
    AXES.forEach((a) => estimated.add(a));
  } else {
    const done = completeDims(dims, { ...shape, typical });
    dims = done.dims;
    done.estimated.forEach((a) => estimated.add(a));
  }

  const preset = ctx.presetParams ?? {};
  const params = { ...fitParamsToDims({ ...shape, params: { ...shape.params, ...preset } }, dims), ...preset };
  const options: ImportedProductOption[] | undefined = p.options?.map((o) => {
    const own = o.params ?? parseOptionLabel(o.label, shape)?.params ?? {};
    // re-fit size-dependent parts (drawer columns, mattress size, door count) to this option
    const fitted = fitParamsToDims({ ...shape, params: { ...params, ...own } }, { ...dims, ...(o.dims ?? {}) });
    const diff: Record<string, ParamValue> = {};
    for (const [k, v] of Object.entries({ ...fitted, ...own })) if (params[k] !== v) diff[k] = v;
    return Object.keys(diff).length ? { ...o, params: diff } : o;
  });

  return {
    ...p,
    category: shape.category,
    model: shape.model,
    sub: shape.sub,
    ...(shape.ergo ? { ergo: shape.ergo } : {}),
    ...(shape.mount ? { mount: shape.mount } : {}),
    ...(shape.seatH ? { seatH: shape.seatH } : {}),
    params,
    dims: dims as ImportedProduct['dims'],
    ...(estimated.size ? { dimsEstimated: AXES.filter((a) => estimated.has(a)) } : { dimsEstimated: undefined }),
    ...(options ? { options } : {}),
  };
}

/** Removes estimated axes so an AI reading or the editor never mistakes them for seller data. */
export function statedDims(p: ImportedProduct): Dims | undefined {
  if (!p.dims) return undefined;
  const est = new Set(p.dimsEstimated ?? []);
  const out: Dims = {};
  for (const a of AXES) if (p.dims[a] !== undefined && !est.has(a)) out[a] = p.dims[a];
  return Object.keys(out).length ? out : undefined;
}
