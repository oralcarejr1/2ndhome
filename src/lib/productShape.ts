import type { CategoryId, ErgoRole, Mount, ParamValue } from '../types';

/**
 * Turns a store product name (+ store category path) into a planner furniture "kind":
 * category, 3D generator, form parameters and typical dimensions for anything the page
 * doesn't state. Pure and dependency-free so the server import API and the editor share it.
 */

export type Axis = 'w' | 'd' | 'h';
export type Dims = Partial<Record<Axis, number>>;

export interface ShapeFeatures {
  drawers?: number;
  doors?: number;
  shelves?: number;
  seats?: number;
  seatH?: number;
  round?: boolean;
  mirror?: boolean;
  legs?: 'none' | 'wood' | 'metal' | 'hairpin';
}

export interface ShapeResult {
  kind: string;
  category: CategoryId;
  model: string;
  sub: string;
  ergo?: ErgoRole;
  mount?: Mount;
  params: Record<string, ParamValue>;
  seatH?: number;
  /** typical size used only for axes the product page does not state */
  typical: { w: number; d: number; h: number };
}

interface KindDef {
  id: string;
  /** keyword that names the product (head noun) */
  re: RegExp;
  build: (ctx: KindCtx) => Omit<ShapeResult, 'kind'>;
}

interface KindCtx {
  text: string;
  name: string;
  dims: Dims;
  f: ShapeFeatures;
}

const has = (t: string, re: RegExp) => re.test(t);
const clampInt = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/** "3단", "5단 서랍장", "4칸" → number */
function tierCount(t: string): number | undefined {
  const m = /(\d{1,2})\s*단(?!\s*(?:높이|접이|폴딩|조절))/.exec(t);
  if (m) return clampInt(Number(m[1]), 1, 10);
  return undefined;
}

function seatsFrom(t: string): number | undefined {
  const m = /(\d)\s*(?:~|\/|-)?\s*(?:\d\s*)?인(?:용|조)?/.exec(t);
  if (m) return clampInt(Number(m[1]), 1, 8);
  if (/1인\s*소파|싱글\s*소파/.test(t)) return 1;
  return undefined;
}

/** Korean mattress size codes → mattress width × length (cm). Rightmost/longest code wins. */
export const BED_SIZES: Record<string, { w: number; l: number; label: string }> = {
  MS: { w: 90, l: 200, label: '미니싱글' },
  S: { w: 100, l: 200, label: '싱글' },
  SS: { w: 110, l: 200, label: '슈퍼싱글' },
  D: { w: 140, l: 200, label: '더블' },
  Q: { w: 150, l: 200, label: '퀸' },
  QK: { w: 160, l: 200, label: '퀸킹' },
  K: { w: 160, l: 200, label: '킹' },
  LK: { w: 180, l: 200, label: '라지킹' },
  EK: { w: 200, l: 200, label: '이스턴킹' },
  CK: { w: 180, l: 210, label: '캘리포니아킹' },
};

const BED_WORDS: [RegExp, string][] = [
  [/미니\s*싱글/, 'MS'],
  [/슈퍼\s*싱글/, 'SS'],
  [/라지\s*킹/, 'LK'],
  [/이스턴\s*킹/, 'EK'],
  [/캘리포니아\s*킹/, 'CK'],
  [/퀸\s*킹/, 'QK'],
  [/싱글/, 'S'],
  [/더블/, 'D'],
  [/퀸/, 'Q'],
  [/킹/, 'K'],
];

/** Finds a single bed/mattress size code in an option label like "25cm / SS 그레이" or "퀸 Q". */
export function bedSizeCode(label: string): string | undefined {
  for (const [re, code] of BED_WORDS) if (re.test(label)) return code;
  const m = label.match(/(?:^|[^A-Za-z])(MS|SS|QK|LK|EK|CK|S|D|Q|K)(?![A-Za-z])/);
  return m?.[1];
}

// ------------------------------------------------------------------ kinds
// The *rightmost* matching keyword in the cleaned name wins (Korean head noun comes last),
// so "회전 전신거울 수납 화장대" is a vanity and "토퍼 매트리스" a mattress.

const KINDS: KindDef[] = [
  {
    id: 'mattress',
    re: /매트리스|토퍼|mattress/gi,
    build: ({ text, name, f }) => {
      const thick = /(\d{1,2}(?:\.\d)?)\s*cm/i.exec(name) ?? /(\d{1,2}(?:\.\d)?)\s*cm/i.exec(text);
      const t = thick ? Math.min(40, Number(thick[1])) : has(name, /토퍼/) && !has(name, /매트리스/) ? 8 : has(name, /토퍼/) ? 10 : 25;
      const folding = has(text, /접이식|폴딩|3단\s*접/);
      void f;
      return {
        category: 'bed',
        model: 'bed',
        sub: has(name, /토퍼/) && !has(name, /매트리스$/) ? '토퍼' : '매트리스',
        ergo: 'bed',
        params: { style: 'mattress', mattressT: t, bedding: false, headT: 0, legH: 0, frameH: 0, segments: folding ? 3 : 1 },
        typical: { w: 150, d: 200, h: t },
      };
    },
  },
  {
    id: 'bed',
    re: /침대(?:\s*프레임)?|베드|bed\s*frame|\bbed\b/gi,
    build: ({ text, name }) => {
      const noHead = has(name, /무헤드|헤드\s*없|헤드리스/);
      const storage = has(text, /수납|리프트업|서랍|통수납/);
      const low = has(text, /저상형|깔판|좌식|플로어|평상\s*저상|로우/);
      const fabric = has(text, /패브릭|호텔식|가죽|레더|쿠션\s*헤드|벨벳|부클/);
      const style = low ? 'floor' : storage ? 'storage' : fabric ? 'upholstered' : 'platform';
      const frameH = low ? 8 : storage ? 32 : 28;
      return {
        category: 'bed',
        model: 'bed',
        sub: low ? '저상형 침대' : storage ? '수납 침대' : '침대',
        ergo: 'bed',
        params: {
          style,
          frameH,
          headT: noHead ? 0 : fabric ? 10 : 6,
          legs: storage || low ? 'none' : 'square',
          legH: storage || low ? 0 : 10,
          tufted: has(text, /템바|분할|채널|윙/),
        },
        typical: { w: 160, d: 215, h: noHead ? frameH + 25 : 95 },
      };
    },
  },
  {
    id: 'sofaBed',
    re: /소파\s*베드|쇼파\s*베드|sofa\s*bed/gi,
    build: ({ text, f }) => sofaShape(text, f, '소파베드'),
  },
  {
    id: 'sofa',
    re: /소파|쇼파|카우치|sofa|couch|loveseat/gi,
    build: ({ text, f }) => sofaShape(text, f),
  },
  {
    id: 'recliner',
    re: /리클라이너(?:\s*체어)?|안락\s*의자|라운지\s*체어|lounge\s*chair|armchair/gi,
    build: ({ text, f }) => {
      const seats = f.seats ?? seatsFrom(text) ?? 1;
      if (seats > 1) return sofaShape(text, f, '리클라이너 소파');
      return {
        category: 'sofa',
        model: 'lounge',
        sub: '1인 체어',
        ergo: 'sofa',
        params: { style: has(text, /리클라이너|안락/) ? 'wingback' : has(text, /빈백/) ? 'beanbag' : 'bentwood', seatH: f.seatH ?? 42 },
        seatH: f.seatH ?? 42,
        typical: { w: 80, d: 90, h: 100 },
      };
    },
  },
  {
    id: 'beanbag',
    re: /빈백|좌식\s*의자|bean\s*bag/gi,
    build: ({ text }) => ({
      category: 'sofa',
      model: 'lounge',
      sub: has(text, /빈백/) ? '빈백' : '좌식의자',
      params: { style: has(text, /빈백/) ? 'beanbag' : 'floor', seatH: 25 },
      seatH: 25,
      typical: { w: 70, d: 80, h: 70 },
    }),
  },
  {
    id: 'officeChair',
    re: /(?:사무용?|오피스|컴퓨터|게이밍|학생|책상|메쉬|중역)\s*의자|오피스\s*체어|게이밍\s*체어|office\s*chair/gi,
    build: ({ text, f }) => ({
      category: 'chair',
      model: 'office',
      sub: '사무용 의자',
      ergo: 'officeChair',
      params: { headrest: has(text, /헤드레스트|목받침|헤드/), arms: !has(text, /팔걸이\s*없|무팔/), seatH: f.seatH ?? 47 },
      seatH: f.seatH ?? 47,
      typical: { w: 65, d: 65, h: has(text, /헤드레스트|목받침|게이밍/) ? 125 : 105 },
    }),
  },
  {
    id: 'stool',
    re: /스툴|stool|바\s*체어|바\s*의자|홈바\s*의자/gi,
    build: ({ text, f }) => {
      const bar = has(text, /바\s*체어|바\s*의자|홈바|바\s*스툴|높은|하이/);
      const seatH = f.seatH ?? (bar ? 70 : 45);
      return {
        category: 'chair',
        model: 'chair',
        sub: bar ? '바체어' : '스툴',
        ergo: 'chair',
        params: { style: bar ? 'barstool' : 'stool', seatH, legs: has(text, /철제|스틸|메탈/) ? 'metal' : 'four' },
        seatH,
        typical: { w: bar ? 40 : 35, d: bar ? 40 : 35, h: bar ? 90 : 45 },
      };
    },
  },
  {
    id: 'bench',
    re: /벤치|오토만|푸프|pouf|ottoman|\bbench\b/gi,
    build: ({ text }) => {
      const style = has(text, /오토만|ottoman/i) ? 'ottoman' : has(text, /푸프|pouf/i) ? 'pouf' : 'wood';
      return {
        category: 'chair',
        model: 'bench',
        sub: style === 'wood' ? '벤치' : '오토만',
        params: { style, legs: has(text, /철제|스틸|메탈/) ? 'metal' : style === 'wood' ? 'splayed' : 'none' },
        seatH: 45,
        typical: style === 'wood' ? { w: 120, d: 35, h: 45 } : { w: 60, d: 45, h: 42 },
      };
    },
  },
  {
    id: 'chair',
    re: /의자|체어|chair/gi,
    build: ({ text, f }) => {
      const style = has(text, /접이식|폴딩/)
        ? 'folding'
        : has(text, /패브릭|쿠션|가죽|레더|벨벳|부클/)
          ? 'upholstered'
          : has(text, /윈저|windsor/i)
            ? 'windsor'
            : has(text, /플라스틱|쉘|shell/i)
              ? 'shell'
              : 'dining';
      const seatH = f.seatH ?? 45;
      return {
        category: 'chair',
        model: 'chair',
        sub: has(text, /식탁|다이닝/) ? '식탁의자' : '의자',
        ergo: 'chair',
        params: { style, seatH, arms: has(text, /팔걸이/) && !has(text, /팔걸이\s*없/), legs: has(text, /철제|스틸|메탈/) ? 'metal' : 'four' },
        seatH,
        typical: { w: 48, d: 52, h: 80 },
      };
    },
  },
  {
    id: 'vanity',
    re: /화장대|드레싱\s*테이블|vanity|dressing\s*table/gi,
    build: ({ text, f }) => {
      const tower = has(text, /회전|전신\s*거울|전신경|거울\s*수납장|코너/);
      const dresser = !tower && has(text, /서랍장|서랍형|와이드|수납형/);
      const style = tower ? 'tower' : dresser ? 'dresser' : 'table';
      return {
        category: style === 'table' ? 'table' : 'storage',
        model: 'vanity',
        sub: '화장대',
        ergo: style === 'table' ? 'desk' : undefined,
        params: {
          style,
          drawers: f.drawers ?? tierCount(text) ?? (style === 'dresser' ? 3 : 1),
          stool: has(text, /스툴|의자/) && !has(text, /스툴\s*미포함|의자\s*미포함/),
          mirror: style === 'tower' ? 'full' : has(text, /led|조명/i) ? 'led' : 'stand',
          rotating: style === 'tower' && has(text, /회전/),
          legs: style === 'table' ? (has(text, /철제|스틸|메탈/) ? 'metal' : 'tapered') : 'none',
        },
        typical: style === 'tower' ? { w: 45, d: 45, h: 160 } : style === 'dresser' ? { w: 100, d: 40, h: 150 } : { w: 80, d: 40, h: 140 },
      };
    },
  },
  {
    id: 'console',
    re: /콘솔|console/gi,
    build: ({ text }) => ({
      category: 'table',
      model: 'table',
      sub: '콘솔',
      params: { apron: true, legStyle: has(text, /철제|스틸|메탈/) ? 'metal' : 'square', drawers: has(text, /서랍/) ? 'one' : 'none' },
      typical: { w: 100, d: 35, h: 80 },
    }),
  },
  {
    id: 'desk',
    re: /책상|데스크|desk|작업대|컴퓨터\s*테이블/gi,
    build: ({ text }) => {
      const standing = has(text, /모션|스탠딩|전동|높이\s*조절|standing/i);
      const bookcase = has(text, /책장|선반|ㄱ자|코너/);
      return {
        category: 'desk',
        model: 'table',
        sub: standing ? '모션데스크' : '책상',
        ergo: standing ? 'standingDesk' : 'desk',
        params: {
          base: standing ? 'standing' : has(text, /철제|스틸|메탈|프레임/) ? 'tframe' : bookcase ? 'panel' : 'four',
          legStyle: has(text, /철제|스틸|메탈/) ? 'metal' : 'square',
          drawers: has(text, /양\s*서랍|양쪽/) ? 'both' : has(text, /서랍장|수납형/) ? 'right' : has(text, /서랍/) ? 'one' : 'none',
          shelf: has(text, /하부\s*선반/),
          topT: 2.5,
          ...(standing ? { curH: 73 } : {}),
        },
        typical: { w: 120, d: 60, h: 73 },
      };
    },
  },
  {
    id: 'lowTable',
    re: /좌식\s*테이블|좌탁|집들이\s*상|교자상|밥상|접이식\s*테이블|소반|낮은\s*테이블/gi,
    build: ({ text, f }) => ({
      category: 'table',
      model: 'table',
      sub: '좌식테이블',
      ergo: 'lowTable',
      params: { shape: f.round || has(text, /원형|라운드/) ? 'round' : 'rect', base: has(text, /접이식|폴딩/) ? 'four' : 'panel', legStyle: 'square', topT: 2.5 },
      typical: { w: 120, d: 80, h: 33 },
    }),
  },
  {
    id: 'coffeeTable',
    re: /커피\s*테이블|소파\s*테이블|거실\s*테이블|티\s*테이블|리프트업\s*테이블|coffee\s*table/gi,
    build: ({ text, f }) => ({
      category: 'table',
      model: 'table',
      sub: '거실 테이블',
      ergo: 'coffeeTable',
      params: {
        shape: f.round || has(text, /원형|라운드|동그/) ? 'round' : has(text, /타원|오벌|알약|필/) ? 'pill' : 'rect',
        base: has(text, /리프트업|수납|템바|박스|통/) ? 'panel' : 'four',
        legStyle: has(text, /철제|스틸|메탈/) ? 'metal' : 'square',
        shelf: has(text, /하부\s*선반|2단|수납/),
      },
      typical: { w: 100, d: 55, h: 42 },
    }),
  },
  {
    id: 'sideTable',
    re: /사이드\s*테이블|보조\s*테이블|side\s*table/gi,
    build: ({ text, f }) => ({
      category: 'table',
      model: 'table',
      sub: '사이드 테이블',
      params: { shape: f.round || has(text, /원형|라운드/) ? 'round' : 'rect', base: has(text, /원형|라운드/) ? 'pedestal' : 'four', legStyle: 'square' },
      typical: { w: 45, d: 45, h: 55 },
    }),
  },
  {
    id: 'nightstand',
    re: /협탁|침대\s*옆\s*테이블|nightstand|bedside/gi,
    build: ({ text, f }) => ({
      category: 'storage',
      model: 'case',
      sub: '협탁',
      params: { cols: 1, rows: f.drawers ?? tierCount(text) ?? 2, fill: has(text, /오픈/) ? 'topOpen' : 'drawers', base: has(text, /다리/) ? 'legs' : 'plinth', legH: 10, handle: 'cutout', books: false },
      typical: { w: 45, d: 40, h: 50 },
    }),
  },
  {
    id: 'dining',
    re: /식탁|다이닝\s*테이블|dining\s*table|\d\s*인\s*테이블/gi,
    build: ({ text, f }) => ({
      category: 'table',
      model: 'table',
      sub: '식탁',
      ergo: 'diningTable',
      params: {
        shape: f.round || has(text, /원형|라운드/) ? 'round' : has(text, /타원|오벌/) ? 'oval' : 'rect',
        base: has(text, /원형|라운드/) ? 'pedestal' : has(text, /철제|스틸|메탈/) ? 'four' : 'four',
        legStyle: has(text, /철제|스틸|메탈/) ? 'metal' : 'square',
        apron: !has(text, /세라믹|포세린/),
      },
      typical: has(text, /원형|라운드/) ? { w: 100, d: 100, h: 74 } : { w: 140, d: 80, h: 74 },
    }),
  },
  {
    id: 'table',
    re: /테이블|table/gi,
    build: ({ text, f }) => ({
      category: 'table',
      model: 'table',
      sub: '테이블',
      params: { shape: f.round || has(text, /원형|라운드/) ? 'round' : 'rect', legStyle: has(text, /철제|스틸|메탈/) ? 'metal' : 'square' },
      typical: { w: 120, d: 70, h: 73 },
    }),
  },
  {
    id: 'wardrobe',
    re: /옷장|장롱|붙박이장|드레스\s*룸\s*장|wardrobe/gi,
    build: ({ text, dims, f }) => {
      const w = dims.w ?? 80;
      const doors = f.doors ?? Math.max(1, Math.round(w / 45));
      return {
        category: 'storage',
        model: 'case',
        sub: '옷장',
        ergo: 'wardrobe',
        params: { cols: clampInt(doors, 1, 8), rows: has(text, /서랍/) ? 2 : 1, fill: has(text, /서랍/) ? 'mixed' : has(text, /슬라이딩|미닫이/) ? 'sliding' : 'doors', base: 'plinth', handle: has(text, /푸시|무손잡이/) ? 'none' : 'long', books: false },
        typical: { w: 80, d: 58, h: 210 },
      };
    },
  },
  {
    id: 'hanger',
    re: /행거|옷걸이|드레스\s*룸|hanger|clothes\s*rack/gi,
    build: ({ text }) => ({
      category: 'shelf',
      model: 'rack',
      sub: '행거',
      params: { style: has(text, /2단|이단|선반/) ? 'double' : has(text, /수납/) ? 'shelf' : 'single' },
      typical: { w: 120, d: 45, h: 170 },
    }),
  },
  {
    id: 'drawer',
    re: /서랍장|서랍\s*수납장|체스트|와이드\s*서랍|drawers?|chest/gi,
    build: ({ text, dims, f }) => {
      const rows = f.drawers ?? tierCount(text) ?? 4;
      const w = dims.w ?? 80;
      return {
        category: 'storage',
        model: 'case',
        sub: '서랍장',
        params: { cols: w >= 100 ? 2 : 1, rows: clampInt(rows, 1, 10), fill: 'drawers', base: has(text, /다리/) ? 'legs' : 'plinth', legH: 10, handle: has(text, /홈\s*손잡이|무손잡이|푸시/) ? 'cutout' : 'bar', books: false },
        typical: { w: 80, d: 45, h: Math.max(50, 18 * rows + 15) },
      };
    },
  },
  {
    id: 'tvStand',
    re: /거실장|tv\s*장|티비\s*장|tv\s*스탠드|tv\s*stand/gi,
    build: ({ text, dims }) => {
      const w = dims.w ?? 150;
      return {
        category: 'storage',
        model: 'case',
        sub: 'TV장',
        params: { cols: clampInt(w / 45, 2, 6), rows: 1, fill: 'tvbench', base: has(text, /다리/) ? 'legs' : 'plinth', legH: 12, handle: 'cutout', books: false },
        typical: { w: 160, d: 40, h: 45 },
      };
    },
  },
  {
    id: 'shoeCabinet',
    re: /신발장|shoe\s*(?:cabinet|rack)/gi,
    build: ({ text, dims }) => ({
      category: 'storage',
      model: 'case',
      sub: '신발장',
      params: { cols: clampInt((dims.w ?? 80) / 45, 1, 6), rows: 1, fill: has(text, /오픈/) ? 'open' : 'doors', base: 'plinth', handle: 'cutout', books: false },
      typical: { w: 80, d: 35, h: 120 },
    }),
  },
  {
    id: 'bookcase',
    re: /책장|북케이스|bookcase|bookshelf/gi,
    build: ({ text, dims, f }) => {
      const rows = f.shelves ?? tierCount(text) ?? 5;
      return {
        category: 'shelf',
        model: 'case',
        sub: '책장',
        params: { cols: clampInt((dims.w ?? 80) / 45, 1, 6), rows: clampInt(rows, 1, 10), fill: has(text, /문|도어/) ? 'topOpen' : 'open', base: 'plinth', books: true, noBack: false },
        typical: { w: 80, d: 30, h: 35 * rows + 10 },
      };
    },
  },
  {
    id: 'cabinet',
    re: /수납장|캐비닛|캐비넷|장식장|그릇장|찬장|사이드보드|cabinet|sideboard/gi,
    build: ({ text, dims, f }) => {
      const glass = has(text, /유리|장식장|그릇장/);
      return {
        category: 'storage',
        model: 'case',
        sub: '수납장',
        params: {
          cols: f.doors ?? clampInt((dims.w ?? 80) / 45, 1, 6),
          rows: f.shelves ?? tierCount(text) ?? 3,
          fill: glass ? 'glass' : has(text, /오픈/) ? 'topOpen' : has(text, /서랍/) ? 'mixed' : 'doors',
          base: has(text, /다리/) ? 'legs' : 'plinth',
          legH: 12,
          handle: 'bar',
        },
        typical: { w: 80, d: 40, h: 120 },
      };
    },
  },
  {
    id: 'shelf',
    re: /선반|랙|진열대|트롤리|shelf|rack/gi,
    build: ({ text, f }) => {
      const wall = has(text, /벽\s*선반|벽걸이|무타공|월\s*선반/);
      const style = wall ? 'wall' : has(text, /사다리/) ? 'ladder' : has(text, /원목|우드/) ? 'posts' : has(text, /앵글|철제|스틸|메탈/) ? 'metalRack' : 'wire';
      return {
        category: 'shelf',
        model: 'shelf',
        sub: wall ? '벽선반' : '선반',
        mount: wall ? 'wall' : undefined,
        params: { style, shelves: f.shelves ?? tierCount(text) ?? (wall ? 1 : 4) },
        typical: wall ? { w: 60, d: 20, h: 15 } : { w: 80, d: 40, h: 150 },
      };
    },
  },
  {
    id: 'mirror',
    re: /거울|mirror/gi,
    build: ({ text, f }) => {
      const full = has(text, /전신/);
      const stand = has(text, /스탠드/);
      const wall = has(text, /벽걸이|벽\s*거울|부착/);
      return {
        category: 'decor',
        model: 'mirror',
        sub: full ? '전신거울' : '거울',
        ergo: full ? 'mirror' : undefined,
        mount: wall ? 'wall' : undefined,
        params: { shape: f.round || has(text, /원형|라운드/) ? 'round' : has(text, /아치/) ? 'arch' : 'rect', stand: wall ? 'wall' : stand ? 'stand' : full ? 'lean' : 'wall' },
        typical: full ? { w: 50, d: 4, h: 160 } : { w: 50, d: 3, h: 70 },
      };
    },
  },
];

function sofaShape(text: string, f: ShapeFeatures, sub?: string): Omit<ShapeResult, 'kind'> {
  const seats = f.seats ?? seatsFrom(text) ?? 3;
  const corner = has(text, /코너|ㄱ자|L자|l형|ㄴ자/i);
  const chaise = !corner && has(text, /카우치|스툴\s*포함|오토만\s*포함/);
  const low = has(text, /좌식|로우|저상|바닥/);
  const recliner = has(text, /리클라이너|모션/);
  const leather = has(text, /가죽|레더|leather/i);
  const modular = has(text, /모듈/);
  const seatH = f.seatH ?? (low ? 30 : 43);
  const w = seats * 65 + (corner ? 70 : 40);
  return {
    category: 'sofa',
    model: 'sofa',
    sub: sub ?? `${seats}인 소파`,
    ergo: 'sofa',
    params: {
      seats,
      layout: corner ? 'cornerR' : chaise ? 'chaiseR' : 'straight',
      arm: modular && !recliner ? 'slim' : recliner ? 'track' : leather ? 'track' : 'round',
      armW: recliner ? 22 : 15,
      seatH,
      cushion: has(text, /통\s*방석|벤치/) ? 'bench' : 'loose',
      legs: low ? 'none' : f.legs === 'metal' ? 'metal' : recliner ? 'block' : 'block',
      legH: low ? 0 : recliner ? 4 : 10,
      backT: recliner ? 24 : 18,
      pillows: has(text, /쿠션/) ? 2 : 0,
    },
    seatH,
    typical: { w, d: corner || chaise ? 160 : recliner ? 100 : 92, h: low ? 65 : 85 },
  };
}

// ------------------------------------------------------------------ name cleanup

const COMPONENT_WORD = '(?:포함|증정|제공|사은품|선택|추가|별도|미포함|구성)';

/** Text with accessories ("스툴포함", "+책장", "(쿠션 증정)") removed, for head-noun detection. */
export function headText(name: string): string {
  let s = ` ${name} `;
  s = s.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ');
  s = s.replace(/\s*\+\s*[^+]+$/g, ' '); // "책상+책장" → "책상"
  s = s.replace(/\s(?:&|with|and)\s.+$/i, ' ');
  s = s.replace(new RegExp(`\\S+\\s+${COMPONENT_WORD}(?=\\s|$)`, 'g'), ' '); // "스툴 포함"
  s = s.replace(new RegExp(`\\S*${COMPONENT_WORD}\\S*`, 'g'), ' '); // "스툴포함"
  return s.replace(/\s+/g, ' ').trim();
}

function rightmostKind(text: string): { kind: KindDef; end: number } | undefined {
  let best: { kind: KindDef; end: number; len: number } | undefined;
  for (const k of KINDS) {
    k.re.lastIndex = 0;
    for (const m of text.matchAll(k.re)) {
      const end = (m.index ?? 0) + m[0].length;
      if (!best || end > best.end || (end === best.end && m[0].length > best.len)) best = { kind: k, end, len: m[0].length };
    }
  }
  return best ? { kind: best.kind, end: best.end } : undefined;
}

/**
 * Classifies a product. `name` is the cleaned product name; `categoryPath` the store's
 * breadcrumb (most specific last); `extra` other text (options, notices) for modifiers.
 */
export function classifyShape(input: {
  name?: string;
  categoryPath?: string[];
  extra?: string;
  dims?: Dims;
  features?: ShapeFeatures;
}): ShapeResult | undefined {
  const name = input.name ?? '';
  const head = headText(name);
  const path = (input.categoryPath ?? []).filter(Boolean);
  let pathHit: { kind: KindDef; end: number } | undefined;
  for (const seg of [...path].reverse()) {
    pathHit = rightmostKind(seg.replace(/[·・]/g, ' '));
    if (pathHit) break;
  }
  // The store category wins when the name also uses that word ("3단 서랍장 … 수납장");
  // otherwise the name's head noun is more specific ("콘솔" category, "화장대" product).
  const pathInName = pathHit && (pathHit.kind.re.lastIndex = 0, pathHit.kind.re.test(head));
  if (pathHit) pathHit.kind.re.lastIndex = 0;
  const hit = pathInName ? pathHit : rightmostKind(head) ?? pathHit ?? rightmostKind(name);
  if (!hit) return undefined;

  const text = `${name} ${path.join(' ')} ${input.extra ?? ''}`;
  const f = input.features ?? {};
  const built = hit.kind.build({ text, name, dims: input.dims ?? {}, f });
  return { kind: hit.kind.id, ...built };
}

/** Fills axes the page didn't give from the kind's typical size (returns which were estimated). */
export function completeDims(dims: Dims | undefined, shape: ShapeResult | undefined): { dims: Dims; estimated: Axis[] } {
  const out: Dims = { ...(dims ?? {}) };
  const estimated: Axis[] = [];
  if (!shape) return { dims: out, estimated };
  const known = (['w', 'd', 'h'] as Axis[]).filter((a) => out[a] !== undefined);
  if (known.length === 0) return { dims: out, estimated };
  for (const a of ['w', 'd', 'h'] as Axis[]) {
    if (out[a] === undefined) {
      out[a] = shape.typical[a];
      estimated.push(a);
    }
  }
  return { dims: out, estimated };
}

/** Adjusts generator params to the actual size (mattress fits frame, drawers by height, etc.). */
export function fitParamsToDims(shape: ShapeResult, dims: Dims): Record<string, ParamValue> {
  const p = { ...shape.params };
  const { w, d, h } = dims;
  if (shape.model === 'bed') {
    if (p.style === 'mattress') {
      if (h !== undefined) p.mattressT = Math.max(3, Math.min(40, h));
      if (w !== undefined) p.mattressW = w;
      if (d !== undefined) p.mattressL = d;
    } else {
      if (w !== undefined) p.mattressW = Math.round(Math.max(80, Math.min(220, w - (p.style === 'floor' ? 4 : 8))));
      if (d !== undefined) p.mattressL = Math.round(Math.max(180, Math.min(210, d - Number(p.headT ?? 6) - 6)));
      if (h !== undefined && Number(p.headT ?? 0) === 0) p.frameH = Math.max(4, Math.min(60, h - 25));
    }
  }
  if (shape.model === 'case' && p.fill === 'drawers' && h !== undefined && p.rows === undefined) {
    p.rows = clampInt(h / 20, 1, 8);
  }
  if (shape.model === 'case' && (shape.kind === 'wardrobe' || shape.kind === 'tvStand' || shape.kind === 'shoeCabinet') && w !== undefined) {
    p.cols = clampInt(w / (shape.kind === 'tvStand' ? 45 : 45), shape.kind === 'tvStand' ? 2 : 1, 8);
  }
  if (shape.model === 'case' && shape.kind === 'drawer' && w !== undefined) p.cols = w >= 100 ? 2 : 1;
  if (shape.model === 'sofa' && w !== undefined && !Number.isFinite(Number(p.seats))) p.seats = clampInt(w / 70, 1, 6);
  if (shape.model === 'table' && w !== undefined && d !== undefined && Math.abs(w - d) < 2 && p.shape === 'rect' && /원형|라운드/.test(String(shape.sub))) p.shape = 'round';
  return p;
}
