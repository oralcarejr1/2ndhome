import {
  inferProductAttributes,
  type ImportedProduct,
  type ImportedProductOption,
} from '../src/lib/productImport.js';

export const MARKETPLACE_BRAND =
  /^(오늘의집|ohouse|네이버(\s*스마트스토어|\s*쇼핑)?|스마트스토어|쿠팡|coupang|11번가|g마켓|옥션|ssg(\.com)?|롯데온|카카오(톡\s*쇼핑하기)?|29cm|무신사|집꾸미기|amazon|ebay)$/i;

export const TITLE_SITE_SUFFIX =
  /\s*(?:[|\-–—·:]\s*(?:오늘의집(?:\s*스토어)?|ohouse|네이버\s*스마트스토어|스마트스토어|네이버\s*쇼핑|쿠팡|coupang|11번가|g마켓|옥션|ssg\.com|롯데온|29cm|무신사|집꾸미기|ikea(?:\s*코리아|\s*kr)?|이케아(?:\s*코리아)?|한샘몰|한샘|일룸|현대리바트|리바트|까사미아|무인양품|muji))+\s*$/i;

export const PROMO_BRACKET =
  /^(?:오늘의집\s*단독|단독|공식|정품|무료배송|무배|당일발송|당일출고|오늘출발|빠른배송|예약배송|사전예약|특가|오늘의딜|타임특가|할인|쿠폰|쿠폰할인|추가할인|최대할인|신상|베스트|인기|한정|한정수량|증정|사은품|리뷰이벤트|세트|1\+1|2\+1|MD추천|BEST|NEW|HOT|SALE|FREE)$/i;

const UNIT_FACTOR: Record<string, number> = {
  mm: 0.1,
  mmt: 0.1,
  밀리미터: 0.1,
  밀리: 0.1,
  cm: 1,
  cmt: 1,
  센티미터: 1,
  센치: 1,
  센티: 1,
  m: 100,
  mtr: 100,
  미터: 100,
  in: 2.54,
  inch: 2.54,
  inches: 2.54,
  inh: 2.54,
  인치: 2.54,
};

const EXCLUDE_DIM_CONTEXT =
  /(?:좌면|좌석|시트|등받이|팔걸이|다리|하부|선반\s*간격|포장|박스|패키지|택배|배송|seat\s*height|arm\s*height|leg\s*height|package|box)/i;

export function cleanText(value: unknown, max = 300): string | undefined {
  if (typeof value !== 'string') return;
  return (
    value
      .replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi, (entity, num, name) => {
        if (num) {
          const code = num[0].toLowerCase() === 'x' ? parseInt(num.slice(1), 16) : Number(num);
          return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
        }
        return (
          ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' } as Record<string, string>)[
            name.toLowerCase()
          ] ?? entity
        );
      })
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max) || undefined
  );
}

export function cleanTitleAndBrand(rawTitle?: string, rawBrand?: string): { name?: string; brand?: string } {
  let brand = rawBrand ? cleanText(rawBrand, 80) : undefined;
  if (brand && MARKETPLACE_BRAND.test(brand)) brand = undefined;

  let name = rawTitle ? cleanText(rawTitle, 240) : undefined;
  if (!name) return { brand: brand ? cleanBrandName(brand) : undefined };

  name = name.replace(TITLE_SITE_SUFFIX, '').trim();

  // Strip leading promo brackets ([오늘의집 단독], [무료배송]) and capture [브랜드] when brand is missing.
  let guard = 0;
  while (guard++ < 5) {
    const m = /^\[([^\]]{1,40})\]\s*/.exec(name);
    if (!m) break;
    const tag = m[1].trim();
    if (PROMO_BRACKET.test(tag)) {
      name = name.slice(m[0].length).trim();
    } else if (brand && tag.toLowerCase() === brand.toLowerCase()) {
      name = name.slice(m[0].length).trim();
    } else if (!brand && !MARKETPLACE_BRAND.test(tag) && !/\d{2,}%|할인|증정|배송|단독|특가|쿠폰|이벤트/.test(tag)) {
      brand = tag;
      name = name.slice(m[0].length).trim();
      break;
    } else {
      break;
    }
  }

  name = stripPromoText(name);
  if (brand) brand = cleanBrandName(brand);
  if (name && brand && name.toLowerCase().startsWith(`${brand.toLowerCase()} `) && name.length > brand.length + 4) {
    name = name.slice(brand.length).trim();
  }

  return { name: name || undefined, brand };
}

const PROMO_WORD =
  /(?:단독|특가|할인|쿠폰|증정|사은품|이벤트|무료\s*(?:배송|설치|내림|조립)|무배|당일|오늘\s*출발|빠른\s*배송|지정일|예약|한정|타임|비노출|혜택|적립|리뷰|최저가|BEST|SALE|HOT|NEW)/i;

/** Removes marketplace promo noise anywhere in a product title. */
export function stripPromoText(raw: string): string {
  let s = raw;
  // [오늘의집 단독] [무료설치] [사은품증정] … anywhere; keep non-promo brackets like [3인]
  s = s.replace(/\[([^\]]{1,30})\]\s*/g, (m, inner: string) => (PROMO_WORD.test(inner) || /^오늘의집/.test(inner) ? ' ' : m));
  // (쿠션 증정) (스툴선택) (방수커버 포함 이벤트)
  s = s.replace(/\(([^)]{1,30})\)/g, (m, inner: string) => (PROMO_WORD.test(inner) ? ' ' : m));
  // leading price/coupon segments: "할인가 159,900원/", "혜택가 52.7만/", "20%쿠폰ㅣ", "단하루 103,200원 "
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(/^\s*[^/ㅣ|]{0,24}?(?:\d[\d,.]*\s*(?:원|만원?|%)|쿠폰|특가|할인)[^/ㅣ|]{0,12}?\s*[/ㅣ|]\s*/, '');
    s = s.replace(/^\s*(?:단하루|오늘만|역대급|초특가|특가|최저가)\s*\d[\d,.]*\s*(?:원|만원?)\s*/, '');
    if (s === before) break;
  }
  s = s.replace(/\s*\d{1,2}\s*colou?rs?\b/gi, ' ');
  s = s.replace(/\s*\d{1,2}\s*컬러(?=\s|$)/g, ' ');
  return s.replace(/\s+/g, ' ').replace(/^[\s/|,·-]+|[\s/|,·-]+$/g, '').trim();
}

/** "파로마 공식스토어" → "파로마" */
export function cleanBrandName(raw: string): string {
  const s = raw
    .replace(/\s*(?:공식\s*(?:스토어|몰|판매처|인증\s*스토어)|official\s*store|스토어|몰)$/i, '')
    .trim();
  return s || raw.trim();
}

export function toCm(value: unknown, unit: unknown, maxCm = 10000): number | undefined {
  const f = UNIT_FACTOR[String(unit ?? '').trim().toLowerCase()];
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(/,/g, ''));
  if (f && Number.isFinite(n) && n * f >= 0.5 && n * f <= maxCm) {
    return Math.round(n * f * 10) / 10;
  }
}

function isVerticalFlatItem(context: string): boolean {
  return /거울|액자|포스터|커튼|커텐|블라인드|벽시계|mirror|frame|poster|curtain|blind/i.test(context);
}

function extractUnitHint(text: string): string | undefined {
  const m =
    /(?:단위\s*[:：]?\s*|[\(\[]\s*)(?:(mm|cm|m|inches|inch|in)(?![a-zA-Z])|(밀리미터|센티미터|미터|인치))(?:\s*[\)\]]|\b)?/i.exec(text) ??
    /\b(mm|cm|inch)\b/i.exec(text);
  return (m?.[1] ?? m?.[2])?.toLowerCase();
}

export function extractDimensionsFromText(
  text: string,
  contextHint = '',
): { dims?: Partial<{ w: number; d: number; h: number }>; options?: ImportedProductOption[] } {
  const verticalFlat = isVerticalFlatItem(`${contextHint} ${text.slice(0, 400)}`);
  let w: number | undefined;
  let d: number | undefined;
  let h: number | undefined;
  const options: ImportedProductOption[] = [];
  const seenOptions = new Set<string>();

  const setAxis = (axis: 'w' | 'd' | 'h', val: number | undefined) => {
    if (val === undefined) return;
    if (axis === 'w' && w === undefined) w = val;
    if (axis === 'd' && d === undefined) d = val;
    if (axis === 'h' && h === undefined) h = val;
  };

  const parseExpr = (
    snippet: string,
    defaultUnit?: string,
    bareMm = false,
  ): Partial<{ w: number; d: number; h: number }> | undefined => {
    const localUnit = extractUnitHint(snippet) ?? defaultUnit;
    // Korean spec sheets often omit the unit: "1130*2160*1000" or "W2810 D970" are millimetres.
    const bare = (v: string) => {
      const n = Number(v.replace(/,/g, ''));
      return bareMm && Number.isFinite(n) && n >= 100 && n <= 9999 ? (n >= 250 ? 'mm' : 'cm') : undefined;
    };
    let lw: number | undefined;
    let ld: number | undefined;
    let lh: number | undefined;

    // 1) Explicit W / D / H labeled expression in any order:
    //    "W2100 x D950 x H850 mm", "W1200xD600xH750mm", "가로 120 × 세로 60 × 높이 75cm", "폭 228cm 깊이 95cm 높이 83cm"
    const labeledMatches = [
      ...snippet.matchAll(
        /(?:^|[\s(/,·×*:：-]|(?<=\d)[xX])(가로|폭|너비|넓이|width|W|깊이|안길이|depth|D|세로|길이|length|L|총\s*높이|전체\s*높이|높이|height|H|지름|직경|diameter|[ØΦ])\s*(?:\([^)]{0,12}\))?\s*[:：=]?\s*(\d{1,3}(?:,\d{3})+|\d{1,4}(?:\.\d{1,2})?)\s*(?:(mm|cm|m|inches|inch|in)(?![a-zA-Z])|(밀리미터|센티미터|미터|인치))?/gi,
      ),
    ];

    if (labeledMatches.length >= 2) {
      const trailingUnit = /(?:\d\s*[\(\[\)\]]?\s*)(?:(mm|cm|m|inches|inch|in)(?![a-zA-Z])|(밀리미터|센티미터|미터|인치))/i.exec(snippet);
      const explicitUnit =
        labeledMatches.find((m) => m[3])?.[3] ??
        labeledMatches.find((m) => m[4])?.[4] ??
        trailingUnit?.[1] ??
        trailingUnit?.[2] ??
        localUnit;

      const hasHeightLabel = labeledMatches.some((m) => /^(?:총\s*높이|전체\s*높이|높이|height|h)$/i.test(m[1]));

      for (const m of labeledMatches) {
        const prefix = snippet.slice(Math.max(0, (m.index ?? 0) - 10), m.index ?? 0);
        if (EXCLUDE_DIM_CONTEXT.test(prefix)) continue;
        const label = m[1].toLowerCase().replace(/\s+/g, '');
        const u = m[3] ?? m[4] ?? explicitUnit ?? (labeledMatches.every((x) => Number(x[2].replace(/,/g, '')) >= 250) ? bare(m[2]) : undefined);
        const cm = toCm(m[2], u, 1000);
        if (cm === undefined) continue;

        if (/^(?:지름|직경|diameter|ø|φ)$/.test(label)) {
          lw ??= cm;
          ld ??= cm;
        } else if (/^(?:가로|폭|너비|넓이|width|w)$/.test(label)) {
          lw ??= cm;
        } else if (/^(?:깊이|안길이|depth|d)$/.test(label)) {
          ld ??= cm;
        } else if (/^(?:세로|길이|length|l)$/.test(label)) {
          if (!hasHeightLabel && verticalFlat) lh ??= cm;
          else ld ??= cm;
        } else if (/^(?:총높이|전체높이|높이|height|h)$/.test(label)) {
          lh ??= cm;
        }
      }
      if (lw !== undefined || ld !== undefined || lh !== undefined) {
        return {
          ...(lw !== undefined ? { w: lw } : {}),
          ...(ld !== undefined ? { d: ld } : {}),
          ...(lh !== undefined ? { h: lh } : {}),
        };
      }
    }

    // 2) Diameter + height: "Ø800 × H750mm" or "지름 80cm"
    const diam =
      /(?:지름|직경|diameter|[ØΦ])\s*[:：=]?\s*(\d{1,3}(?:,\d{3})+|\d{1,4}(?:\.\d{1,2})?)\s*(?:(mm|cm|m|inches|inch|in)(?![a-zA-Z])|(밀리미터|센티미터|미터|인치))?/i.exec(
        snippet,
      );
    if (diam) {
      const u = diam[2] ?? diam[3] ?? localUnit;
      const cm = toCm(diam[1], u, 1000);
      if (cm !== undefined) {
        lw = cm;
        ld = cm;
        const hMatch =
          /(?:높이|height|(?:^|[\s×xX*])H)\s*[:：=]?\s*(\d{1,3}(?:,\d{3})+|\d{1,4}(?:\.\d{1,2})?)\s*(?:(mm|cm|m|inches|inch|in)(?![a-zA-Z])|(밀리미터|센티미터|미터|인치))?/i.exec(
            snippet,
          );
        if (hMatch) lh = toCm(hMatch[1], hMatch[2] ?? hMatch[3] ?? u, 1000);
        return { w: lw, d: ld, ...(lh !== undefined ? { h: lh } : {}) };
      }
    }

    // 3) Triplet "N1 × N2 × N3 unit" (e.g. "2,100 x 950 x 850 mm", "120*60*75cm")
    const triplet =
      /(?:^|[^\d.])(\d{1,3}(?:,\d{3})+|\d{1,4}(?:\.\d{1,2})?)\s*(mm|cm|m|inch|in)?\s*[xX×*]\s*(\d{1,3}(?:,\d{3})+|\d{1,4}(?:\.\d{1,2})?)\s*(mm|cm|m|inch|in)?\s*[xX×*]\s*(\d{1,3}(?:,\d{3})+|\d{1,4}(?:\.\d{1,2})?)\s*(?:\(\s*)?(?:(mm|cm|m|inches|inch|in)(?![a-zA-Z])|(밀리미터|센티미터|미터|인치))?(?:\s*\))?(?!\s*px)/i.exec(
        snippet,
      );
    if (triplet) {
      const nums = [triplet[1], triplet[3], triplet[5]].map((v) => Number(v.replace(/,/g, '')));
      const bareUnit = nums.every((n) => n >= 100) && Math.max(...nums) >= 300 ? bare(triplet[1]) && 'mm' : undefined;
      const u = triplet[6] ?? triplet[7] ?? triplet[4] ?? triplet[2] ?? localUnit ?? bareUnit;
      if (u) {
        lw = toCm(triplet[1], triplet[2] ?? u, 1000);
        ld = toCm(triplet[3], triplet[4] ?? u, 1000);
        lh = toCm(triplet[5], triplet[6] ?? triplet[7] ?? u, 1000);
        if (lw !== undefined && ld !== undefined && lh !== undefined) {
          return { w: lw, d: ld, h: lh };
        }
      }
    }

    // 4) 2D pair "N1 × N2 unit" (e.g. "120 x 60 cm", "2000x1500mm")
    const pair =
      /(?:^|[^\d.])(\d{1,3}(?:,\d{3})+|\d{1,4}(?:\.\d{1,2})?)\s*(mm|cm|m|inch|in)?\s*[xX×*]\s*(\d{1,3}(?:,\d{3})+|\d{1,4}(?:\.\d{1,2})?)\s*(?:(mm|cm|m|inches|inch|in)(?![a-zA-Z])|(밀리미터|센티미터|미터|인치))(?!\s*px)/i.exec(
        snippet,
      );
    if (pair) {
      const u = pair[4] ?? pair[5] ?? pair[2];
      lw = toCm(pair[1], pair[2] ?? u, 1000);
      const second = toCm(pair[3], u, 1000);
      if (lw !== undefined && second !== undefined) {
        return verticalFlat ? { w: lw, h: second } : { w: lw, d: second };
      }
    }

    return undefined;
  };

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let sectionUnit: string | undefined;

  for (const line of lines) {
    if (/(?:단위\s*[:：]?\s*|[\(\[]\s*)(mm|cm|m|inch)\b/i.test(line)) {
      sectionUnit = extractUnitHint(line) ?? sectionUnit;
    }

    // Named size option lines (e.g. "3인용: W2100 x D950 x H850 mm (890,000원)" or "1200형 (120x60x75cm)")
    const optMatch =
      /^([가-힣A-Za-z0-9./+\-\s]{1,28}?)\s*(?:[:：]|[-–—]|\()\s*(.{6,120})$/.exec(line);
    if (optMatch) {
      const label = optMatch[1].trim();
      if (
        /(?:인용|형|사이즈|옵션|타입|모델|\bSS\b|\bS\b|\bQ\b|\bK\b|\bLK\b|\bEK\b|싱글|슈퍼싱글|퀸|킹|대형|중형|소형|미니|와이드|기본|스툴|카우치|코너|\d{3,4})/i.test(
          label,
        ) &&
        !EXCLUDE_DIM_CONTEXT.test(label) &&
        !/^(?:크기|사이즈|규격|치수|제품크기|전체크기|외경|내경|size|dimensions?)$/i.test(label)
      ) {
        const optDims = parseExpr(optMatch[2], sectionUnit, true);
        if (optDims && (optDims.w !== undefined || optDims.d !== undefined || optDims.h !== undefined)) {
          const key = `${label}:${optDims.w ?? ''}:${optDims.d ?? ''}:${optDims.h ?? ''}`;
          if (!seenOptions.has(key) && options.length < 12) {
            seenOptions.add(key);
            const priceMatch = /(\d{1,3}(?:,\d{3})+)\s*원/.exec(line);
            const optPrice = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : undefined;
            options.push({
              label,
              dims: optDims,
              ...(optPrice && optPrice >= 1000 ? { price: optPrice } : {}),
            });
          }
        }
      }
    }

    const isSpecLine = /(?:크기|사이즈|규격|제품\s*크기|전체\s*크기|치수|외경|size|dimensions?|가로|폭|깊이|높이|지름|\bW\s*\d)/i.test(line);
    if (isSpecLine && !EXCLUDE_DIM_CONTEXT.test(line)) {
      const found = parseExpr(line, sectionUnit, true);
      if (found) {
        setAxis('w', found.w);
        setAxis('d', found.d);
        setAxis('h', found.h);
      }
    }

    if (!EXCLUDE_DIM_CONTEXT.test(line)) {
      const single =
        /^(?:전체\s*|총\s*|제품\s*)?(가로|폭|너비|넓이|width|깊이|안길이|depth|세로|길이|length|높이|height|지름|직경|diameter)\s*(?:\([^)]{0,12}\))?\s*[:：=]\s*(\d{1,3}(?:,\d{3})+|\d{1,4}(?:\.\d{1,2})?)\s*(?:(mm|cm|m|inches|inch|in)(?![a-zA-Z])|(밀리미터|센티미터|미터|인치))?/i.exec(
          line,
        );
      if (single) {
        const label = single[1].toLowerCase();
        const cm = toCm(single[2], single[3] ?? single[4] ?? sectionUnit, 1000);
        if (cm !== undefined) {
          if (/^(?:지름|직경|diameter)$/.test(label)) {
            setAxis('w', cm);
            setAxis('d', cm);
          } else if (/^(?:가로|폭|너비|넓이|width)$/.test(label)) {
            setAxis('w', cm);
          } else if (/^(?:깊이|안길이|depth)$/.test(label)) {
            setAxis('d', cm);
          } else if (/^(?:세로|길이|length)$/.test(label)) {
            if (verticalFlat) setAxis('h', cm);
            else setAxis('d', cm);
          } else if (/^(?:높이|height)$/.test(label)) {
            setAxis('h', cm);
          }
        }
      }
    }
  }

  if (w === undefined || d === undefined || h === undefined) {
    const whole = parseExpr(text);
    if (whole) {
      setAxis('w', whole.w);
      setAxis('d', whole.d);
      setAxis('h', whole.h);
    }
  }

  if (options.length > 0 && (w === undefined || d === undefined || h === undefined)) {
    const first = options[0].dims;
    if (first) {
      setAxis('w', first.w);
      setAxis('d', first.d);
      setAxis('h', first.h);
    }
  }

  const dims =
    w !== undefined || d !== undefined || h !== undefined
      ? {
          ...(w !== undefined ? { w } : {}),
          ...(d !== undefined ? { d } : {}),
          ...(h !== undefined ? { h } : {}),
        }
      : undefined;

  return {
    ...(dims ? { dims } : {}),
    ...(options.length > 1 ? { options } : {}),
  };
}

export function extractPriceFromText(text: string): number | undefined {
  if (!/원|₩|KRW/i.test(text)) return undefined;

  const labeledPatterns = [
    /(?:최종\s*혜택가|혜택가|오늘의집가|최종가|쿠폰\s*적용가|할인가|판매가|특가|가격)\s*[:：]?\s*₩?\s*(\d{1,3}(?:,\d{3})+)\s*원?/gi,
    /(\d{1,3}(?:,\d{3})+)\s*원\s*(?:\(\s*할인가|\(\s*혜택가|최종)/gi,
  ];
  for (const re of labeledPatterns) {
    for (const m of text.matchAll(re)) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n >= 1000 && n <= 500_000_000) return n;
    }
  }

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (/(?:배송비|설치비|사다리차|적립|포인트|캐시백|쿠폰\s*할인|최대\s*\d+%\s*할인|월\s*\d)/i.test(line)) continue;
    const m = /₩?\s*(\d{1,3}(?:,\d{3})+)\s*원/.exec(line);
    if (m) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n >= 5000 && n <= 500_000_000) return n;
    }
  }
  return undefined;
}

/**
 * Deterministic furniture parser for plain text (either extracted from HTML
 * or pasted directly by the user from any furniture store webpage).
 */
export function parseProductText(rawText: string, url?: string): ImportedProduct {
  const text = rawText.replace(/\r\n/g, '\n').trim();
  if (!text) return url ? { url } : {};

  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  let brand: string | undefined;
  let name: string | undefined;

  for (const line of lines.slice(0, 40)) {
    const brandMatch = /^(?:브랜드|제조사|제조자|판매자|brand)\s*[:：]\s*(.+)$/i.exec(line);
    if (brandMatch && !brand) {
      const b = cleanText(brandMatch[1], 80);
      if (b && !MARKETPLACE_BRAND.test(b)) brand = b;
    }
    const nameMatch = /^(?:상품명|제품명|품명|product\s*name)\s*[:：]\s*(.+)$/i.exec(line);
    if (nameMatch && !name) {
      name = cleanText(nameMatch[1], 200);
    }
  }

  if (!name) {
    const candidate = lines.find(
      (l) =>
        l.length >= 4 &&
        l.length <= 160 &&
        !/^(?:브랜드|제조사|제조자|판매자|배송비|배송|할인가|판매가|최종가|최종혜택가|혜택가|가격|크기|사이즈|규격|치수|단위|색상|소재|재질|brand|price|size|dimensions?)\s*[:：]/i.test(l) &&
        !/^(?:로그인|회원가입|장바구니|검색|메뉴|홈|카테고리|오늘의집|배송|리뷰|문의|공유|찜|구매하기|바로구매|\d{1,3}(?:,\d{3})+\s*원|\d+%)$/.test(l),
    );
    if (candidate) name = candidate;
  }

  const cleaned = cleanTitleAndBrand(name, brand);
  name = cleaned.name;
  brand = cleaned.brand;

  const price = extractPriceFromText(text);
  const { dims, options } = extractDimensionsFromText(text, name ?? '');
  const attrsInferred = inferProductAttributes(`${name ?? ''} ${text.slice(0, 600)}`);

  return {
    ...(url ? { url } : {}),
    ...(name ? { name } : {}),
    ...(brand ? { brand } : {}),
    ...(price !== undefined ? { price } : {}),
    ...attrsInferred,
    ...(dims ? { dims } : {}),
    ...(options ? { options } : {}),
  };
}
