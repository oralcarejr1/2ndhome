import { describe, expect, it } from 'vitest';
import { extractProductUrl, inferProductAttributes, normalizeProductUrl } from '../src/lib/productImport';
import { extractDimensionsFromText, isPublicIPv4, parseProductPage, parseProductText } from '../server/productPage';

describe('product page import', () => {
  it('reads a nested JSON-LD product, currency and explicit dimension units', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@graph': [
        { '@type': 'WebPage', name: 'shop' },
        {
          '@type': ['Thing', 'Product'],
          name: '테스트 &amp; 소파',
          brand: { name: '브랜드' },
          offers: [{ price: '123,000', priceCurrency: 'KRW' }],
          width: { value: 2100, unitCode: 'MMT' },
          depth: '90 cm',
          height: { value: 0.8, unitText: 'm' },
        },
      ],
    })}</script>`;
    expect(parseProductPage(html, 'https://shop.example/item')).toMatchObject({
      name: '테스트 & 소파',
      brand: '브랜드',
      price: 123000,
      category: 'sofa',
      dims: { w: 210, d: 90, h: 80 },
    });
  });

  it('falls back to Open Graph metadata even when structured data is broken', () => {
    const html = `<script type='application/ld+json'>{broken}</script>
      <meta content='테스트 책상' property='og:title'>
      <meta property="product:brand" content="브랜드">
      <meta content="50000" property="product:price:amount">
      <meta content="KRW" property="product:price:currency">`;
    expect(parseProductPage(html, 'https://shop.example/item')).toMatchObject({
      name: '테스트 책상',
      category: 'desk',
      price: 50000,
    });
  });

  it('never assumes units or converts a foreign currency to won', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'Chair',
      width: 100,
      depth: { value: -1, unitCode: 'CMT' },
      height: { value: 80, unitCode: 'CMT' },
      offers: { price: 500, priceCurrency: 'USD' },
    })}</script>`;
    const p = parseProductPage(html, 'https://shop.example/item');
    expect(p.price).toBeUndefined();
    expect(p.dims).toEqual({ w: undefined, d: undefined, h: 80 });
    expect(parseProductPage('<html></html>', p.url!)).toEqual({ url: p.url });
  });

  it('parses Ohouse Next.js __NEXT_DATA__ with 상품정보제공고시 and cleans promo tags', () => {
    const nextData = {
      props: {
        pageProps: {
          goods: {
            goodsName: '[오늘의집 단독] [한샘] 눕 데일리 아쿠아텍스 패브릭 소파 3인용',
            brandName: '한샘',
            sellingPrice: 654900,
            categories: [{ name: '가구' }, { name: '소파' }],
            productNotices: [
              { title: '크기', description: 'W2,100 x D950 x H850 mm' },
              { title: '주요 소재', description: '아쿠아텍스 패브릭, 원목' },
              { title: '색상', description: '크림 아이보리' },
            ],
          },
        },
      },
    };
    const html = `<html><head><title>오늘의집</title></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
    expect(parseProductPage(html, 'https://store.ohou.se/goods/123456')).toMatchObject({
      name: '눕 데일리 아쿠아텍스 패브릭 소파 3인용',
      brand: '한샘',
      price: 654900,
      category: 'sofa',
      model: 'sofa',
      ergo: 'sofa',
      material: 'fabric',
      color: '#efe8dc',
      dims: { w: 210, d: 95, h: 85 },
    });
  });

  it('parses IKEA-style <dl> spec rows and Korean <table> spec tables', () => {
    const ikeaHtml = `
      <meta property="og:title" content="KIVIK 쉬비크 3인용 소파 - IKEA">
      <meta property="product:brand" content="IKEA">
      <dl>
        <dt>폭</dt><dd>228 cm</dd>
        <dt>깊이</dt><dd>95 cm</dd>
        <dt>높이</dt><dd>83 cm</dd>
        <dt>시트 높이</dt><dd>45 cm</dd>
      </dl>
      <div>판매가 799,000원</div>`;
    expect(parseProductPage(ikeaHtml, 'https://www.ikea.com/kr/ko/p/kivik-12345/')).toMatchObject({
      name: 'KIVIK 쉬비크 3인용 소파',
      brand: 'IKEA',
      price: 799000,
      category: 'sofa',
      dims: { w: 228, d: 95, h: 83 },
    });

    const tableHtml = `
      <title>[데스커] 컴퓨터 데스크 1400 - 네이버 스마트스토어</title>
      <table>
        <tr><th>제품크기</th><td>가로 1400 × 세로 700 × 높이 720(mm)</td></tr>
        <tr><th>배송비</th><td>3,000원</td></tr>
      </table>
      <div>최종혜택가: 189,000원</div>`;
    expect(parseProductPage(tableHtml, 'https://smartstore.naver.com/desker/products/1')).toMatchObject({
      name: '컴퓨터 데스크 1400',
      brand: '데스커',
      price: 189000,
      category: 'desk',
      dims: { w: 140, d: 70, h: 72 },
    });
  });

  it('extracts compact Korean/English dimensions, round tables, vertical mirrors, and multi-size options', () => {
    expect(extractDimensionsFromText('규격: W1200xD600xH750mm').dims).toEqual({ w: 120, d: 60, h: 75 });
    expect(extractDimensionsFromText('원형 테이블 Ø800 × H750mm').dims).toEqual({ w: 80, d: 80, h: 75 });
    expect(extractDimensionsFromText('전신 거울 가로 60 × 세로 170cm', '전신 거울').dims).toEqual({ w: 60, h: 170 });
    expect(extractDimensionsFromText('용량 500ml, 해상도 1920x1080px').dims).toBeUndefined();

    const multi = extractDimensionsFromText(`
      단위: mm
      2인용: W1600 x D900 x H850 (650,000원)
      3인용: W2100 x D900 x H850 (890,000원)
    `);
    expect(multi.dims).toEqual({ w: 160, d: 90, h: 85 });
    expect(multi.options).toEqual([
      { label: '2인용', dims: { w: 160, d: 90, h: 85 }, price: 650000 },
      { label: '3인용', dims: { w: 210, d: 90, h: 85 }, price: 890000 },
    ]);
  });

  it('parses pasted plain webpage text without needing HTML or AI', () => {
    const pasted = `
      브랜드: 일룸
      [단독] 링키플러스 모션데스크 1200
      배송비 15,000원
      할인가 549,000원
      크기: 1200 x 600 x 720 mm
    `;
    expect(parseProductText(pasted, 'https://store.ohou.se/goods/777')).toMatchObject({
      url: 'https://store.ohou.se/goods/777',
      name: '링키플러스 모션데스크 1200',
      brand: '일룸',
      price: 549000,
      category: 'desk',
      ergo: 'standingDesk',
      dims: { w: 120, d: 60, h: 72 },
    });
  });

  it('infers categories, 3D models, mounts, and ergonomic roles accurately for compound Korean terms', () => {
    expect(inferProductAttributes('월넛 소파 테이블')).toMatchObject({
      category: 'table',
      model: 'table',
      ergo: 'coffeeTable',
      material: 'woodDark',
    });
    expect(inferProductAttributes('화이트 TV 거실장 1800')).toMatchObject({
      category: 'storage',
      model: 'case',
    });
    expect(inferProductAttributes('시디즈 사무용 의자')).toMatchObject({
      category: 'chair',
      model: 'office',
      ergo: 'officeChair',
    });
    expect(inferProductAttributes('식탁 펜던트 조명')).toMatchObject({
      category: 'lighting',
      model: 'lamp',
      mount: 'ceiling',
      ergo: 'pendant',
    });
  });

  it('normalizes links, extracts URLs from Ohouse share text, and rejects unsafe schemes', () => {
    expect(normalizeProductUrl(' https://shop.example/item?q=1#detail ')).toBe('https://shop.example/item?q=1');
    expect(extractProductUrl('[오늘의집] 한샘 소파 https://ozip.me/abc123 ')).toBe('https://ozip.me/abc123');
    expect(extractProductUrl('store.ohou.se/goods/123456')).toBe('https://store.ohou.se/goods/123456');
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:pass@shop.example', 'https://shop.example:8080']) {
      expect(() => normalizeProductUrl(url)).toThrow();
      expect(() => extractProductUrl(url)).toThrow();
    }
  });

  it('blocks private, metadata, special-use and mapped IP addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.169.254', '100.100.100.200', '0.0.0.0', '224.0.0.1', '198.18.0.1', '::1', '::ffff:127.0.0.1']) {
      expect(isPublicIPv4(ip), ip).toBe(false);
    }
    expect(isPublicIPv4('93.184.216.34')).toBe(true);
  });
});
