import { describe, expect, it } from 'vitest';
import { normalizeProductUrl } from '../src/lib/productImport';
import { isPublicIPv4, parseProductPage } from '../server/productPage';

describe('product page import', () => {
  it('reads a nested JSON-LD product, currency and explicit dimension units', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [
      { '@type': 'WebPage', name: 'shop' },
      { '@type': ['Thing', 'Product'], name: '테스트 &amp; 소파', brand: { name: '브랜드' },
        offers: [{ price: '123,000', priceCurrency: 'KRW' }],
        width: { value: 2100, unitCode: 'MMT' }, depth: '90 cm', height: { value: 0.8, unitText: 'm' } },
    ] })}</script>`;
    expect(parseProductPage(html, 'https://shop.example/item')).toMatchObject({
      name: '테스트 & 소파', brand: '브랜드', price: 123000, category: 'sofa', dims: { w: 210, d: 90, h: 80 },
    });
  });

  it('falls back to Open Graph metadata even when structured data is broken', () => {
    const html = `<script type='application/ld+json'>{broken}</script>
      <meta content='테스트 책상' property='og:title'>
      <meta property="product:brand" content="브랜드">
      <meta content="50000" property="product:price:amount">
      <meta content="KRW" property="product:price:currency">`;
    expect(parseProductPage(html, 'https://shop.example/item')).toMatchObject({ name: '테스트 책상', category: 'desk', price: 50000 });
  });

  it('never assumes units or converts a foreign currency to won', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Chair',
      width: 100, depth: { value: -1, unitCode: 'CMT' }, height: { value: 80, unitCode: 'CMT' },
      offers: { price: 500, priceCurrency: 'USD' },
    })}</script>`;
    const p = parseProductPage(html, 'https://shop.example/item');
    expect(p.price).toBeUndefined();
    expect(p.dims).toEqual({ w: undefined, d: undefined, h: 80 });
    expect(parseProductPage('<html></html>', p.url)).toEqual({ url: p.url });
  });

  it('normalizes links and rejects active schemes, credentials and alternate ports', () => {
    expect(normalizeProductUrl(' https://shop.example/item?q=1#detail ')).toBe('https://shop.example/item?q=1');
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:pass@shop.example', 'https://shop.example:8080']) {
      expect(() => normalizeProductUrl(url)).toThrow();
    }
  });

  it('blocks private, metadata, special-use and mapped IP addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.169.254', '100.100.100.200', '0.0.0.0', '224.0.0.1', '198.18.0.1', '::1', '::ffff:127.0.0.1']) {
      expect(isPublicIPv4(ip), ip).toBe(false);
    }
    expect(isPublicIPv4('93.184.216.34')).toBe(true);
  });
});
