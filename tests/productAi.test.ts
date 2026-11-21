import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractJsonObject,
  extractWithAi,
  getAiConfig,
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
      model: 'gemini-3.8-flash',
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
});
