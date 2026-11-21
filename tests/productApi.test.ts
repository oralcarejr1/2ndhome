import { beforeEach, describe, expect, it, vi } from 'vitest';
import product from '../api/product';
import { COOKIE, makeToken } from '../server/auth';
import { readProductPage } from '../server/productPage';

vi.mock('../server/productPage', () => ({ readProductPage: vi.fn() }));
let cookie: string;
beforeEach(async () => {
  process.env.APP_PASSWORD = 'product-test';
  cookie = `${COOKIE}=${await makeToken()}`;
  vi.mocked(readProductPage).mockReset();
});
const request = (body: unknown, headers: Record<string, string> = {}) => new Request('https://example.test/api/product', {
  method: 'POST', headers: { cookie, 'x-2ndhome': '1', ...headers }, body: JSON.stringify(body),
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
});
