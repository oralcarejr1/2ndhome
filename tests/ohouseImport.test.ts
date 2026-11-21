import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { parseOptionLabels, perCodeDims } from '../src/lib/productOptions';
import { classifyShape, headText } from '../src/lib/productShape';
import { MODELS } from '../src/models';
import { parseOhouseGoods } from '../server/ohouse';
import { finalizeProduct } from '../server/productFinalize';
import { cleanTitleAndBrand, extractDimensionsFromText } from '../server/productText';
import { sliceForVision } from '../server/specImages';

/** Minimal store.ohou.se page: the goods record lives in __NEXT_DATA__ like the real site. */
function ohousePage(goods: Record<string, unknown>) {
  const data = {
    props: {
      pageProps: {
        dehydratedState: {
          queries: [
            { queryKey: ['navigation'], state: { data: { storeHamburger: { categories: [{ id: 10000000, title: '가구' }] } } } },
            { queryKey: ['goods', 1], state: { data: goods } },
          ],
        },
      },
    },
  };
  return `<html><head><title>x | 오늘의집</title></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

const notice = (items: [string, string][]) => ({ items: items.map(([displayName, content]) => ({ displayName, content })) });

describe('product names', () => {
  it.each([
    ['할인가 159,900원/뮤카 회전 전신거울 수납 화장대 스툴포함', '파로마 공식스토어', '뮤카 회전 전신거울 수납 화장대 스툴포함', '파로마'],
    ['[오늘의집 단독] 플레오 템바보드 호텔식 LED 수납 침대프레임 SS/Q 4colors', '데일리리빙', '플레오 템바보드 호텔식 LED 수납 침대프레임 SS/Q', '데일리리빙'],
    ['[오늘의집 단독] 혜택가 52.7만/크루저 3인 4인용 리클라이너 쇼파', '보니애가구', '크루저 3인 4인용 리클라이너 쇼파', '보니애가구'],
    ['[오늘의집 단독] 20%쿠폰ㅣ드레스덴 호텔식 침대프레임 SS/Q', '데일리리빙', '드레스덴 호텔식 침대프레임 SS/Q', '데일리리빙'],
    ['[오늘의집 단독] 단하루 103,200원 노엘 리프트업 침대프레임 SS/Q', '크라운퍼니쳐', '노엘 리프트업 침대프레임 SS/Q', '크라운퍼니쳐'],
    ['[사은품증정] 메리 4인 가죽 소파 3colors (쿠션 증정)', '우아미가구', '메리 4인 가죽 소파', '우아미가구'],
  ])('%s', (title, brand, name, cleanBrand) => {
    expect(cleanTitleAndBrand(title, brand)).toEqual({ name, brand: cleanBrand });
  });
});

describe('furniture kind from the head noun', () => {
  it('ignores included accessories and prefers the last noun', () => {
    expect(headText('뮤카 회전 전신거울 수납 화장대 스툴포함')).toBe('뮤카 회전 전신거울 수납 화장대');
    expect(headText('코넬 코너형 컴퓨터 책상+책장')).toBe('코넬 코너형 컴퓨터 책상');
    expect(headText('메리 4인 소파 (스툴 선택)')).toBe('메리 4인 소파');
  });

  it.each([
    ['뮤카 회전 전신거울 수납 화장대 스툴포함', ['가구', '화장대·콘솔', '콘솔'], 'vanity', 'storage', { style: 'tower', stool: true, rotating: true }],
    ['토리 와이드 3단/5단 서랍장 800/1000/1200 수납장', ['가구', '서랍·수납장', '서랍장'], 'case', 'storage', { fill: 'drawers', rows: 3 }],
    ['냅타임 3단 접이식 바닥 토퍼 매트리스 MS/S/SS/Q', ['가구', '매트리스·토퍼', '토퍼'], 'bed', 'bed', { style: 'mattress', segments: 3 }],
    ['노엘 반자동 리프트업 통수납 침대프레임 SS/Q', ['가구', '침대'], 'bed', 'bed', { style: 'storage' }],
    ['로우슬립 저상형 침대프레임 MS/S/SS', [], 'bed', 'bed', { style: 'floor' }],
    ['크루저 3인 4인용 리클라이너 쇼파', ['가구', '소파', '리클라이너'], 'sofa', 'sofa', { seats: 3 }],
    ['몰리 템바보드 리프트업 테이블', ['가구', '테이블·식탁·책상', '거실·소파테이블'], 'table', 'table', { base: 'panel' }],
    ['코넬 이지 코너형 1200 컴퓨터 책상+책장', [], 'table', 'desk', {}],
    ['바른 시스템 키큰 옷장', [], 'case', 'storage', { fill: 'doors' }],
    ['원목 식탁 의자', [], 'chair', 'chair', {}],
    ['메쉬 사무용 의자', [], 'office', 'chair', {}],
  ])('%s', (name, path, model, category, params) => {
    const s = classifyShape({ name, categoryPath: path })!;
    expect(s.model).toBe(model);
    expect(s.category).toBe(category);
    expect(s.params).toMatchObject(params);
    // every parameter the importer sets must exist on the generator
    const keys = new Set(MODELS[s.model].params.map((p) => p.key));
    for (const k of Object.keys(s.params)) expect(keys.has(k), `${s.model}.${k}`).toBe(true);
  });
});

describe('sizes without units and in option names', () => {
  it('reads unit-less millimetre spec lines', () => {
    expect(extractDimensionsFromText('크기: SS : 1130*2160*1000').dims).toEqual({ w: 113, d: 216, h: 100 });
    expect(extractDimensionsFromText('크기: 4인 : W2810 * D970 * H750~910 (mm)').dims).toEqual({ w: 281, d: 97, h: 75 });
    expect(perCodeDims('SS : 1150*2230*960\nQK : 1750*2230*960')).toEqual({
      SS: { w: 115, d: 223, h: 96 },
      QK: { w: 175, d: 223, h: 96 },
    });
  });

  it('turns option labels into size options and generator params', () => {
    const chest = classifyShape({ name: '토리 3단/5단 서랍장' })!;
    expect(parseOptionLabels(['800 (3단) 화이트', '800 (3단) 블랙', '1000 (5단) 화이트'], chest)).toEqual([
      { label: '800 (3단)', dims: { w: 80 }, params: { rows: 3 } },
      { label: '1000 (5단)', dims: { w: 100 }, params: { rows: 5 } },
    ]);
    const table = classifyShape({ name: '집들이상' })!;
    expect(parseOptionLabels(['무광 화이트 1200*800', '유광 마블 1200*800', '무광 화이트 1500*800'], table).map((o) => o.dims)).toEqual([
      { w: 120, d: 80 },
      { w: 150, d: 80 },
    ]);
    const mattress = classifyShape({ name: '라텍스 매트리스' })!;
    expect(parseOptionLabels(['25cm / Q 그레이'], mattress)[0]).toMatchObject({ dims: { w: 150, d: 200, h: 25 }, estimated: ['w', 'd'] });
    const frame = classifyShape({ name: '리프트업 침대프레임' })!;
    expect(parseOptionLabels(['무헤드 리프트업 침대 SS 높이 250 (오크)', 'SS 일반헤드형 프레임(높이920)'], frame)).toEqual([
      { label: '무헤드 리프트업 침대 SS 높이 250', params: { mattressW: 110, mattressL: 200, frameH: 25, headT: 0 } },
      { label: 'SS 일반헤드형 프레임(높이920)', dims: { h: 92 }, params: { mattressW: 110, mattressL: 200, headT: 10 } },
    ]);
  });
});

describe('Ohouse goods record', () => {
  it('reads the vanity from the user report: clean name, brand, price, kind, and the spec image first', () => {
    const html = ohousePage({
      production: {
        name: '할인가 159,900원/뮤카 회전 전신거울 수납 화장대 스툴포함',
        brand: { id: 1, name: '파로마 공식스토어' },
        sellingPrice: 169900,
        informationNoticeItems: notice([
          ['품명', '파로마 뮤카 회전 전신거울 수납 화장대 스툴포함'],
          ['크기', '상세페이지 참조'],
          ['색상', '상세페이지 참조'],
        ]),
        description:
          '<img src="https://img.example/0_top/TOP_P.jpg"><img src="https://img.example/0120_img_01.jpg"><img src="https://img.example/0120_spec.jpg"><img src="https://img.example/0_delivery/notice.jpg">',
        originalImageUrl: 'https://prs.ohouse.com/a.jpg',
      },
      categories: [{ title: '가구' }, { title: '화장대·콘솔' }, { title: '콘솔' }],
      seoOptionNames: ['블랙', '화이트', '헤이즐넛'],
    });
    const r = parseOhouseGoods(html, 'https://store.ohou.se/goods/4169873')!;
    expect(r.product).toMatchObject({
      name: '뮤카 회전 전신거울 수납 화장대 스툴포함',
      brand: '파로마',
      price: 169900,
      category: 'storage',
      model: 'vanity',
      params: { style: 'tower', rotating: true, stool: true },
      dimsEstimated: ['w', 'd', 'h'],
    });
    expect(r.textDims).toBe(false);
    expect(r.specImages[0]).toBe('https://img.example/0120_spec.jpg');
  });

  it('uses the notice size text and per-size options for a bed frame', () => {
    const html = ohousePage({
      production: {
        name: '[오늘의집 단독] 플레오 템바보드 호텔식 LED 수납 침대프레임 SS/Q 4colors',
        brand: { name: '데일리리빙' },
        sellingPrice: 199000,
        informationNoticeItems: notice([['크기', 'SS : 1130*2160*1000\nQ : 1530*2160*1000\n패널조명 : 400*140*1000']]),
        description: '',
      },
      categories: [{ title: '가구' }, { title: '침대' }, { title: '침대프레임' }, { title: '수납침대' }],
      seoOptionNames: ['SS 화이트', 'Q 화이트', 'SS 블랙'],
    });
    const p = parseOhouseGoods(html, 'https://store.ohou.se/goods/3597758')!.product;
    expect(p).toMatchObject({
      name: '플레오 템바보드 호텔식 LED 수납 침대프레임 SS/Q',
      category: 'bed',
      model: 'bed',
      dims: { w: 113, d: 216, h: 100 },
      params: { style: 'storage', mattressW: 110, mattressL: 200 },
    });
    expect(p.dimsEstimated).toBeUndefined();
    expect(p.options).toEqual([
      { label: 'SS', dims: { w: 113, d: 216, h: 100 }, params: { mattressW: 110, mattressL: 200 } },
      { label: 'Q', dims: { w: 153, d: 216, h: 100 }, params: { mattressW: 150 } },
    ]);
  });

  it('ignores pages that are not Ohouse goods', () => {
    expect(parseOhouseGoods(ohousePage({ production: { name: 'x' } }), 'https://shop.example/1')).toBeUndefined();
    expect(parseOhouseGoods('<html></html>', 'https://store.ohou.se/goods/1')).toBeUndefined();
  });
});

describe('finalize', () => {
  it('fills only unstated axes and re-fits option params', () => {
    const p = finalizeProduct({
      name: '토리 와이드 서랍장',
      dims: { w: 80, d: 40, h: 76 },
      features: { drawers: 3 },
      options: [
        { label: '3단 800', dims: { w: 80, d: 40, h: 76 } },
        { label: '5단 1000', dims: { w: 100, d: 50, h: 115 } },
      ],
    });
    expect(p).toMatchObject({ model: 'case', params: { cols: 1, rows: 3 }, dims: { w: 80, d: 40, h: 76 } });
    expect(p.dimsEstimated).toBeUndefined();
    expect(p.options?.[1].params).toEqual({ cols: 2, rows: 5 });

    const partial = finalizeProduct({ name: '원목 식탁', dims: { w: 140 } });
    expect(partial.dims).toMatchObject({ w: 140, d: 80, h: 74 });
    expect(partial.dimsEstimated).toEqual(['d', 'h']);
  });
});

describe('size-chart slices for vision', () => {
  it('cuts a tall detail image and keeps the drawing band over photos', async () => {
    const W = 860;
    const photo = await sharp({ create: { width: W, height: 1200, channels: 3, background: '#8a6d55' } }).png().toBuffer();
    const lines = Array.from({ length: 12 }, (_, i) => ({
      input: { create: { width: 600, height: 3, channels: 3 as const, background: '#222' } },
      left: 130,
      top: 60 + i * 80,
    }));
    const spec = await sharp({ create: { width: W, height: 1100, channels: 3, background: '#ffffff' } }).composite(lines).png().toBuffer();
    const tall = await sharp({ create: { width: W, height: 2300, channels: 3, background: '#ffffff' } })
      .composite([{ input: photo, top: 0, left: 0 }, { input: spec, top: 1200, left: 0 }])
      .jpeg()
      .toBuffer();
    const slices = await sliceForVision([{ url: 'https://img.example/detail.jpg', body: tall }], { maxSlices: 1 });
    expect(slices).toHaveLength(1);
    const meta = await sharp(Buffer.from(slices[0].base64, 'base64')).metadata();
    expect(meta.width).toBe(W);
    expect(meta.height).toBeLessThan(1200);
    // the chosen slice is the white drawing band, not the brown photo
    const { dominant } = await sharp(Buffer.from(slices[0].base64, 'base64')).stats();
    expect(dominant.r).toBeGreaterThan(200);
  });
});
