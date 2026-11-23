import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '../src/catalog/seed';
import { srvPut } from '../src/store/server';

afterEach(() => vi.unstubAllGlobals());

describe('server save feedback', () => {
  it('reports HTTP failures without treating them as concurrency conflicts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    expect(await srvPut(sampleProject(), 'revision')).toEqual({
      ok: false, conflict: false, status: 500, error: '서버 저장 요청 실패 (HTTP 500)',
    });
  });

  it('retains network errors for the editor instead of silently swallowing them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await srvPut(sampleProject(), 'revision')).toEqual({
      ok: false, conflict: false, status: 0, error: 'Failed to fetch',
    });
  });

  it('keeps optimistic concurrency and authenticated save requests intact', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ etag: 'next' })));
    vi.stubGlobal('fetch', fetch);
    const project = sampleProject();
    expect(await srvPut(project, 'revision')).toEqual({ ok: true, etag: 'next' });
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      method: 'PUT', credentials: 'same-origin', body: JSON.stringify(project),
      headers: expect.objectContaining({ 'x-2ndhome': '1', 'x-base-etag': 'revision' }),
    }));
    fetch.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    expect(await srvPut(project, 'revision')).toEqual({ ok: false, conflict: true });
  });
});
