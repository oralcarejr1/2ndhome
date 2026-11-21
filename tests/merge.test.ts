import { describe, expect, it } from 'vitest';
import { sampleProject } from '../src/catalog/seed';
import { merge3, sameContent } from '../src/store/merge';
import type { Project } from '../src/types';

const clone = (p: Project): Project => JSON.parse(JSON.stringify(p));

describe('three-way merge between devices', () => {
  const base = sampleProject();
  const v0 = base.versions[0].id;
  const v1 = base.versions[1].id;

  it('takes each side’s change when they touched different layouts', () => {
    const local = clone(base);
    local.versions.find((v) => v.id === v0)!.items.pop();
    const remote = clone(base);
    remote.versions.find((v) => v.id === v1)!.notes = 'from phone';
    const { merged, copies } = merge3(base, local, remote);
    expect(copies).toBe(0);
    expect(merged.versions.find((v) => v.id === v0)!.items.length).toBe(base.versions[0].items.length - 1);
    expect(merged.versions.find((v) => v.id === v1)!.notes).toBe('from phone');
  });

  it('keeps both when the same layout changed on both devices', () => {
    const local = clone(base);
    local.versions[0].notes = 'laptop';
    const remote = clone(base);
    remote.versions[0].notes = 'phone';
    const { merged, copies } = merge3(base, local, remote);
    expect(copies).toBe(1);
    expect(merged.versions.find((v) => v.id === v0)!.notes).toBe('phone');
    expect(merged.versions.some((v) => v.notes === 'laptop' && v.name.includes('이 기기 사본'))).toBe(true);
  });

  it('ignores thumbnail-only differences and keeps deletions', () => {
    const local = clone(base);
    local.versions[0].thumb = 'data:image/jpeg;base64,AAA';
    local.versions = local.versions.filter((v) => v.id !== v1); // deleted on this device
    local.moodboard.push({ id: 'ref-new', kind: 'note', title: 'new', note: '', tags: [], createdAt: 1 });
    const remote = clone(base);
    remote.versions[0].thumb = 'data:image/jpeg;base64,BBB';
    remote.name = '새 이름';
    const { merged, copies } = merge3(base, local, remote);
    expect(copies).toBe(0);
    expect(merged.versions.some((v) => v.id === v1)).toBe(false);
    expect(merged.moodboard.some((r) => r.id === 'ref-new')).toBe(true);
    expect(merged.name).toBe('새 이름');
  });

  it('never loses a never-synced device’s edits', () => {
    const remote = clone(base);
    const local = clone(base);
    local.versions[0].notes = 'edited before first sign-in';
    const { merged } = merge3(null, local, remote);
    expect(merged.versions.some((v) => v.notes === 'edited before first sign-in')).toBe(true);
  });

  it('tells untouched starting data apart from real edits (ids and thumbnails ignored)', () => {
    const a = sampleProject();
    const b = sampleProject();
    expect(sameContent(a, b)).toBe(true);
    b.versions[0].thumb = 'data:image/jpeg;base64,AAA';
    expect(sameContent(a, b)).toBe(true);
    b.versions[0].items[0].x += 10;
    expect(sameContent(a, b)).toBe(false);
  });
});
