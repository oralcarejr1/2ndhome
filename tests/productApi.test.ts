import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import product from '../api/product';
import { COOKIE, makeToken } from '../server/auth';
import { readProductPage } from '../server/productPage';

vi.mock('../server/productPage', () => ({ readProductPage: vi.fn() }));

const ENV_KEYS = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];
const savedEnv: Record<string, string | undefined> = {};

let cookie: string;
beforeEach(async () => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  process.env.APP_PASSWORD = 'product-test';
  cookie = `${COOKIE}=${await makeToken()}`;
  vi.mocked(readProductPage).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://example.test/api/product', {
    method: 'POST',
    headers: { cookie, 'x-2ndhome': '1', ...headers },
    body: JSON.stringify(body),
  });

describe('product import API', () => {
  it('requires a session and same-site request header', async () => {
    expect((await product.fetch(request({ url: 'https://shop.example/item' }, { cookie: '' }))).status).toBe(401);
    expect((await product.fetch(request({ url: 'https://shop.example/item' }, { 'x-2ndhome': '' }))).status).toBe(403);
    expect(readProductPage).not.toHaveBeenCalled();
  });

  it('validates input and returns parsed data without saving a project', async () => {
    expect((await product.fetch(request({ url: 'javascript:alert(1)' }))).status).toBe(400);
    vi.mocked(readProductPage).mockResolvedValue({ url: 'https://shop.example/item', name: '제품' });
    const res = await product.fetch(request({ url: 'https://shop.example/item' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: '제품' });
  });

  it('returns a recoverable error for blocked pages without leaking remote content', async () => {
    vi.mocked(readProductPage).mockRejectedValue(new Error('private server detail'));
    const res = await product.fetch(request({ url: 'https://shop.example/item' }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'page_unavailable' });
  });

  it('extracts furniture specs from pasted webpage text without requiring an AI key', async () => {
    const res = await product.fetch(
      request({
        url: 'https://store.ohou.se/goods/999',
        text: '[한샘] 3인 패브릭 소파\n판매가: 690,000원\n크기: W2100 x D950 x H850 mm',
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      url: 'https://store.ohou.se/goods/999',
      name: '3인 패브릭 소파',
      brand: '한샘',
      price: 690000,
      category: 'sofa',
      dims: { w: 210, d: 95, h: 85 },
      source: 'text',
      aiConfigured: false,
    });
  });

  it('handles screenshot image uploads with clear ai_required error or AI vision extraction', async () => {
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const noAiRes = await product.fetch(request({ image: tinyPng }));
    expect(noAiRes.status).toBe(422);
    expect(await noAiRes.json()).toEqual({ error: 'ai_required', aiConfigured: false });

    const badImg = await product.fetch(request({ image: 'not-an-image' }));
    expect(badImg.status).toBe(400);

    process.env.OPENAI_API_KEY = 'test-openai-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  name: '오크 6인 식탁',
                  brand: '무인양품',
                  price: 850000,
                  category: 'table',
                  dims: { w: 180, d: 85, h: 72 },
                }),
              },
            },
          ],
        }),
      }),
    );
    const aiRes = await product.fetch(request({ image: tinyPng, url: 'https://store.ohou.se/goods/111' }));
    expect(aiRes.status).toBe(200);
    expect(await aiRes.json()).toMatchObject({
      url: 'https://store.ohou.se/goods/111',
      name: '오크 6인 식탁',
      brand: '무인양품',
      price: 850000,
      category: 'table',
      dims: { w: 180, d: 85, h: 72 },
      source: 'image+ai',
      aiConfigured: true,
    });
  });
});
