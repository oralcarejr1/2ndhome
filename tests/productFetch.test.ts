import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readProductPage } from '../server/productPage';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('node:https', () => ({ request: mocks.request }));
vi.mock('node:http', () => ({ request: mocks.request }));

beforeEach(() => {
  mocks.lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  mocks.request.mockReset();
});

function serve(status: number, headers: Record<string, string>, html = '') {
  mocks.request.mockImplementationOnce((_url, options, receive) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void };
    req.destroy = (error) => { req.emit('error', error); };
    req.end = () => {
      const res = Readable.from([Buffer.from(html)]) as Readable & { statusCode: number; headers: Record<string, string> };
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
  it('pins DNS, sends no session cookies and decodes the product page', async () => {
    serve(200, { 'content-type': 'text/html; charset=utf-8' }, '<title>테스트 소파</title>');
    expect(await readProductPage('https://shop.example/item')).toMatchObject({ name: '테스트 소파', category: 'sofa' });
    expect(mocks.request.mock.calls[0][1].headers).not.toHaveProperty('cookie');
  });
  it('rejects a redirect to a private destination before making another request', async () => {
    serve(302, { location: 'http://169.254.169.254/metadata' });
    mocks.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    await expect(readProductPage('https://shop.example/item')).rejects.toThrow('public_url_required');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it('rejects non-HTML and oversized responses', async () => {
    serve(200, { 'content-type': 'application/pdf' });
    await expect(readProductPage('https://shop.example/item')).rejects.toThrow('page_unavailable');
    serve(200, { 'content-type': 'text/html' }, 'x'.repeat(2_000_001));
    await expect(readProductPage('https://shop.example/item')).rejects.toThrow('page_too_large');
  });
});
