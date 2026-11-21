import type { ParamValue } from '../types';
import { BED_SIZES, bedSizeCode, type Axis, type Dims, type ShapeResult } from './productShape.js';

export interface ParsedOption {
  label: string;
  dims?: Dims;
  params?: Record<string, ParamValue>;
  /** dims come from a standard size table (e.g. 퀸 = 150×200), not from the page */
  estimated?: Axis[];
}

const COLOR_WORDS =
  /(?:라이트|다크|딥|웜|쿨|소프트|크림|샌드|오트밀|머스타드|올리브|세이지|스카이|코발트|로즈|코랄|모카|카멜|코냑|챠콜|차콜|그레이|그레이쉬|그레이지|베이지|아이보리|화이트|블랙|브라운|네이비|그린|블루|핑크|레드|버건디|옐로우|오렌지|실버|골드|민트|퍼플|라벤더|월넛|오크|내추럴|내츄럴|메이플|체리|티크|애쉬|멀바우|헤이즐넛|우드|마블|무광|유광|화이트오크|크림화이트|웜그레이|라이트그레이|다크그레이|크림아이보리|우드내추럴|워시그레이)(?=\s|$|\)|,|\/)/g;

function stripColors(label: string): string {
  return label
    .replace(/\[[^\]]*(?:증정|사은품|특가|이벤트|비노출)[^\]]*\]/g, ' ')
    .replace(/\([^)]*(?:증정|사은품|특가|이벤트|포함)[^)]*\)/g, ' ')
    .replace(/[가-힣]*(?:화이트|블랙|그레이|베이지|아이보리|브라운|네이비|그린|블루|핑크|월넛|오크|내추럴|내츄럴|헤이즐넛|크림|카멜|우드|마블)[가-힣]*/g, ' ')
    .replace(COLOR_WORDS, ' ')
    .replace(/\s*[+/]\s*(?=$|\s)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s/|,·-]+|[\s/|,·-]+$/g, '')
    .trim();
}

const toCmFromBare = (n: number) => (n >= 300 ? n / 10 : n);

/** Reads the size meaning of one store option label. */
export function parseOptionLabel(raw: string, shape?: ShapeResult, perCode?: Record<string, Dims>): ParsedOption | undefined {
  const label = raw.replace(/\s+/g, ' ').trim();
  const dims: Dims = {};
  const params: Record<string, ParamValue> = {};
  const estimated: Axis[] = [];

  // explicit "1200*800", "1200x600x750", "W1200 D600"
  const tri = /(\d{2,4}(?:\.\d)?)\s*[*xX×]\s*(\d{2,4}(?:\.\d)?)(?:\s*[*xX×]\s*(\d{2,4}(?:\.\d)?))?\s*(mm|cm)?/.exec(label);
  if (tri) {
    const unit = tri[4]?.toLowerCase();
    const conv = (v: string) => (unit === 'cm' ? Number(v) : unit === 'mm' ? Number(v) / 10 : toCmFromBare(Number(v)));
    dims.w = conv(tri[1]);
    dims.d = conv(tri[2]);
    if (tri[3]) dims.h = conv(tri[3]);
  }

  // bed / mattress size codes
  const isBed = shape?.model === 'bed';
  const code = isBed ? bedSizeCode(label.replace(/\d+\s*cm/gi, ' ')) : undefined;
  if (code && BED_SIZES[code]) {
    const known = perCode?.[code];
    if (known) Object.assign(dims, known);
    if (shape?.params.style === 'mattress') {
      if (!known) {
        dims.w = BED_SIZES[code].w;
        dims.d = BED_SIZES[code].l;
        estimated.push('w', 'd');
      }
    } else {
      params.mattressW = BED_SIZES[code].w;
      params.mattressL = BED_SIZES[code].l;
    }
    const t = /(\d{1,2}(?:\.\d)?)\s*cm/i.exec(label);
    if (t && shape?.params.style === 'mattress') dims.h = Number(t[1]);
  }
  const bedH = isBed ? /높이\s*(\d{1,4}(?:\.\d)?)\s*(mm|cm)?/.exec(label) : null;
  if (bedH) {
    const v = Number(bedH[1]);
    const cm = bedH[2] === 'cm' ? v : bedH[2] === 'mm' ? v / 10 : v >= 100 ? v / 10 : v;
    if (shape?.params.style === 'mattress') dims.h = cm;
    else if (cm >= 60) dims.h = cm; // "일반헤드형(높이920)" is the headboard top; 25/45cm is the frame
    else params.frameH = cm;
  }

  // leading width "800 (3단)", "1200 화이트", "400 2단행거장"
  if (dims.w === undefined && !code) {
    const lead = /(?:^|\s|\()(\d{3,4})(?:\s*(?:mm|폭|형))?(?=\s|\(|\)|$|\/|,)/.exec(label);
    if (lead) {
      const v = Number(lead[1]);
      if (v >= 300 && v <= 4000) dims.w = v / 10;
    }
  }

  if (isBed && /무헤드|헤드\s*없/.test(label)) params.headT = 0;
  else if (isBed && /(?<!무)헤드/.test(label)) params.headT = 10;
  const tiers = /(\d{1,2})\s*단(?!\s*(?:높이|접이|폴딩|행거))/.exec(label);
  if (tiers && shape?.model === 'case' && shape.kind !== 'wardrobe') params.rows = Math.min(10, Number(tiers[1]));
  const seats = /(\d)\s*인/.exec(label);
  if (seats && shape?.model === 'sofa') params.seats = Number(seats[1]);

  if (!Object.keys(dims).length && !Object.keys(params).length) return undefined;
  const short = (stripColors(label) || label).replace(/(\d)\s*CM\b/g, '$1cm').replace(/\(\s*\)/g, '').trim();
  return {
    label: short.slice(0, 40),
    ...(Object.keys(dims).length ? { dims } : {}),
    ...(Object.keys(params).length ? { params } : {}),
    ...(estimated.length ? { estimated } : {}),
  };
}

/** Distinct size options from store option labels (colour-only differences collapse). */
export function parseOptionLabels(labels: string[], shape?: ShapeResult, perCode?: Record<string, Dims>): ParsedOption[] {
  const out: ParsedOption[] = [];
  const seen = new Set<string>();
  for (const raw of labels.slice(0, 80)) {
    const o = parseOptionLabel(raw, shape, perCode);
    if (!o) continue;
    const key = JSON.stringify([o.dims, o.params]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
    if (out.length >= 12) break;
  }
  return out;
}

/** "SS : 1130*2160*1000\nQ : 1530*2160*1000" → { SS: {...}, Q: {...} } */
export function perCodeDims(text: string): Record<string, Dims> {
  const out: Record<string, Dims> = {};
  for (const line of text.split(/\n|,(?=\s*[A-Z]{1,2}\s*[:：])/)) {
    const m = /^\s*(MS|SS|QK|LK|EK|CK|S|D|Q|K)\s*[:：)]\s*(?:W\s*)?(\d{3,4})\s*[*xX×]\s*(?:D\s*|L\s*)?(\d{3,4})(?:\s*[*xX×]\s*(?:H\s*)?(\d{3,4}))?/i.exec(line);
    if (m) out[m[1].toUpperCase()] = { w: Number(m[2]) / 10, d: Number(m[3]) / 10, ...(m[4] ? { h: Number(m[4]) / 10 } : {}) };
  }
  return out;
}
