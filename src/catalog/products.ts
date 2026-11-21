import type { CategoryId, Clearance, ErgoRole, MatSpec, Mount, ParamValue, Product } from '../types';

// Built-in catalogue. Dimensions are W (정면 폭) × D (깊이) × H (높이) in cm.
// Real products: sizes from the manufacturers' published specs as I know them; anything I'm not
// fully sure of is flagged `approx` and shown as "근사값 — 구매 전 확인" in the UI.
// Prices are rough KRW references only and change often — always check the product page.

type Opt = Partial<Omit<Product, 'id' | 'name' | 'brand' | 'category' | 'model' | 'dims'>> & {
  p?: Record<string, ParamValue>;
  m?: Record<string, MatSpec>;
};

const M = (kind: MatSpec['kind'], color: string): MatSpec => ({ kind, color });

function P(id: string, name: string, brand: string, category: CategoryId, model: string, dims: [number, number, number], o: Opt = {}): Product {
  const { p, m, ...rest } = o;
  return { id, name, brand, category, model, dims: { w: dims[0], d: dims[1], h: dims[2] }, params: p, mats: m, ...rest };
}

const GEN = '기본형';
const IKEA = 'IKEA';

// common material sets
const OAK = M('wood', '#c9a77c');
const WALNUT = M('woodDark', '#6b4a33');
const WHITE = M('lacquer', '#f2f0eb');
const BLACK = M('metal', '#232323');
const BIRCH = M('wood', '#dcc6a0');

const clr = (front?: number, sides?: number, back?: number): Clearance => ({ front, left: sides, right: sides, back });

const BASE_PRODUCTS: Product[] = [
  // ------------------------------------------------------------ SOFA
  P('gen-sofa-1', '1인 소파', GEN, 'sofa', 'sofa', [85, 85, 80], { sub: '1인', p: { seats: 1 }, ergo: 'sofa', seatH: 43 }),
  P('gen-sofa-2', '2인 소파', GEN, 'sofa', 'sofa', [160, 88, 82], { sub: '2인', p: { seats: 2 }, ergo: 'sofa', seatH: 43 }),
  P('gen-sofa-3', '3인 소파', GEN, 'sofa', 'sofa', [200, 90, 82], { sub: '3인', p: { seats: 3 }, ergo: 'sofa', seatH: 43 }),
  P('gen-sofa-4', '4인 소파', GEN, 'sofa', 'sofa', [260, 95, 82], { sub: '4인', p: { seats: 4 }, ergo: 'sofa', seatH: 43 }),
  P('gen-sofa-chaise', '카우치 소파', GEN, 'sofa', 'sofa', [240, 160, 82], { sub: '카우치', p: { seats: 3, layout: 'chaiseR', mainD: 92 }, ergo: 'sofa', seatH: 43 }),
  P('gen-sofa-corner', '코너(L자) 소파', GEN, 'sofa', 'sofa', [270, 200, 82], { sub: '코너', p: { seats: 3, layout: 'cornerR', mainD: 92 }, ergo: 'sofa', seatH: 43 }),
  P('gen-sofa-low', '로우 소파(좌식형)', GEN, 'sofa', 'sofa', [200, 90, 60], { sub: '로우', p: { seats: 3, seatH: 30, legs: 'none', armH: 45, arm: 'round' }, ergo: 'sofa', seatH: 30 }),
  P('gen-sofabed', '소파베드(접이식)', GEN, 'sofa', 'sofa', [195, 90, 78], { sub: '소파베드', p: { seats: 3, cushion: 'bench', backCushions: false, arm: 'slim', legs: 'metal', legH: 15 }, ergo: 'sofa', seatH: 42 }),
  P('ikea-kivik-3', 'KIVIK 키비크 3인용 소파', IKEA, 'sofa', 'sofa', [228, 95, 83], {
    p: { seats: 3, arm: 'round', armW: 24, armH: 64, seatH: 45, legs: 'block', legH: 4 },
    m: { body: M('fabric', '#c8c0b2'), cushion: M('fabric', '#c8c0b2') },
    ergo: 'sofa', seatH: 45, price: 899000, flatpack: false,
  }),
  P('ikea-kivik-2', 'KIVIK 키비크 2인용 소파', IKEA, 'sofa', 'sofa', [190, 95, 83], {
    p: { seats: 2, arm: 'round', armW: 24, armH: 64, seatH: 45, legs: 'block', legH: 4 },
    m: { body: M('fabric', '#8d969a'), cushion: M('fabric', '#8d969a') }, ergo: 'sofa', seatH: 45, price: 699000,
  }),
  P('ikea-soderhamn-3', 'SÖDERHAMN 쇠데르함 3인용 소파', IKEA, 'sofa', 'sofa', [198, 99, 83], {
    p: { seats: 3, arm: 'slim', armW: 8, armH: 60, seatH: 40, legs: 'plinth', backCushions: true, cushion: 'bench' },
    m: { body: M('fabric', '#ddd6c9'), cushion: M('fabric', '#ddd6c9') }, ergo: 'sofa', seatH: 40, approx: true, price: 899000,
  }),
  P('ikea-ektorp-3', 'EKTORP 엑토르프 3인용 소파', IKEA, 'sofa', 'sofa', [218, 88, 88], {
    p: { seats: 3, arm: 'rolled', armW: 18, armH: 65, seatH: 45, legs: 'none' },
    m: { body: M('fabric', '#ebe7df'), cushion: M('fabric', '#ebe7df') }, ergo: 'sofa', seatH: 45, approx: true, price: 699000,
  }),
  P('ikea-friheten', 'FRIHETEN 프리헤텐 코너소파베드(수납)', IKEA, 'sofa', 'sofa', [230, 151, 66], {
    p: { seats: 3, layout: 'chaiseR', mainD: 88, arm: 'slim', armW: 10, armH: 55, seatH: 45, cushion: 'tight', legs: 'none', backCushions: true },
    m: { body: M('fabric', '#55585c'), cushion: M('fabric', '#55585c') }, ergo: 'sofa', seatH: 45, approx: true, price: 799000,
  }),
  P('ikea-glostad-2', 'GLOSTAD 글로스타드 2인용 소파', IKEA, 'sofa', 'sofa', [177, 85, 68], {
    p: { seats: 2, arm: 'track', armW: 13, armH: 55, seatH: 43, cushion: 'tight', backCushions: false, legs: 'metal', legH: 8 },
    m: { body: M('fabric', '#5d646b') }, ergo: 'sofa', seatH: 43, approx: true, price: 199000,
  }),
  P('ikea-klippan-2', 'KLIPPAN 클리판 2인용 소파', IKEA, 'sofa', 'sofa', [180, 88, 66], {
    p: { seats: 2, arm: 'round', armW: 17, armH: 56, seatH: 40, cushion: 'tight', backCushions: false, legs: 'block', legH: 5 },
    m: { body: M('fabric', '#ece9e2') }, ergo: 'sofa', seatH: 40, approx: true, price: 299000,
  }),
  P('ikea-landskrona-3', 'LANDSKRONA 란스크로나 3인용 소파', IKEA, 'sofa', 'sofa', [204, 89, 78], {
    p: { seats: 3, arm: 'track', armW: 14, armH: 61, seatH: 45, legs: 'metal', legH: 15, backCushions: true },
    m: { body: M('leather', '#7a5a3f'), cushion: M('leather', '#7a5a3f'), legs: M('metal', '#2a2a2a') }, ergo: 'sofa', seatH: 45, approx: true,
  }),
  P('ikea-vimle-3', 'VIMLE 빔레 3인용 소파', IKEA, 'sofa', 'sofa', [241, 98, 83], {
    p: { seats: 3, arm: 'track', armW: 15, armH: 66, seatH: 45, legs: 'block', legH: 3 },
    m: { body: M('fabric', '#9aa08f'), cushion: M('fabric', '#9aa08f') }, ergo: 'sofa', seatH: 45, approx: true,
  }),
  P('roset-togo-3', 'Togo 토고 3인용', 'Ligne Roset', 'sofa', 'sofa', [174, 102, 70], {
    p: { seats: 3, arm: 'none', seatH: 38, legs: 'none', cushion: 'bench', backCushions: false, backT: 34 },
    m: { body: M('velvet', '#b9876b'), cushion: M('velvet', '#b9876b') }, ergo: 'sofa', seatH: 38, approx: true,
  }),

  // ------------------------------------------------------------ CHAIRS & LOUNGE
  P('gen-dining-chair', '원목 식탁의자', GEN, 'chair', 'chair', [45, 50, 80], { sub: '식탁의자', p: { style: 'dining', seatH: 45 }, ergo: 'chair', seatH: 45 }),
  P('gen-dining-chair-up', '패브릭 식탁의자', GEN, 'chair', 'chair', [48, 55, 85], { sub: '식탁의자', p: { style: 'upholstered', seatH: 46, legs: 'four' }, m: { seat: M('boucle', '#ece6da'), frame: WALNUT }, ergo: 'chair', seatH: 46 }),
  P('gen-stool', '원형 스툴', GEN, 'chair', 'chair', [35, 35, 45], { sub: '스툴', p: { style: 'stool', seatH: 45 }, ergo: 'chair', seatH: 45 }),
  P('gen-barstool', '바 스툴', GEN, 'chair', 'chair', [40, 40, 75], { sub: '바 스툴', p: { style: 'barstool', seatH: 75 }, m: { frame: BLACK, seat: OAK }, ergo: 'chair', seatH: 75 }),
  P('gen-office', '사무용 의자', GEN, 'chair', 'office', [65, 65, 110], { sub: '사무용', p: { seatH: 47 }, ergo: 'officeChair', seatH: 47, adjust: [42, 54] }),
  P('gen-floorchair', '좌식의자', GEN, 'chair', 'lounge', [45, 55, 45], { sub: '좌식', p: { style: 'floor' }, m: { cushion: M('fabric', '#b9a98f') }, seatH: 8 }),
  P('gen-beanbag', '빈백', GEN, 'chair', 'lounge', [80, 80, 75], { sub: '빈백', p: { style: 'beanbag' }, m: { cushion: M('boucle', '#e7e1d6') }, seatH: 30 }),
  P('gen-bench', '원목 벤치', GEN, 'chair', 'bench', [120, 35, 45], { sub: '벤치', ergo: 'chair', seatH: 45 }),
  P('gen-ottoman', '오토만/스툴', GEN, 'chair', 'bench', [60, 45, 42], { sub: '오토만', p: { style: 'ottoman' }, m: { top: M('fabric', '#c2b49f') }, seatH: 42 }),
  P('gen-pouf', '푸프', GEN, 'chair', 'bench', [45, 45, 40], { sub: '푸프', p: { style: 'pouf' }, m: { top: M('boucle', '#e9e2d4') }, seatH: 40 }),
  P('ikea-poang', 'POÄNG 포엥 암체어', IKEA, 'chair', 'lounge', [68, 82, 100], { p: { style: 'bentwood', seatH: 42 }, m: { frame: BIRCH, cushion: M('fabric', '#e9e1d0') }, seatH: 42, price: 149000 }),
  P('ikea-strandmon', 'STRANDMON 스트란드몬 윙체어', IKEA, 'chair', 'lounge', [82, 96, 101], { p: { style: 'wingback', seatH: 45 }, m: { frame: M('fabric', '#59605a'), cushion: M('fabric', '#59605a'), legs: M('woodDark', '#4a3527') }, seatH: 45, approx: true, price: 349000 }),
  P('ikea-adde', 'ADDE 아데 의자', IKEA, 'chair', 'chair', [39, 47, 77], { p: { style: 'shell', seatH: 45, legs: 'metal' }, m: { seat: M('plastic', '#f5f5f2'), frame: M('chrome', '#cfd2d4') }, ergo: 'chair', seatH: 45, approx: true, price: 19900 }),
  P('ikea-stefan', 'STEFAN 스테판 의자', IKEA, 'chair', 'chair', [42, 49, 90], { p: { style: 'ladder', seatH: 45 }, m: { frame: M('lacquer', '#3a2f28'), seat: M('lacquer', '#3a2f28') }, ergo: 'chair', seatH: 45, approx: true }),
  P('ikea-teodores', 'TEODORES 테오도레스 의자', IKEA, 'chair', 'chair', [42, 54, 80], { p: { style: 'shell', seatH: 46, legs: 'four' }, m: { seat: WHITE, frame: WHITE }, ergo: 'chair', seatH: 46, approx: true }),
  P('ikea-nisse', 'NISSE 니세 접이식 의자', IKEA, 'chair', 'chair', [45, 47, 76], { p: { style: 'folding', seatH: 45, legs: 'metal' }, m: { seat: M('plastic', '#f0efe9'), frame: M('chrome', '#cfd2d4') }, ergo: 'chair', seatH: 45, approx: true }),
  P('ikea-markus', 'MARKUS 마르쿠스 사무용 의자', IKEA, 'chair', 'office', [62, 60, 135], { p: { seatH: 50, headrest: true }, ergo: 'officeChair', seatH: 50, adjust: [46, 57], approx: true, price: 199000 }),
  P('vitra-dsw', 'Eames Plastic Side Chair DSW', 'Vitra', 'chair', 'chair', [46.5, 55, 83], { p: { style: 'shell', seatH: 43, legs: 'eiffel' }, m: { seat: M('plastic', '#f3f1ea'), frame: OAK }, ergo: 'chair', seatH: 43 }),
  P('ch24', 'CH24 위시본 체어', 'Carl Hansen & Søn', 'chair', 'chair', [55, 51, 76], { p: { style: 'wishbone', seatH: 45 }, m: { frame: M('wood', '#d6b98c'), seat: M('rattan', '#d9c59c') }, ergo: 'chair', seatH: 45 }),
  P('fh-series7', '세븐 체어 3107', 'Fritz Hansen', 'chair', 'chair', [50, 52, 78], { p: { style: 'shell', seatH: 44, legs: 'metal' }, m: { seat: M('wood', '#e1cba6'), frame: M('chrome', '#cfd2d4') }, ergo: 'chair', seatH: 44, approx: true }),
  P('hm-aeron-b', '에어론 체어 (B 사이즈)', 'Herman Miller', 'chair', 'office', [69, 66, 109], { p: { seatH: 47, arms: true }, m: { back: M('fabric', '#2a2b2d'), seat: M('fabric', '#2a2b2d'), frame: M('metal', '#2b2b2b') }, ergo: 'officeChair', seatH: 47, adjust: [41, 53], approx: true }),
  P('fh-egg', '에그 체어', 'Fritz Hansen', 'chair', 'lounge', [86, 79, 107], { p: { style: 'egg', seatH: 37 }, m: { frame: M('fabric', '#b5483a'), cushion: M('fabric', '#b5483a'), legs: M('chrome', '#cfd2d4') }, seatH: 37, approx: true }),
  P('roset-togo-1', 'Togo 토고 1인(파이어사이드)', 'Ligne Roset', 'chair', 'lounge', [87, 102, 70], { p: { style: 'togo', seatH: 38 }, m: { cushion: M('velvet', '#b9876b') }, seatH: 38, approx: true }),
  P('eames-lounge', 'Eames Lounge Chair', 'Herman Miller / Vitra', 'chair', 'lounge', [84, 85, 89], { p: { style: 'shell', seatH: 38 }, m: { frame: WALNUT, cushion: M('leather', '#1e1b19'), legs: M('metal', '#222222') }, seatH: 38, approx: true }),
  P('muji-bodyfit', '체형 맞춤 소파(빈백)', '무인양품', 'chair', 'lounge', [65, 65, 43], { p: { style: 'beanbag' }, m: { cushion: M('fabric', '#cfc6b6') }, seatH: 25, approx: true }),

  // ------------------------------------------------------------ TABLES
  P('gen-table-2', '2인 식탁', GEN, 'table', 'table', [75, 75, 74], { sub: '식탁', ergo: 'diningTable', clearance: { front: 75, back: 75 } }),
  P('gen-table-4', '4인 식탁', GEN, 'table', 'table', [120, 75, 74], { sub: '식탁', ergo: 'diningTable', clearance: { front: 75, back: 75 } }),
  P('gen-table-4w', '4인 식탁(넓은)', GEN, 'table', 'table', [150, 75, 74], { sub: '식탁', ergo: 'diningTable', clearance: { front: 75, back: 75 } }),
  P('gen-table-6', '6인 식탁', GEN, 'table', 'table', [180, 90, 74], { sub: '식탁', p: { base: 'trestle' }, ergo: 'diningTable', clearance: { front: 75, back: 75 } }),
  P('gen-table-round', '원형 식탁 Ø90', GEN, 'table', 'table', [90, 90, 74], { sub: '식탁', p: { shape: 'round', base: 'pedestal' }, ergo: 'diningTable', clearance: { front: 70, back: 70, left: 70, right: 70 } }),
  P('gen-table-oval', '타원 식탁', GEN, 'table', 'table', [160, 90, 74], { sub: '식탁', p: { shape: 'oval', base: 'pedestal' }, m: { top: WALNUT, legs: WALNUT }, ergo: 'diningTable' }),
  P('gen-table-pill', '라운드 사각 식탁', GEN, 'table', 'table', [180, 85, 74], { sub: '식탁', p: { shape: 'pill', base: 'panel' }, ergo: 'diningTable' }),
  P('gen-coffee', '커피테이블', GEN, 'table', 'table', [100, 50, 40], { sub: '커피테이블', p: { shelf: true, legS: 4 }, ergo: 'coffeeTable' }),
  P('gen-coffee-round', '원형 커피테이블', GEN, 'table', 'table', [80, 80, 38], { sub: '커피테이블', p: { shape: 'round', base: 'cross' }, ergo: 'coffeeTable' }),
  P('gen-side', '사이드테이블', GEN, 'table', 'table', [45, 45, 55], { sub: '사이드', p: { shape: 'round', base: 'pedestal', topT: 2 }, m: { top: WHITE, legs: WHITE } }),
  P('gen-console', '콘솔', GEN, 'table', 'table', [120, 35, 80], { sub: '콘솔', p: { legStyle: 'metal', apron: true }, m: { legs: BLACK } }),
  P('gen-lowtable', '좌식 테이블', GEN, 'table', 'table', [80, 60, 35], { sub: '좌식', p: { legStyle: 'tapered' }, ergo: 'lowTable' }),
  P('gen-vanity', '화장대', GEN, 'table', 'table', [80, 40, 75], { sub: '화장대', p: { drawers: 'one', apron: true }, m: { top: WHITE, legs: WHITE }, ergo: 'desk' }),
  P('ikea-lack-coffee', 'LACK 라크 커피테이블', IKEA, 'table', 'table', [90, 55, 45], { p: { topT: 5, legS: 5, inset: 0, shelf: true, legStyle: 'square' }, m: { top: WHITE, legs: WHITE }, ergo: 'coffeeTable', price: 39900 }),
  P('ikea-lack-side', 'LACK 라크 보조테이블', IKEA, 'table', 'table', [55, 55, 45], { p: { topT: 5, legS: 5, inset: 0 }, m: { top: M('lacquer', '#262626'), legs: M('lacquer', '#262626') }, price: 12900 }),
  P('ikea-listerby', 'LISTERBY 리스테르뷔 커피테이블', IKEA, 'table', 'table', [140, 60, 45], { p: { legStyle: 'tapered', inset: 6 }, m: { top: M('woodDark', '#8a6a4a'), legs: M('woodDark', '#8a6a4a') }, ergo: 'coffeeTable', approx: true }),
  P('ikea-gladom', 'GLADOM 글라돔 트레이테이블', IKEA, 'table', 'table', [45, 45, 53], { p: { shape: 'round', base: 'cross', legS: 2 }, m: { top: M('metal', '#2b2b2b'), legs: M('metal', '#2b2b2b') }, approx: true }),
  P('ikea-melltorp', 'MELLTORP 멜토르프 식탁', IKEA, 'table', 'table', [125, 75, 74], { p: { legStyle: 'metal', legS: 4, inset: 3 }, m: { top: WHITE, legs: WHITE }, ergo: 'diningTable', clearance: { front: 75, back: 75 }, price: 79900 }),
  P('ikea-lisabo', 'LISABO 리사보 식탁', IKEA, 'table', 'table', [140, 78, 74], { p: { legStyle: 'tapered', apron: true }, m: { top: M('wood', '#d6bd94'), legs: M('wood', '#d6bd94') }, ergo: 'diningTable', clearance: { front: 75, back: 75 }, approx: true }),
  P('ikea-ekedalen', 'EKEDALEN 에케달렌 확장형 식탁', IKEA, 'table', 'table', [120, 80, 75], { p: { legStyle: 'square', apron: true }, m: { top: M('woodDark', '#5a4232'), legs: M('woodDark', '#5a4232') }, ergo: 'diningTable', notes: '확장 시 가로 180cm', approx: true }),
  P('ikea-norden', 'NORDEN 노르덴 게이트렉 테이블', IKEA, 'table', 'table', [89, 80, 74], { p: { base: 'gateleg' }, m: { top: BIRCH, legs: BIRCH }, ergo: 'diningTable', notes: '날개 접으면 26cm, 한쪽 89cm, 모두 펴면 152cm', approx: true }),
  P('ikea-docksta', 'DOCKSTA 독스타 원형 식탁', IKEA, 'table', 'table', [103, 103, 75], { p: { shape: 'round', base: 'tulip' }, m: { top: WHITE, legs: WHITE }, ergo: 'diningTable', approx: true }),
  P('ikea-morbylanga', 'MÖRBYLÅNGA 뫼르뷜롱가 식탁', IKEA, 'table', 'table', [220, 100, 74], { p: { legStyle: 'tapered', inset: 10, legS: 7 }, m: { top: M('woodDark', '#7a5638'), legs: M('woodDark', '#7a5638') }, ergo: 'diningTable', approx: true }),

  // ------------------------------------------------------------ DESKS
  P('gen-desk-120', '책상 120', GEN, 'desk', 'table', [120, 60, 72], { sub: '책상', p: { legStyle: 'metal', legS: 4 }, m: { legs: BLACK }, ergo: 'desk', clearance: { front: 90 } }),
  P('gen-desk-140', '책상 140', GEN, 'desk', 'table', [140, 70, 72], { sub: '책상', p: { base: 'tframe' }, m: { legs: BLACK }, ergo: 'desk', clearance: { front: 90 } }),
  P('gen-desk-drawer', '서랍 책상', GEN, 'desk', 'table', [140, 70, 73], { sub: '책상', p: { drawers: 'right', legStyle: 'square' }, m: { top: OAK, legs: WHITE }, ergo: 'desk', clearance: { front: 90 } }),
  P('gen-motion', '모션데스크(높이조절)', GEN, 'desk', 'table', [140, 70, 73], { sub: '모션데스크', p: { base: 'standing', curH: 73 }, m: { legs: M('metal', '#e9e9e7') }, ergo: 'standingDesk', adjust: [65, 125], clearance: { front: 90 } }),
  P('ikea-micke', 'MICKE 미케 책상', IKEA, 'desk', 'table', [105, 50, 75], { p: { drawers: 'right', base: 'panel' }, m: { top: WHITE, legs: WHITE }, ergo: 'desk', clearance: { front: 90 }, price: 79900 }),
  P('ikea-lagkapten-alex', 'LAGKAPTEN/ALEX 라그캅텐/알렉스 책상', IKEA, 'desk', 'table', [140, 60, 73], { p: { drawers: 'both', topT: 3.4 }, m: { top: WHITE, legs: WHITE }, ergo: 'desk', clearance: { front: 90 }, price: 189000 }),
  P('ikea-linnmon-adils', 'LINNMON/ADILS 린몬/아딜스 테이블', IKEA, 'desk', 'table', [100, 60, 74], { p: { legStyle: 'round', legS: 3.5, inset: 2, topT: 3.4 }, m: { top: WHITE, legs: WHITE }, ergo: 'desk', clearance: { front: 90 }, approx: true }),
  P('ikea-idasen', 'IDÅSEN 이도센 높이조절 책상', IKEA, 'desk', 'table', [160, 80, 63], { p: { base: 'standing', curH: 73 }, m: { top: M('lacquer', '#2e2e2e'), legs: M('metal', '#2e2e2e') }, ergo: 'standingDesk', adjust: [63, 127], clearance: { front: 90 }, approx: true }),
  P('ikea-trotten', 'TROTTEN 트로텐 높이조절 책상', IKEA, 'desk', 'table', [160, 80, 72], { p: { base: 'standing', curH: 72 }, m: { top: WHITE, legs: M('metal', '#5f6b5a') }, ergo: 'standingDesk', adjust: [72, 122], clearance: { front: 90 }, approx: true }),

  // ------------------------------------------------------------ BEDS
  P('gen-bed-s', '싱글 침대 (매트 100×200)', GEN, 'bed', 'bed', [106, 209, 85], { sub: '싱글', p: { mattressW: 100 }, ergo: 'bed' }),
  P('gen-bed-ss', '슈퍼싱글 침대 (매트 110×200)', GEN, 'bed', 'bed', [116, 209, 85], { sub: '슈퍼싱글', p: { mattressW: 110 }, ergo: 'bed' }),
  P('gen-bed-q', '퀸 침대 (매트 150×200)', GEN, 'bed', 'bed', [158, 210, 90], { sub: '퀸', p: { mattressW: 150 }, ergo: 'bed' }),
  P('gen-bed-k', '킹 침대 (매트 160×200)', GEN, 'bed', 'bed', [168, 210, 90], { sub: '킹', p: { mattressW: 160 }, ergo: 'bed' }),
  P('gen-bed-q-up', '퀸 패브릭 침대', GEN, 'bed', 'bed', [165, 215, 110], { sub: '퀸', p: { style: 'upholstered', mattressW: 150, headT: 10, tufted: true, legs: 'none', legH: 3 }, m: { headboard: M('boucle', '#e8e0d3') }, ergo: 'bed' }),
  P('gen-bed-q-storage', '퀸 수납 침대', GEN, 'bed', 'bed', [158, 210, 95], { sub: '퀸', p: { style: 'storage', mattressW: 150, frameH: 35 }, m: { frame: WHITE, headboard: WHITE, legs: WHITE }, ergo: 'bed' }),
  P('gen-bed-q-low', '퀸 저상형 침대', GEN, 'bed', 'bed', [160, 210, 75], { sub: '퀸', p: { style: 'floor', mattressW: 150, frameH: 10, headT: 6 }, m: { frame: OAK }, ergo: 'bed' }),
  P('gen-mattress-q', '퀸 매트리스만 (바닥)', GEN, 'bed', 'bed', [150, 200, 25], { sub: '매트리스', p: { style: 'floor', mattressW: 150, mattressL: 200, frameH: 0, headT: 0 }, ergo: 'bed' }),
  P('ikea-malm-q', 'MALM 말름 침대(높은형) 150×200', IKEA, 'bed', 'bed', [166, 209, 100], { p: { style: 'platform', mattressW: 150, frameH: 25, headT: 6, legH: 3, footH: 38 }, m: { frame: WHITE, headboard: WHITE, legs: WHITE }, ergo: 'bed', approx: true }),
  P('ikea-tarva-q', 'TARVA 타르바 침대 150×200', IKEA, 'bed', 'bed', [158, 209, 92], { p: { style: 'platform', mattressW: 150, frameH: 30, headT: 4, footH: 50, legH: 10 }, m: { frame: M('wood', '#e4cfa7'), headboard: M('wood', '#e4cfa7') }, ergo: 'bed', approx: true }),
  P('ikea-slattum-q', 'SLATTUM 슬라툼 패브릭 침대 150×200', IKEA, 'bed', 'bed', [156, 206, 85], { p: { style: 'upholstered', mattressW: 150, frameH: 26, headT: 6, legH: 6 }, m: { headboard: M('fabric', '#cfc8bb'), frame: M('fabric', '#cfc8bb') }, ergo: 'bed', approx: true }),
  P('ikea-kura', 'KURA 쿠라 양면 침대', IKEA, 'bed', 'bed', [99, 209, 116], { p: { style: 'platform', mattressW: 90, frameH: 15, headT: 4, footH: 116 }, m: { frame: WHITE }, ergo: 'bed', approx: true }),

  // ------------------------------------------------------------ STORAGE
  P('gen-wardrobe-100', '옷장 100', GEN, 'storage', 'case', [100, 60, 200], { sub: '옷장', p: { cols: 2, rows: 1, fill: 'doors', handle: 'long' }, ergo: 'wardrobe', clearance: { front: 55 } }),
  P('gen-wardrobe-200', '옷장 200 (4도어)', GEN, 'storage', 'case', [200, 60, 220], { sub: '옷장', p: { cols: 4, rows: 1, fill: 'doors', handle: 'long' }, ergo: 'wardrobe', clearance: { front: 55 } }),
  P('gen-wardrobe-slide', '슬라이딩 옷장 180', GEN, 'storage', 'case', [180, 62, 210], { sub: '옷장', p: { cols: 2, rows: 1, fill: 'sliding' }, ergo: 'wardrobe', clearance: { front: 40 } }),
  P('gen-dresser', '서랍장 4단', GEN, 'storage', 'case', [80, 45, 90], { sub: '서랍장', p: { cols: 1, rows: 4, fill: 'drawers', base: 'legs', legH: 10 }, m: { body: OAK, front: OAK, legs: OAK }, clearance: { front: 70 } }),
  P('gen-dresser-wide', '와이드 서랍장 6칸', GEN, 'storage', 'case', [120, 45, 75], { sub: '서랍장', p: { cols: 2, rows: 3, fill: 'drawers' }, clearance: { front: 70 } }),
  P('gen-nightstand', '협탁', GEN, 'storage', 'case', [45, 40, 50], { sub: '협탁', p: { cols: 1, rows: 2, fill: 'drawers', base: 'legs', legH: 12 }, m: { body: OAK, front: OAK, legs: OAK } }),
  P('gen-tvstand', 'TV장 150', GEN, 'storage', 'case', [150, 40, 45], { sub: 'TV장', p: { cols: 3, rows: 1, fill: 'tvbench', base: 'legs', legH: 12, handle: 'cutout' }, m: { body: WALNUT, front: WALNUT, legs: WALNUT } }),
  P('gen-sideboard', '사이드보드 160', GEN, 'storage', 'case', [160, 45, 75], { sub: '사이드보드', p: { cols: 4, rows: 1, fill: 'doors', base: 'legs', legH: 15, handle: 'knob' }, m: { body: OAK, front: OAK, legs: OAK } }),
  P('gen-bookcase', '책장 80', GEN, 'storage', 'case', [80, 30, 180], { sub: '책장', p: { cols: 1, rows: 5, fill: 'open', base: 'plinth' }, ergo: 'tallStorage' }),
  P('gen-shoes', '신발장', GEN, 'storage', 'case', [80, 35, 120], { sub: '신발장', p: { cols: 2, rows: 1, fill: 'doors' }, clearance: { front: 50 } }),
  P('gen-cabinet-glass', '유리 장식장', GEN, 'storage', 'case', [80, 40, 160], { sub: '장식장', p: { cols: 2, rows: 4, fill: 'glass', base: 'legs', legH: 15 }, m: { body: WALNUT, front: WALNUT, legs: WALNUT }, ergo: 'tallStorage' }),
  P('ikea-billy-80', 'BILLY 빌리 책장 80', IKEA, 'storage', 'case', [80, 28, 202], { p: { cols: 1, rows: 6, fill: 'open', base: 'plinth' }, ergo: 'tallStorage', flatpack: true, price: 59900 }),
  P('ikea-billy-40', 'BILLY 빌리 책장 40', IKEA, 'storage', 'case', [40, 28, 202], { p: { cols: 1, rows: 6, fill: 'open', base: 'plinth' }, ergo: 'tallStorage', flatpack: true, price: 44900 }),
  P('ikea-billy-80-low', 'BILLY 빌리 책장 80 (낮은형)', IKEA, 'storage', 'case', [80, 28, 106], { p: { cols: 1, rows: 3, fill: 'open', base: 'plinth' }, flatpack: true }),
  P('ikea-kallax-2x4', 'KALLAX 칼락스 2×4', IKEA, 'storage', 'case', [77, 39, 147], { p: { cols: 2, rows: 4, fill: 'cubes', base: 'none' }, flatpack: true, price: 79900 }),
  P('ikea-kallax-4x4', 'KALLAX 칼락스 4×4', IKEA, 'storage', 'case', [147, 39, 147], { p: { cols: 4, rows: 4, fill: 'cubes', base: 'none' }, flatpack: true, price: 139000 }),
  P('ikea-kallax-2x2', 'KALLAX 칼락스 2×2', IKEA, 'storage', 'case', [77, 39, 77], { p: { cols: 2, rows: 2, fill: 'cubes', base: 'none' }, flatpack: true, price: 39900 }),
  P('ikea-kallax-1x4', 'KALLAX 칼락스 1×4', IKEA, 'storage', 'case', [42, 39, 147], { p: { cols: 1, rows: 4, fill: 'cubes', base: 'none' }, flatpack: true }),
  P('ikea-malm-6', 'MALM 말름 6칸 서랍장', IKEA, 'storage', 'case', [160, 48, 78], { p: { cols: 2, rows: 3, fill: 'drawers', base: 'none', handle: 'none' }, clearance: { front: 75 }, flatpack: true, price: 249000 }),
  P('ikea-malm-3', 'MALM 말름 3칸 서랍장', IKEA, 'storage', 'case', [80, 48, 78], { p: { cols: 1, rows: 3, fill: 'drawers', base: 'none', handle: 'none' }, clearance: { front: 75 }, flatpack: true, price: 129000 }),
  P('ikea-malm-4', 'MALM 말름 4칸 서랍장', IKEA, 'storage', 'case', [80, 48, 100], { p: { cols: 1, rows: 4, fill: 'drawers', base: 'none', handle: 'none' }, clearance: { front: 75 }, flatpack: true, price: 159000 }),
  P('ikea-hemnes-8', 'HEMNES 헴네스 8칸 서랍장', IKEA, 'storage', 'case', [160, 50, 96], { p: { cols: 2, rows: 4, fill: 'drawers', base: 'plinth', handle: 'knob' }, clearance: { front: 75 }, flatpack: true, approx: true }),
  P('ikea-alex', 'ALEX 알렉스 서랍 유닛', IKEA, 'storage', 'case', [36, 58, 70], { p: { cols: 1, rows: 5, fill: 'drawers', base: 'none', handle: 'cutout' }, clearance: { front: 70 }, flatpack: true, price: 99900 }),
  P('ikea-pax-100-236', 'PAX 팍스 옷장 100×60×236', IKEA, 'storage', 'case', [100, 60, 236], { p: { cols: 2, rows: 1, fill: 'doors', base: 'none', handle: 'bar' }, ergo: 'wardrobe', clearance: { front: 55 }, flatpack: true, notes: '프레임 깊이 58 + 도어', approx: true }),
  P('ikea-pax-100-201', 'PAX 팍스 옷장 100×60×201', IKEA, 'storage', 'case', [100, 60, 201], { p: { cols: 2, rows: 1, fill: 'doors', base: 'none', handle: 'bar' }, ergo: 'wardrobe', clearance: { front: 55 }, flatpack: true, approx: true }),
  P('ikea-kleppstad', 'KLEPPSTAD 클렙스타드 옷장(3도어)', IKEA, 'storage', 'case', [117, 55, 176], { p: { cols: 3, rows: 1, fill: 'doors', base: 'none', handle: 'bar' }, ergo: 'wardrobe', clearance: { front: 45 }, flatpack: true, approx: true, price: 189000 }),
  P('ikea-brimnes-tv', 'BRIMNES 브림네스 TV장', IKEA, 'storage', 'case', [180, 41, 53], { p: { cols: 3, rows: 1, fill: 'tvbench', base: 'none', handle: 'none' }, m: { body: WHITE, front: WHITE }, flatpack: true, approx: true }),
  P('ikea-besta-tv', 'BESTÅ 베스토 TV장 180', IKEA, 'storage', 'case', [180, 42, 38], { p: { cols: 3, rows: 1, fill: 'drawers', base: 'legs', legH: 6, handle: 'none' }, m: { body: M('woodDark', '#3b2e26'), front: M('woodDark', '#3b2e26') }, flatpack: true, approx: true }),
  P('ikea-stall', 'STÄLL 스텔 신발장', IKEA, 'storage', 'case', [79, 29, 148], { p: { cols: 1, rows: 3, fill: 'drawers', base: 'none', handle: 'knob' }, m: { body: WHITE, front: WHITE }, flatpack: true, approx: true }),
  P('ikea-vittsjo-51', 'VITTSJÖ 비트셰 선반유닛 51', IKEA, 'shelf', 'shelf', [51, 36, 175], { p: { style: 'wire', shelves: 5 }, m: { frame: BLACK, board: M('glass', '#dfe9ec') }, flatpack: true, approx: true }),
  P('ikea-ivar-89', 'IVAR 이바르 선반 1섹션', IKEA, 'shelf', 'shelf', [89, 30, 179], { p: { style: 'posts', shelves: 5 }, m: { frame: M('wood', '#e3cba3'), board: M('wood', '#e3cba3') }, ergo: 'tallStorage', flatpack: true, approx: true }),
  P('ikea-omar', 'OMAR 오마르 선반유닛', IKEA, 'shelf', 'shelf', [92, 36, 181], { p: { style: 'wire', shelves: 5 }, m: { frame: M('chrome', '#cfd2d4') }, ergo: 'tallStorage', flatpack: true, approx: true }),
  P('ikea-raskog', 'RÅSKOG 로스코그 카트', IKEA, 'shelf', 'shelf', [35, 45, 78], { p: { style: 'wire', shelves: 3, books: false }, m: { frame: M('lacquer', '#5f7f7a') }, flatpack: true, price: 39900 }),
  P('muji-stack-2', '스태킹 선반 오크 2단', '무인양품', 'storage', 'case', [82, 28.5, 81.5], { p: { cols: 2, rows: 2, fill: 'open', base: 'none', frameT: 2.5 }, m: { body: M('wood', '#d6b98e') }, flatpack: true, approx: true }),
  P('muji-stack-3', '스태킹 선반 오크 3단', '무인양품', 'storage', 'case', [82, 28.5, 121], { p: { cols: 2, rows: 3, fill: 'open', base: 'none', frameT: 2.5 }, m: { body: M('wood', '#d6b98e') }, flatpack: true, approx: true }),
  P('muji-stack-5', '스태킹 선반 오크 5단', '무인양품', 'storage', 'case', [82, 28.5, 200], { p: { cols: 2, rows: 5, fill: 'open', base: 'none', frameT: 2.5 }, m: { body: M('wood', '#d6b98e') }, ergo: 'tallStorage', flatpack: true, approx: true }),
  P('usm-haller-2x2', 'USM Haller 사이드보드 2×2', 'USM', 'storage', 'case', [153, 37, 74], { p: { cols: 2, rows: 2, fill: 'doors', base: 'legs', legH: 4, legStyle: 'metal', handle: 'cutout', frameT: 1.2 }, m: { body: M('lacquer', '#d9d9d6'), front: M('lacquer', '#d9d9d6'), legs: M('chrome', '#cfd2d4') }, approx: true }),

  // ------------------------------------------------------------ SHELVES / RACKS
  P('gen-rack', '행거 120', GEN, 'shelf', 'rack', [120, 45, 170], { sub: '행거', ergo: 'wardrobe', clearance: { front: 50 } }),
  P('gen-rack-2', '2단 행거 + 선반', GEN, 'shelf', 'rack', [120, 45, 180], { sub: '행거', p: { style: 'double' }, ergo: 'wardrobe', clearance: { front: 50 } }),
  P('ikea-mulig', 'MULIG 물리그 행거', IKEA, 'shelf', 'rack', [99, 46, 151], { p: { style: 'shelf' }, m: { frame: WHITE }, ergo: 'wardrobe', flatpack: true, approx: true, price: 14900 }),
  P('gen-wire-rack', '스틸 와이어 랙 5단', GEN, 'shelf', 'shelf', [90, 45, 180], { sub: '랙', p: { style: 'wire', shelves: 5 }, m: { frame: M('chrome', '#cfd2d4') }, ergo: 'tallStorage' }),
  P('gen-metal-rack', '철제 선반 4단', GEN, 'shelf', 'shelf', [80, 40, 150], { sub: '랙', p: { style: 'metalRack', shelves: 4 }, m: { frame: BLACK, board: OAK } }),
  P('gen-ladder', '사다리 선반', GEN, 'shelf', 'shelf', [60, 35, 180], { sub: '선반', p: { style: 'ladder', shelves: 5 } }),
  P('gen-wallshelf-60', '벽 선반 60', GEN, 'shelf', 'shelf', [60, 20, 2.5], { sub: '벽선반', p: { style: 'wall', shelves: 1 }, mount: 'wall', elev: 140 }),
  P('gen-wallshelf-120', '벽 선반 120 (3단)', GEN, 'shelf', 'shelf', [120, 25, 80], { sub: '벽선반', p: { style: 'wall', shelves: 3 }, mount: 'wall', elev: 110 }),
  P('string-pocket', 'String Pocket 벽선반', 'String', 'shelf', 'shelf', [60, 15, 50], { p: { style: 'rail', shelves: 3 }, m: { frame: M('metal', '#f2f2f0'), board: M('lacquer', '#f2f2f0') }, mount: 'wall', elev: 120 }),
  P('gen-pegboard', '타공판', GEN, 'shelf', 'shelf', [80, 12, 100], { sub: '타공판', p: { style: 'pegboard' }, m: { board: M('lacquer', '#f0eee8') }, mount: 'wall', elev: 90 }),

  // ------------------------------------------------------------ LIGHTING
  P('gen-floor-drum', '장스탠드 (드럼갓)', GEN, 'lighting', 'lamp', [40, 40, 160], { sub: '스탠드', p: { kind: 'floor', shade: 'drum', shadeH: 30 } }),
  P('gen-floor-arc', '아크 스탠드', GEN, 'lighting', 'lamp', [150, 35, 200], { sub: '스탠드', p: { kind: 'floor', base: 'arc', shadeH: 25 }, m: { body: M('chrome', '#d0d3d6'), shade: M('metal', '#e9e7e2') } }),
  P('gen-floor-tripod', '삼각대 스탠드', GEN, 'lighting', 'lamp', [55, 55, 155], { sub: '스탠드', p: { kind: 'floor', base: 'tripod', shade: 'taper', shadeH: 32 }, m: { body: OAK } }),
  P('gen-floor-paper', '종이등 스탠드', GEN, 'lighting', 'lamp', [45, 45, 150], { sub: '스탠드', p: { kind: 'floor', base: 'paper', shade: 'paper' } }),
  P('gen-table-lamp', '테이블 램프', GEN, 'lighting', 'lamp', [30, 30, 45], { sub: '테이블', p: { kind: 'table', shade: 'drum', base: 'ceramic', shadeH: 18 }, m: { body: M('ceramic', '#d9cbb6') }, mount: 'surface' }),
  P('gen-mushroom', '머쉬룸 램프', GEN, 'lighting', 'lamp', [25, 25, 32], { sub: '테이블', p: { kind: 'table', shade: 'mushroom', base: 'mushroom', shadeH: 13 }, m: { body: M('plastic', '#f0e6cf'), shade: M('emissive', '#f0e6cf') }, mount: 'surface' }),
  P('gen-task', '작업용 스탠드', GEN, 'lighting', 'lamp', [45, 18, 50], { sub: '데스크', p: { kind: 'task' }, mount: 'surface' }),
  P('gen-pendant-dome', '펜던트 (돔)', GEN, 'lighting', 'lamp', [40, 40, 90], { sub: '펜던트', p: { kind: 'pendant', shade: 'dome', shadeH: 22 }, m: { shade: M('metal', '#2b2b2b') }, mount: 'ceiling', ergo: 'pendant' }),
  P('gen-pendant-globe', '펜던트 (유리구)', GEN, 'lighting', 'lamp', [30, 30, 80], { sub: '펜던트', p: { kind: 'pendant', shade: 'globe' }, m: { shade: M('emissive', '#f4f1ea') }, mount: 'ceiling', ergo: 'pendant' }),
  P('gen-pendant-linear', '리니어 펜던트 120', GEN, 'lighting', 'lamp', [120, 8, 80], { sub: '펜던트', p: { kind: 'linear' }, m: { shade: M('metal', '#2b2b2b') }, mount: 'ceiling', ergo: 'pendant' }),
  P('gen-ceiling-round', '천장 LED 등 (원형)', GEN, 'lighting', 'lamp', [50, 50, 8], { sub: '직부등', p: { kind: 'ceiling' }, m: { shade: M('emissive', '#ffffff') }, mount: 'ceiling' }),
  P('gen-ceiling-square', '천장 LED 등 (사각)', GEN, 'lighting', 'lamp', [60, 60, 8], { sub: '직부등', p: { kind: 'ceiling', shade: 'square' }, m: { shade: M('emissive', '#ffffff') }, mount: 'ceiling' }),
  P('gen-sconce', '벽등', GEN, 'lighting', 'lamp', [20, 25, 30], { sub: '벽등', p: { kind: 'wall', shade: 'cone' }, m: { shade: M('brass', '#b8964f') }, mount: 'wall', elev: 160 }),
  P('lp-ph5', 'PH 5 펜던트', 'Louis Poulsen', 'lighting', 'lamp', [50, 50, 100], { p: { kind: 'pendant', shade: 'layered', shadeH: 26.7 }, m: { shade: M('lacquer', '#f4f3ef') }, mount: 'ceiling', ergo: 'pendant', notes: '갓 Ø50 × H26.7, 코드 길이는 조절' }),
  P('lp-panthella-mini', 'Panthella Mini 테이블', 'Louis Poulsen', 'lighting', 'lamp', [25, 25, 34], { p: { kind: 'table', shade: 'dome', base: 'mushroom', shadeH: 12 }, m: { body: M('lacquer', '#f4f3ef'), shade: M('emissive', '#f4f3ef') }, mount: 'surface', approx: true }),
  P('flos-arco', 'Arco 아르코 플로어 램프', 'FLOS', 'lighting', 'lamp', [200, 40, 240], { p: { kind: 'floor', base: 'arc', shadeH: 25 }, m: { body: M('chrome', '#d0d3d6'), shade: M('chrome', '#d0d3d6') }, approx: true }),
  P('ikea-fado', 'FADO 파도 테이블 램프', IKEA, 'lighting', 'lamp', [25, 25, 24], { p: { kind: 'table', shade: 'globe', base: 'mushroom', shadeH: 22 }, m: { shade: M('emissive', '#f6f3ec') }, mount: 'surface', approx: true }),

  // ------------------------------------------------------------ TEXTILE
  P('gen-rug-160', '러그 160×230', GEN, 'textile', 'rug', [160, 230, 1], { sub: '러그' }),
  P('gen-rug-200', '러그 200×300', GEN, 'textile', 'rug', [200, 300, 1], { sub: '러그', p: { pattern: 'border' } }),
  P('gen-rug-140', '러그 140×200', GEN, 'textile', 'rug', [140, 200, 1], { sub: '러그', p: { pattern: 'stripe', c1: '#efe9df', c2: '#c9b9a0' } }),
  P('gen-rug-round', '원형 러그 Ø150', GEN, 'textile', 'rug', [150, 150, 1], { sub: '러그', p: { shape: 'round', pattern: 'solid', c1: '#d2c3ac' } }),
  P('gen-rug-organic', '비정형 러그 160×200', GEN, 'textile', 'rug', [200, 160, 1.5], { sub: '러그', p: { shape: 'organic', c1: '#e7e0d3' } }),
  P('gen-rug-persian', '페르시안 러그 170×240', GEN, 'textile', 'rug', [170, 240, 1], { sub: '러그', p: { pattern: 'persian', c1: '#8c3b2e', c2: '#d7b98a' } }),
  P('gen-runner', '러너 러그 60×180', GEN, 'textile', 'rug', [60, 180, 1], { sub: '러그', p: { pattern: 'border' } }),
  P('gen-curtain', '커튼 (창 폭 200)', GEN, 'textile', 'curtain', [220, 15, 230], { sub: '커튼', p: { style: 'pleat' }, mount: 'wall', elev: 0 }),
  P('gen-curtain-double', '속지+암막 커튼', GEN, 'textile', 'curtain', [220, 20, 230], { sub: '커튼', p: { style: 'double' }, m: { fabric: M('velvet', '#7a7f73') }, mount: 'wall', elev: 0 }),
  P('gen-roller', '롤스크린', GEN, 'textile', 'curtain', [205, 8, 160], { sub: '블라인드', p: { style: 'roller', open: 0.5 }, mount: 'wall', elev: 75 }),
  P('gen-blind', '우드 블라인드', GEN, 'textile', 'curtain', [205, 8, 160], { sub: '블라인드', p: { style: 'blind', open: 0.4 }, m: { fabric: OAK }, mount: 'wall', elev: 75 }),

  // ------------------------------------------------------------ PLANTS
  P('gen-plant-fiddle', '떡갈고무나무 (대)', GEN, 'plant', 'plant', [60, 60, 170], { sub: '대형' }),
  P('gen-plant-olive', '올리브나무', GEN, 'plant', 'plant', [60, 60, 160], { sub: '대형', p: { style: 'olive' }, m: { foliage: M('foliage', '#7c8a5e') } }),
  P('gen-plant-monstera', '몬스테라', GEN, 'plant', 'plant', [80, 80, 100], { sub: '중형', p: { style: 'monstera', potH: 28 } }),
  P('gen-plant-palm', '아레카야자', GEN, 'plant', 'plant', [80, 80, 160], { sub: '대형', p: { style: 'palm', pot: 'basket' }, m: { foliage: M('foliage', '#6a8f4f') } }),
  P('gen-plant-snake', '산세베리아', GEN, 'plant', 'plant', [30, 30, 70], { sub: '중형', p: { style: 'snake', potH: 22 }, m: { foliage: M('foliage', '#4d6b3a') } }),
  P('gen-plant-bush', '관엽 화분 (소)', GEN, 'plant', 'plant', [35, 35, 50], { sub: '소형', p: { style: 'bush', potH: 18 }, mount: 'surface' }),
  P('gen-plant-hanging', '행잉 플랜트', GEN, 'plant', 'plant', [30, 30, 40], { sub: '행잉', p: { style: 'hanging', potH: 15 }, mount: 'ceiling' }),

  // ------------------------------------------------------------ DECOR
  P('gen-frame-50', '액자 50×70', GEN, 'decor', 'frame', [50, 3, 70], { sub: '액자', mount: 'wall', elev: 120 }),
  P('gen-frame-60', '포스터 60×90', GEN, 'decor', 'frame', [60, 3, 90], { sub: '액자', p: { frameW: 1.2 }, m: { frame: M('metal', '#222222') }, mount: 'wall', elev: 110 }),
  P('gen-frame-wide', '가로 액자 100×70', GEN, 'decor', 'frame', [100, 3, 70], { sub: '액자', p: { artColor: '#7f8c75' }, mount: 'wall', elev: 120 }),
  P('gen-frame-lean', '기대는 대형 액자 80×120', GEN, 'decor', 'frame', [80, 4, 120], { sub: '액자', p: { leaning: true }, mount: 'floor' }),
  P('gen-mirror-full', '전신 거울 50×160', GEN, 'decor', 'mirror', [50, 5, 160], { sub: '거울', p: { stand: 'lean' }, ergo: 'mirror' }),
  P('gen-mirror-round', '원형 거울 Ø60', GEN, 'decor', 'mirror', [60, 3, 60], { sub: '거울', p: { shape: 'round' }, m: { frame: M('brass', '#b8964f') }, mount: 'wall', elev: 120, ergo: 'mirror' }),
  P('gen-mirror-arch', '아치 거울 60×170', GEN, 'decor', 'mirror', [60, 4, 170], { sub: '거울', p: { shape: 'arch', stand: 'lean' }, m: { frame: OAK }, ergo: 'mirror' }),
  P('ikea-nissedal', 'NISSEDAL 니세달 거울 65×150', IKEA, 'decor', 'mirror', [65, 3, 150], { p: { stand: 'wall' }, m: { frame: BLACK }, mount: 'wall', elev: 30, ergo: 'mirror', approx: true }),
  P('ikea-hovet', 'HOVET 호베트 거울 78×196', IKEA, 'decor', 'mirror', [78, 4, 196], { p: { stand: 'lean' }, m: { frame: M('metal', '#2a2a2a') }, ergo: 'mirror', approx: true }),
  P('gen-vase', '화병', GEN, 'decor', 'decor', [18, 18, 30], { sub: '소품', p: { kind: 'vase' }, mount: 'surface' }),
  P('gen-books', '책 더미', GEN, 'decor', 'decor', [24, 18, 15], { sub: '소품', p: { kind: 'books' }, mount: 'surface' }),
  P('gen-clock', '벽시계 Ø35', GEN, 'decor', 'decor', [35, 4, 35], { sub: '소품', p: { kind: 'clock' }, m: { body: M('wood', '#d6bd94') }, mount: 'wall', elev: 170 }),
  P('gen-divider', '파티션(병풍)', GEN, 'decor', 'decor', [150, 40, 170], { sub: '파티션', p: { kind: 'divider' }, m: { body: M('rattan', '#c9a978') } }),
  P('gen-basket', '수납 바구니', GEN, 'decor', 'decor', [40, 40, 35], { sub: '소품', p: { kind: 'basket' } }),
  P('gen-trash', '휴지통', GEN, 'decor', 'decor', [28, 28, 40], { sub: '소품', p: { kind: 'trash' }, m: { body: M('metal', '#e9e7e2') } }),
  P('gen-speaker', '북쉘프 스피커', GEN, 'electronics', 'decor', [18, 25, 30], { sub: '스피커', p: { kind: 'speaker' }, m: { body: WALNUT }, mount: 'surface' }),

  // ------------------------------------------------------------ APPLIANCES
  P('gen-fridge-s', '냉장고 (2도어 300L급)', GEN, 'appliance', 'appliance', [60, 66, 170], { sub: '냉장고', p: { kind: 'fridge', doors: '2' }, clearance: { front: 90 }, approx: true }),
  P('gen-fridge-1', '소형 냉장고 (1도어)', GEN, 'appliance', 'appliance', [50, 55, 85], { sub: '냉장고', p: { kind: 'fridge', doors: '1' }, clearance: { front: 70 }, approx: true }),
  P('gen-fridge-4', '4도어 냉장고 (870L급)', GEN, 'appliance', 'appliance', [91.2, 93, 185.3], { sub: '냉장고', p: { kind: 'fridge', doors: '4' }, clearance: { front: 100 }, approx: true }),
  P('gen-kimchi', '스탠드 김치냉장고', GEN, 'appliance', 'appliance', [70, 80, 185], { sub: '김치냉장고', p: { kind: 'fridge', doors: '4' }, clearance: { front: 90 }, approx: true }),
  P('gen-washer', '드럼세탁기 21kg', GEN, 'appliance', 'appliance', [68.6, 77, 99], { sub: '세탁기', p: { kind: 'washer' }, clearance: { front: 80 }, approx: true }),
  P('gen-dryer', '건조기 19kg', GEN, 'appliance', 'appliance', [68.6, 77, 99], { sub: '건조기', p: { kind: 'dryer' }, clearance: { front: 80 }, approx: true }),
  P('gen-dryer-mini', '미니 건조기 (3~4kg)', GEN, 'appliance', 'appliance', [50, 50, 70], { sub: '건조기', p: { kind: 'dryer' }, clearance: { front: 60 }, approx: true }),
  P('lg-washtower', '트롬 워시타워 (세탁+건조 일체)', 'LG전자', 'appliance', 'appliance', [70, 83, 189], { p: { kind: 'tower' }, clearance: { front: 85 }, approx: true }),
  P('lg-styler', '스타일러 (의류관리기)', 'LG전자', 'appliance', 'appliance', [44.5, 58.5, 185], { p: { kind: 'styler' }, m: { panel: M('mirror', '#ccd2d6') }, clearance: { front: 70 }, approx: true }),
  P('gen-aircon-stand', '스탠드 에어컨', GEN, 'appliance', 'appliance', [37, 36, 190], { sub: '에어컨', p: { kind: 'aircon' }, approx: true }),
  P('gen-aircon-wall', '벽걸이 에어컨', GEN, 'appliance', 'appliance', [86, 21, 30], { sub: '에어컨', p: { kind: 'aircon-wall' }, mount: 'wall', elev: 200, approx: true }),
  P('gen-purifier', '공기청정기 (원통)', GEN, 'appliance', 'appliance', [30, 30, 65], { sub: '공기청정기', p: { kind: 'purifier', round: true }, approx: true }),
  P('gen-disposer', '음식물처리기', GEN, 'appliance', 'appliance', [30, 40, 45], { sub: '음식물처리기', p: { kind: 'disposer' }, approx: true }),
  P('gen-microwave', '전자레인지', GEN, 'appliance', 'appliance', [48, 36, 28], { sub: '주방가전', p: { kind: 'microwave' }, mount: 'surface', approx: true }),
  P('gen-robot', '로봇청소기 스테이션', GEN, 'appliance', 'appliance', [40, 45, 50], { sub: '청소기', p: { kind: 'vacuum' }, clearance: { front: 50 }, approx: true }),

  // ------------------------------------------------------------ ELECTRONICS
  P('gen-tv-55', 'TV 55인치 (스탠드)', GEN, 'electronics', 'screen', [123, 25, 78], { sub: 'TV', p: { kind: 'tv', stand: 'feet' }, mount: 'surface', ergo: 'tv', approx: true }),
  P('gen-tv-65', 'TV 65인치 (스탠드)', GEN, 'electronics', 'screen', [145, 27, 90], { sub: 'TV', p: { kind: 'tv', stand: 'feet' }, mount: 'surface', ergo: 'tv', approx: true }),
  P('gen-tv-75', 'TV 75인치 (스탠드)', GEN, 'electronics', 'screen', [168, 30, 103], { sub: 'TV', p: { kind: 'tv', stand: 'feet' }, mount: 'surface', ergo: 'tv', approx: true }),
  P('gen-tv-65-wall', 'TV 65인치 (벽걸이)', GEN, 'electronics', 'screen', [145, 4, 83], { sub: 'TV', p: { kind: 'tv', stand: 'wall' }, mount: 'wall', elev: 70, ergo: 'tv', approx: true }),
  P('gen-tv-easel', 'TV 55인치 (이젤 스탠드)', GEN, 'electronics', 'screen', [123, 60, 150], { sub: 'TV', p: { kind: 'tv', stand: 'easel' }, ergo: 'tv', approx: true }),
  P('lg-stanbyme', '스탠바이미 27인치 (이동형)', 'LG전자', 'electronics', 'screen', [63, 40, 125], { p: { kind: 'tv', stand: 'pole' }, ergo: 'tv', approx: true, notes: '높이 조절형 — 수치는 근사' }),
  P('gen-monitor-27', '모니터 27인치', GEN, 'electronics', 'screen', [61, 20, 45], { sub: '모니터', p: { kind: 'monitor' }, mount: 'surface', approx: true }),
  P('gen-monitor-34', '모니터 34인치 와이드', GEN, 'electronics', 'screen', [81, 22, 45], { sub: '모니터', p: { kind: 'monitor' }, mount: 'surface', approx: true }),
  P('yamaha-u1', 'U1 업라이트 피아노', 'Yamaha', 'electronics', 'screen', [153, 61, 121], { p: { kind: 'piano' }, m: { body: M('lacquer', '#121212') }, clearance: { front: 80 } }),
  P('gen-digital-piano', '디지털 피아노 88건반', GEN, 'electronics', 'screen', [136, 42, 86], { sub: '피아노', p: { kind: 'digitalPiano' }, m: { body: M('woodDark', '#3a2a20') }, clearance: { front: 80 }, approx: true }),

  // ------------------------------------------------------------ KITCHEN
  P('gen-kitchen-180', '주방 하부장 180 (싱크+쿡탑)', GEN, 'kitchen', 'kitchen', [180, 60, 85], { sub: '하부장', p: { sinkX: -45, cookX: 55 }, ergo: 'counter', clearance: { front: 90 } }),
  P('gen-kitchen-120', '주방 하부장 120', GEN, 'kitchen', 'kitchen', [120, 60, 85], { sub: '하부장', ergo: 'counter', clearance: { front: 90 } }),
  P('gen-upper-120', '주방 상부장 120', GEN, 'kitchen', 'kitchen', [120, 35, 70], { sub: '상부장', p: { kind: 'upper' }, mount: 'wall', elev: 145, ergo: 'upperCabinet' }),
  P('gen-island', '아일랜드 식탁 120', GEN, 'kitchen', 'kitchen', [120, 80, 90], { sub: '아일랜드', m: { top: M('marble', '#f1efea') }, ergo: 'counter', clearance: { front: 90, back: 90 } }),
  P('gen-range-rack', '렌지대 (3단)', GEN, 'kitchen', 'shelf', [60, 45, 120], { sub: '렌지대', p: { style: 'metalRack', shelves: 3, books: false }, m: { frame: WHITE, board: WHITE } }),

  // ------------------------------------------------------------ BATH
  P('gen-toilet', '양변기', GEN, 'bath', 'bath', [40, 68, 75], { sub: '변기', p: { kind: 'toilet' }, clearance: { front: 60 } }),
  P('gen-basin', '세면대 (긴다리)', GEN, 'bath', 'bath', [50, 40, 82], { sub: '세면대', p: { kind: 'basin', style: 'pedestal' }, ergo: 'vanity' }),
  P('gen-bath-vanity', '세면대 (하부장형) 60', GEN, 'bath', 'bath', [60, 45, 82], { sub: '세면대', p: { kind: 'basin', style: 'vanity' }, ergo: 'vanity' }),
  P('gen-tub', '욕조 150', GEN, 'bath', 'bath', [150, 75, 55], { sub: '욕조', p: { kind: 'tub' } }),
  P('gen-glass', '샤워 유리 파티션 100', GEN, 'bath', 'bath', [100, 1, 200], { sub: '파티션', p: { kind: 'glass' } }),

  // ------------------------------------------------------------ FITNESS / KIDS / MISC
  P('gen-treadmill', '러닝머신', GEN, 'fitness', 'activity', [75, 170, 140], { sub: '운동', p: { kind: 'treadmill' }, approx: true }),
  P('gen-bike', '실내자전거', GEN, 'fitness', 'activity', [50, 100, 120], { sub: '운동', p: { kind: 'bike' }, approx: true }),
  P('gen-yogamat', '요가매트', GEN, 'fitness', 'activity', [61, 183, 0.6], { sub: '운동', p: { kind: 'mat' } }),
  P('gen-bicycle', '자전거', GEN, 'fitness', 'activity', [60, 175, 100], { sub: '취미', p: { kind: 'bicycle' }, m: { accent: M('lacquer', '#2f5d50') } }),
  P('gen-cattower', '캣타워', GEN, 'kids', 'activity', [50, 50, 160], { sub: '반려', p: { kind: 'cattower' }, m: { accent: M('fabric', '#e3dccf') } }),
  P('gen-crib', '아기침대', GEN, 'kids', 'activity', [70, 130, 95], { sub: '육아', p: { kind: 'crib' }, m: { body: WHITE, accent: M('fabric', '#f4efe6') } }),
  P('gen-suitcase', '캐리어 28인치', GEN, 'misc', 'activity', [48, 30, 75], { sub: '수납', p: { kind: 'suitcase' }, m: { accent: M('plastic', '#b8bcc0') } }),
  P('gen-box', '박스 (직접 크기 입력)', GEN, 'misc', 'block', [50, 50, 50], { sub: '박스' }),
  P('gen-column', '기둥/벽체', GEN, 'misc', 'block', [40, 40, 240], { sub: '구조', m: { body: M('lacquer', '#ecebe7') } }),
];

/** The public catalog. A home's own products (its built-ins, a shortlist made elsewhere) travel
 *  with that home's project as `customProducts`, so they never need to be in this file. */
export const PRODUCTS: Product[] = BASE_PRODUCTS;

export const ALL_BUILTIN = PRODUCTS;

export function productSearchUrl(p: Product): string {
  if (p.url) return p.url;
  const q = p.name.replace(/\(.*?\)/g, '').trim();
  if (p.brand === IKEA) return `https://www.ikea.com/kr/ko/search/?q=${encodeURIComponent(q.split(' ')[0])}`;
  if (p.brand === GEN || p.builtin) return `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(q)}`;
  return `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(p.brand + ' ' + q)}`;
}

export function defaultMount(p: Product): Mount {
  return p.mount ?? 'floor';
}

export function defaultElev(p: Product, ceiling: number): number {
  const m = defaultMount(p);
  if (m === 'ceiling') return ceiling - p.dims.h;
  if (m === 'wall') return p.elev ?? 120;
  return p.elev ?? 0;
}

export function ergoOf(p: Product): ErgoRole {
  return p.ergo ?? 'none';
}
