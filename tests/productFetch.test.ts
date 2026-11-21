import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_BYTES, readProductPage } from '../server/productPage';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
vi.mock('node:http', () => ({ request: mocks.request }));

const ENV_KEYS = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AI_MODEL', 'GEMINI_MODEL'];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  mocks.lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  mocks.request.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function serve(status: number, headers: Record<string, string>, body: string | Buffer = '') {
  const buf = typeof body === 'string' ? Buffer.from(body) : body;
  mocks.request.mockImplementationOnce((_url, options, receive) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
    req.destroy = (error) => {
      req.emit('error', error);
    };
    req.end = () => {
      const res = Readable.from(buf.length ? [buf] : []) as Readable & {
        statusCode: number;
        headers: Record<string, string>;
      };
      res.statusCode = status;
      res.headers = headers;
      options.lookup('shop.example', { all: true }, (_err: unknown, addresses: unknown) => {
        expect(addresses).toEqual([{ address: '93.184.216.34', family: 4 }]);
      });
      receive(res);
    };
    return req;
  });
}

describe('remote product page loading', () => {
  it('pins DNS, sends browser headers without session cookies and decodes the product page', async () => {
    serve(200, { 'content-type': 'text/html; charset=utf-8' }, '<title>테스트 소파</title>');
    expect(await readProductPage('https://shop.example/item')).toMatchObject({ name: '테스트 소파', category: 'sofa' });
    const headers = mocks.request.mock.calls[0][1].headers;
    expect(headers).not.toHaveProperty('cookie');
    expect(headers['user-agent']).toContain('Mozilla/5.0');
    expect(headers['accept-language']).toContain('ko-KR');
    expect(headers['accept-encoding']).toContain('gzip');
  });

  it('decompresses gzip and brotli HTML responses safely', async () => {
    const html = '<title>오크 원목 식탁 - 오늘의집</title><p>크기: W1600 x D800 x H750 mm</p><p>판매가: 420,000원</p>';
    serve(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip' }, gzipSync(Buffer.from(html)));
    expect(await readProductPage('https://store.ohou.se/goods/1001')).toMatchObject({
      name: '오크 원목 식탁',
      category: 'table',
      price: 420000,
      dims: { w: 160, d: 80, h: 75 },
    });

    serve(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'br' }, brotliCompressSync(Buffer.from(html)));
    expect(await readProductPage('https://store.ohou.se/goods/1002')).toMatchObject({
      name: '오크 원목 식탁',
      dims: { w: 160, d: 80, h: 75 },
    });
  });

  it('falls back to Ohouse canonical twin URL when primary URL is blocked', async () => {
    serve(403, { 'content-type': 'text/html' });
    serve(
      200,
      { 'content-type': 'text/html; charset=utf-8' },
      '<title>[한샘] 클레어 3인 소파 | 오늘의집</title><p>사이즈: W2100 x D950 x H850 mm</p><p>890,000원</p>',
    );
    const result = await readProductPage('https://ohou.se/productions/123456/selling');
    expect(result).toMatchObject({
      url: 'https://store.ohou.se/goods/123456',
      name: '클레어 3인 소파',
      brand: '한샘',
      price: 890000,
      dims: { w: 210, d: 95, h: 85 },
    });
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it('reports blocked pages cleanly instead of returning a bot challenge title', async () => {
    serve(200, { 'content-type': 'text/html; charset=utf-8' }, '<title>Just a moment...</title><div>cdn-cgi/challenge-platform</div>');
    expect(await readProductPage('https://shop.example/protected')).toEqual({
      url: 'https://shop.example/protected',
      blocked: true,
      aiConfigured: false,
    });
  });

  it('uses Gemini vision on detail images when HTML lacks dimensions and GEMINI_API_KEY is configured', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    serve(
      200,
      { 'content-type': 'text/html; charset=utf-8' },
      `<title>[에싸] 3인 패브릭 소파 | 오늘의집</title>
       <p>판매가: 1,290,000원</p>
       <img src="https://cdn.example/product_size_spec.jpg" alt="사이즈 상세정보">`,
    );
    // Spec image fetch
    serve(200, { 'content-type': 'image/jpeg' }, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    name: '3인 패브릭 소파',
                    brand: '에싸',
                    price: 1290000,
                    category: 'sofa',
                    model: 'sofa',
                    dims: { w: 220, d: 98, h: 86 },
                    options: [
                      { label: '3인용', dims: { w: 220, d: 98, h: 86 }, price: 1290000 },
                      { label: '4인용', dims: { w: 280, d: 98, h: 86 }, price: 1690000 },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await readProductPage('https://shop.example/sofa');
    expect(res).toMatchObject({
      name: '3인 패브릭 소파',
      brand: '에싸',
      price: 1290000,
      category: 'sofa',
      dims: { w: 220, d: 98, h: 86 },
      source: 'page+ai',
      aiConfigured: true,
    });
    expect(res.options).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const aiBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(aiBody.contents[0].parts.some((part: any) => part.inline_data?.mime_type === 'image/jpeg')).toBe(true);
  });

  it('falls back to Gemini web lookup when a store blocks direct fetch and GEMINI_API_KEY is set', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    serve(403, { 'content-type': 'text/html' });
    serve(403, { 'content-type': 'text/html' });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '```json\n{"name":"데스커 컴퓨터 책상 1400","brand":"데스커","price":189000,"category":"desk","dims":{"w":140,"d":70,"h":72}}\n```',
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await readProductPage('https://store.ohou.se/goods/555555');
    expect(res).toMatchObject({
      name: '데스커 컴퓨터 책상 1400',
      brand: '데스커',
      price: 189000,
      category: 'desk',
      dims: { w: 140, d: 70, h: 72 },
      source: 'ai-web',
      aiConfigured: true,
    });
    const aiBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(aiBody.tools).toEqual([{ url_context: {} }, { google_search: {} }]);
  });

  it('rejects a redirect to a private destination before making another request', async () => {
    serve(302, { location: 'http://169.254.169.254/metadata' });
    mocks.lookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    await expect(readProductPage('https://shop.example/item')).rejects.toThrow('public_url_required');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('rejects non-HTML and oversized responses', async () => {
    serve(200, { 'content-type': 'application/pdf' });
    await expect(readProductPage('https://shop.example/item')).rejects.toThrow('page_unavailable');
    serve(200, { 'content-type': 'text/html' }, 'x'.repeat(MAX_BYTES + 1));
    await expect(readProductPage('https://shop.example/item')).rejects.toThrow('page_too_large');
  });
});
