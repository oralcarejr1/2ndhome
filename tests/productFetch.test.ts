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
  it('pins DNS, sends well-formed client headers without session cookies and decodes the product page', async () => {
    serve(200, { 'content-type': 'text/html; charset=utf-8' }, '<title>테스트 소파</title>');
    expect(await readProductPage('https://shop.example/item')).toMatchObject({ name: '테스트 소파', category: 'sofa' });
    const headers = mocks.request.mock.calls[0][1].headers;
    expect(headers).not.toHaveProperty('cookie');
    expect(headers['user-agent']).toContain('2ndhome/1.0');
    expect(headers['user-agent']).toContain('https://github.com/oralcarejr1/2ndhome');
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

  it('parses Ohouse Next.js dehydratedState with nested price objects while ignoring recommended products', async () => {
    const nextData = {
      props: {
        pageProps: {
          dehydratedState: {
            queries: [
              {
                queryKey: ['goods-detail', '3067204'],
                state: {
                  data: {
                    recommendedProducts: [
                      { name: '추천 쿠션', brand: { name: '다른브랜드' }, price: { representativeSellingPrice: 19900 } },
                    ],
                    goods: {
                      goodsName: '[단독] 노르딕 오크 4인 식탁 1400',
                      brand: { name: '레이디가구' },
                      price: {
                        representativeOriginalPrice: 520000,
                        representativeSellingPrice: 369000,
                      },
                      productNotices: [{ title: '크기', description: 'W1400 x D800 x H740mm' }],
                    },
                  },
                },
              },
            ],
          },
        },
      },
    };
    const html = `<html><head><title>오늘의집</title><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></head><body></body></html>`;
    serve(200, { 'content-type': 'text/html; charset=utf-8' }, html);
    const result = await readProductPage('https://store.ohou.se/goods/3067204');
    expect(result).toMatchObject({
      name: '노르딕 오크 4인 식탁 1400',
      brand: '레이디가구',
      price: 369000,
      category: 'table',
      dims: { w: 140, d: 80, h: 74 },
    });
  });

  it('falls back to Ohouse canonical twin URL when primary URL is blocked, including after short-link redirects', async () => {
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

    // Short-link redirect -> blocked tracked URL -> clean canonical URL retry
    mocks.request.mockReset();
    serve(302, { location: 'https://store.ohou.se/goods/777777?affect_type=Share&utm_source=app' });
    serve(403, { 'content-type': 'text/html' });
    serve(
      200,
      { 'content-type': 'text/html; charset=utf-8' },
      '<title>[일룸] 로이 책상 1200 | 오늘의집</title><p>크기: 1200 x 600 x 720 mm</p><p>299,000원</p>',
    );
    const shortRes = await readProductPage('https://ozip.me/abc123');
    expect(shortRes).toMatchObject({
      url: 'https://store.ohou.se/goods/777777',
      name: '로이 책상 1200',
      brand: '일룸',
      price: 299000,
      dims: { w: 120, d: 60, h: 72 },
    });
  });

  it('reports blocked pages cleanly instead of returning a bot challenge title', async () => {
    serve(200, { 'content-type': 'text/html; charset=utf-8' }, '<title>Just a moment...</title><div>cdn-cgi/challenge-platform</div>');
    expect(await readProductPage('https://shop.example/protected')).toEqual({
      url: 'https://shop.example/protected',
      blocked: true,
      aiConfigured: false,
    });
  });

  it('reads an Ohouse goods record, sends size-chart slices to the AI and replaces estimated sizes', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const goods = {
      production: {
        name: '할인가 159,900원/뮤카 회전 전신거울 수납 화장대 스툴포함',
        brand: { name: '파로마 공식스토어' },
        sellingPrice: 169900,
        informationNoticeItems: { items: [{ displayName: '크기', content: '상세페이지 참조' }] },
        description: '<img src="https://img.example/0120_spec.jpg">',
      },
      categories: [{ title: '가구' }, { title: '화장대·콘솔' }, { title: '콘솔' }],
      seoOptionNames: ['블랙', '화이트'],
    };
    const data = { props: { pageProps: { dehydratedState: { queries: [{ queryKey: ['goods', 4169873], state: { data: goods } }] } } } };
    serve(200, { 'content-type': 'text/html; charset=utf-8' }, `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`);
    const sharp = (await import('sharp')).default;
    const lines = Array.from({ length: 10 }, (_, i) => ({ input: { create: { width: 500, height: 3, channels: 3 as const, background: '#222' } }, left: 100, top: 40 + i * 60 }));
    const chart = await sharp({ create: { width: 860, height: 700, channels: 3, background: '#fff' } }).composite(lines).jpeg().toBuffer();
    serve(200, { 'content-type': 'image/jpeg' }, chart);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ name: '뮤카 화장대', dims: { w: 44.5, d: 44.5, h: 160.5 }, features: { mirror: true } }) }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await readProductPage('https://store.ohou.se/goods/4169873?utm_source=externalsharing&channel=externalsharing');
    expect(res).toMatchObject({
      url: 'https://store.ohou.se/goods/4169873',
      name: '뮤카 회전 전신거울 수납 화장대 스툴포함',
      brand: '파로마',
      price: 169900,
      category: 'storage',
      model: 'vanity',
      params: { style: 'tower' },
      dims: { w: 44.5, d: 44.5, h: 160.5 },
      source: 'page+ai',
    });
    expect(res.dimsEstimated).toBeUndefined();
    const aiBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(aiBody.contents[0].parts.filter((part: any) => part.inline_data?.mime_type === 'image/jpeg')).toHaveLength(1);
    expect(aiBody.contents[0].parts[0].text).toContain('Store category: 가구 > 화장대·콘솔 > 콘솔');
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
      model: 'table',
      ergo: 'desk',
      dims: { w: 140, d: 70, h: 72 },
      source: 'ai-web',
      aiConfigured: true,
    });
    const aiBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(aiBody.tools).toEqual([{ url_context: {} }, { google_search: {} }]);
  });

  it('surfaces diagnostic aiError when blocked store and Gemini free-tier fallback both fail', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.GEMINI_API_KEY = 'free-tier-key';
    serve(403, { 'content-type': 'text/html' });
    serve(403, { 'content-type': 'text/html' });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"error":{"status":"INVALID_ARGUMENT","message":"google_search grounding is not available on the free tier"}}',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"name":null,"dims":{"w":null,"d":null,"h":null}}' }] } }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const res = await readProductPage('https://store.ohou.se/goods/666666');
    expect(res).toEqual({
      url: 'https://ohou.se/productions/666666/selling',
      blocked: true,
      aiConfigured: true,
      aiError: 'tools_unavailable',
    });
    warnSpy.mockRestore();
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
