import { useEffect, useMemo, useState } from 'react';
import { computeChecks, computeHeatmap, computeIssues, resolveItems, type Check } from '../lib/analysis';
import { useScene } from '../scene/sceneState';
import { activeVersion, getProduct, useStore } from '../store/store';
import type { PersonProfile, Project, Version } from '../types';

export interface LayoutTotals {
  total: number;
  itemCount: number;
  floorArea: number;
}

export interface ErgoReport extends LayoutTotals {
  score: number;
  findings: Check[];
  minPassageCm: number | null;
  usableFloorRatio: number;
  bad: number;
  warn: number;
  issues: number;
}

/** Fast O(items) budget & floor area summary — safe to run on every render without invoking computeHeatmap. */
export function layoutTotals(project: Project, v: Version): LayoutTotals {
  let total = 0;
  let itemCount = 0;
  let floorAreaCm2 = 0;
  for (const it of v.items) {
    if (it.hidden || it.locked) continue;
    const prod = getProduct(it.productId, project);
    if (!prod) continue;
    itemCount++;
    if (it.status !== 'owned') total += prod.price ?? 0;
    const d = it.dims ?? prod.dims;
    if (prod.model !== 'rug' && it.y < 50 && prod.mount !== 'ceiling') {
      floorAreaCm2 += d.w * d.d;
    }
  }
  return { total, itemCount, floorArea: floorAreaCm2 / 10000 };
}

export function useLayoutTotals(): LayoutTotals {
  const project = useStore((s) => s.project);
  const v = activeVersion(project);
  return useMemo(() => (project && v ? layoutTotals(project, v) : { total: 0, itemCount: 0, floorArea: 0 }), [project, v]);
}

const cache = new Map<string, ErgoReport>();

export function ergoReport(project: Project, v: Version, profile?: PersonProfile): ErgoReport {
  const prof = profile ?? project.profiles.find((x) => x.id === project.activeProfileId) ?? project.profiles[0];
  const key = `${v.id}|${v.updatedAt}|${prof?.height}|${prof?.shoulder}|${project.plan.ceiling}|${JSON.stringify(project.moveIn)}|${project.customProducts.length}|${JSON.stringify(project.plan.walls.length)}|${project.plan.openings.length}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const heat = prof ? computeHeatmap(project, v, prof) : null;
  const findings = prof ? computeChecks(project, v, prof, heat) : [];
  const bad = findings.filter((f) => f.level === 'bad').length;
  const warn = findings.filter((f) => f.level === 'warn').length;
  const issuesMap = computeIssues(project, v);
  let issues = 0;
  for (const [, l] of issuesMap) if (l.some((x) => x.level === 'bad')) issues++;
  const res = resolveItems(project, v).filter((r) => !r.it.locked);
  const total = res.filter((r) => r.it.status !== 'owned').reduce((a, r) => a + (r.prod.price ?? 0), 0);
  const floorArea = res.filter((r) => r.prod.model !== 'rug' && r.y0 < 50 && r.prod.mount !== 'ceiling').reduce((a, r) => a + r.w * r.d, 0) / 10000;
  // Score only what the layout controls: skip built-ins (can't be changed) and move-in checks (depend on an unmeasured door).
  const locked = new Set(v.items.filter((i) => i.locked).map((i) => i.id));
  const counted = findings.filter((f) => f.group !== '반입·조립' && !(f.itemId && locked.has(f.itemId)));
  const cb = counted.filter((f) => f.level === 'bad').length;
  const cw = counted.filter((f) => f.level === 'warn').length;
  const score = Math.max(0, Math.min(100, Math.round(100 - cb * 8 - cw * 3 - issues * 6)));
  const rep: ErgoReport = {
    score,
    findings,
    minPassageCm: heat && heat.minPass > 0 ? Math.round(heat.minPass) : null,
    usableFloorRatio: heat?.freeRatio ?? 1,
    bad,
    warn,
    issues,
    total,
    itemCount: res.length,
    floorArea,
  };
  if (cache.size > 40) cache.clear();
  cache.set(key, rep);
  return rep;
}

/**
 * Heavy ergonomics + heatmap report hook.
 * Pauses recomputation during active 3D/2D dragging and debounces rapid edits so dragging stays 60fps.
 */
export function useErgo(): ErgoReport | null {
  const project = useStore((s) => s.project);
  const dragging = useScene((s) => s.dragging);
  const v = activeVersion(project);
  const [report, setReport] = useState<ErgoReport | null>(() => (project && v ? ergoReport(project, v) : null));

  useEffect(() => {
    if (!project || !v) {
      setReport(null);
      return;
    }
    if (dragging) return;
    const t = setTimeout(() => {
      setReport(ergoReport(project, v));
    }, 120);
    return () => clearTimeout(t);
  }, [project, v, dragging]);

  return report;
}

export const scoreClass = (n: number) => (n >= 80 ? 'sc-good' : n >= 60 ? 'sc-warn' : 'sc-bad');
