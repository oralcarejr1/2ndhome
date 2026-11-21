import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyGeminiError,
  cleanUrlForLookup,
  extractJsonObject,
  extractWithAi,
  getAiConfig,
  lookupUrlWithGemini,
  lookupUrlWithGeminiWithStatus,
  mergeImportedProducts,
  sanitizeAiProduct,
} from '../server/productAi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI product extraction', () => {
  it('detects provider priority and honors model overrides', () => {
    expect(getAiConfig({})).toBeNull();
    expect(getAiConfig({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' })).toEqual({
      provider: 'gemini',
      apiKey: 'g',
      model: 'gemini-4-hydrogen',
    });
    expect(getAiConfig({ OPENAI_API_KEY: 'o', AI_MODEL: 'gpt-6.2-sol' })).toEqual({
      provider: 'openai',
      apiKey: 'o',
      model: 'gpt-6.2-sol',
      baseUrl: 'https://api.openai.com/v1',
    });
    expect(getAiConfig({ ANTHROPIC_API_KEY: 'a' })).toEqual({
      provider: 'anthropic',
      apiKey: 'a',
      model: 'claude-haiku-5-5',
    });
  });

  it('extracts JSON from fenced blocks and prose wrappers', () => {
    expect(extractJsonObject('```json\n{"name":"소파"}\n```')).toEqual({ name: '소파' });
    expect(extractJsonObject('Here is the result:\n{"name":"책상","dims":{"w":120}}\nDone.')).toEqual({
      name: '책상',
      dims: { w: 120 },
    });
  });

  it('sanitizes AI output strictly, rejecting invalid enums, marketplace brands, and out-of-range dimensions', () => {
    const clean = sanitizeAiProduct(
      {
        name: '  모듈 패브릭 소파  ',
        brand: '오늘의집',
        price: 50,
        category: 'invalid_cat',
        model: 'not_a_model',
        dims: { w: 210.44, d: -5, h: 9999 },
        color: '#EFE8DC',
        material: 'fabric',
        options: [
          { label: '3인용', dims: { w: 210, d: 95, h: 85 }, price: 890000 },
          { label: '빈 옵션' },
        ],
      },
      'https://store.ohou.se/goods/1',
    );
    expect(clean).toEqual({
      url: 'https://store.ohou.se/goods/1',
      name: '모듈 패브릭 소파',
      dims: { w: 210.4 },
      color: '#efe8dc',
      material: 'fabric',
      options: [{ label: '3인용', dims: { w: 210, d: 95, h: 85 }, price: 890000 }],
    });
  });

  it('calls Anthropic messages API with vision block and merges results safely', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              name: '아르떼 원목 식탁',
              brand: '까사미아',
              price: 780000,
              category: 'table',
              model: 'table',
              ergo: 'diningTable',
              dims: { w: 160, d: 85, h: 74 },
              material: 'wood',
              color: '#c49a6c',
            }),
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ai = await extractWithAi(
      {
        url: 'https://shop.example/table',
        text: '아르떼 원목 식탁',
        images: [{ mimeType: 'image/png', base64: 'AAAA' }],
      },
      { env: { ANTHROPIC_API_KEY: 'sk-ant-test' } },
    );

    expect(ai).toMatchObject({
      name: '아르떼 원목 식탁',
      brand: '까사미아',
      price: 780000,
      dims: { w: 160, d: 85, h: 74 },
    });

    const merged = mergeImportedProducts(
      { url: 'https://shop.example/table', price: 750000, dims: { w: 160 } },
      ai,
      true,
    );
    expect(merged).toMatchObject({
      price: 750000, // deterministic exact price kept
      dims: { w: 160, d: 85, h: 74 }, // complete AI image dims filled in
      brand: '까사미아',
    });
  });

  it('calls gemini-4-hydrogen without sampling params and sets thinkingLevel', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    name: '클레어 3인 소파',
                    brand: '한샘',
                    category: 'sofa',
                    dims: { w: 210, d: 95, h: 85 },
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const extracted = await extractWithAi(
      { url: 'https://store.ohou.se/goods/123', text: '클레어 3인 소파' },
      { env: { GEMINI_API_KEY: 'test-key' } },
    );
    expect(extracted).toMatchObject({ name: '클레어 3인 소파', dims: { w: 210, d: 95, h: 85 } });
    expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-4-hydrogen:generateContent');
    const body1 = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body1.generationConfig).toEqual({
      thinkingConfig: { thinkingLevel: 'LOW' },
      responseMimeType: 'application/json',
    });
    expect(body1.generationConfig.temperature).toBeUndefined();

    await lookupUrlWithGemini('https://store.ohou.se/goods/123', { env: { GEMINI_API_KEY: 'test-key' } });
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body2.generationConfig).toEqual({
      thinkingConfig: { thinkingLevel: 'MEDIUM' },
    });
    expect(body2.tools).toEqual([{ url_context: {} }, { google_search: {} }]);
  });

  it('strips tracking params and builds store hints for Ohouse URLs', () => {
    const cleaned = cleanUrlForLookup(
      'https://store.ohou.se/goods/3067204?affect_type=StoreSearchResult&affect_id=12&utm_source=kakao',
    );
    expect(cleaned.cleanUrl).toBe('https://store.ohou.se/goods/3067204');
    expect(cleaned.hints.join('\n')).toContain('3067204');
    expect(cleaned.hints.join('\n')).toContain('https://ohou.se/productions/3067204/selling');
  });

  it('classifies Gemini API errors accurately without leaking secrets', () => {
    expect(classifyGeminiError(401, '{"error":{"status":"UNAUTHENTICATED","message":"API key not valid"}}').kind).toBe('auth');
    expect(classifyGeminiError(404, '{"error":{"status":"NOT_FOUND","message":"models/bad-model is not found"}}').kind).toBe('model');
    expect(
      classifyGeminiError(400, '{"error":{"status":"INVALID_ARGUMENT","message":"google_search grounding is not supported on the free tier"}}').kind,
    ).toBe('tools_unavailable');
    expect(classifyGeminiError(429, '{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded"}}').kind).toBe('quota');
  });

  it('retries with url_context alone when combined tools are rejected on Gemini free tier', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'google_search grounding is not available on the free tier' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      name: '아르떼 원목 식탁',
                      brand: '까사미아',
                      price: 680000,
                      category: 'table',
                      dims: { w: 160, d: 80, h: 74 },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const res = await lookupUrlWithGeminiWithStatus('https://store.ohou.se/goods/123?affect_type=Share', {
      env: { GEMINI_API_KEY: 'free-key' },
    });
    expect(res.error).toBeUndefined();
    expect(res.product).toMatchObject({ name: '아르떼 원목 식탁', brand: '까사미아', dims: { w: 160, d: 80, h: 74 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tools).toEqual([{ url_context: {} }, { google_search: {} }]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tools).toEqual([{ url_context: {} }]);
    warnSpy.mockRestore();
  });

  it('retries with google_search alone when url_context+search returns empty nulls, and aborts fast on 401 auth errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"name":null,"dims":{"w":null,"d":null,"h":null}}' }] } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: '{"name":"데스커 책상 1400","brand":"데스커","category":"desk","dims":{"w":140,"d":70,"h":72}}' }],
              },
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const res = await lookupUrlWithGeminiWithStatus('https://store.ohou.se/goods/789', {
      env: { GEMINI_API_KEY: 'paid-key' },
    });
    expect(res.product).toMatchObject({ name: '데스커 책상 1400', dims: { w: 140, d: 70, h: 72 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tools).toEqual([{ google_search: {} }]);

    const authMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"error":{"status":"UNAUTHENTICATED","message":"API key not valid"}}',
    });
    vi.stubGlobal('fetch', authMock);
    const authRes = await lookupUrlWithGeminiWithStatus('https://store.ohou.se/goods/789', {
      env: { GEMINI_API_KEY: 'bad-key' },
    });
    expect(authRes).toEqual({ product: null, error: 'auth' });
    expect(authMock).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
