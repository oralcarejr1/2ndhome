import type { CategoryId, ErgoRole, MatKind, Mount, Product } from '../types';

export interface ImportedProductOption {
  label: string;
  dims?: Partial<Product['dims']>;
  price?: number;
}

export interface ImportedProduct {
  url?: string;
  name?: string;
  brand?: string;
  price?: number;
  category?: CategoryId;
  model?: string;
  mount?: Mount;
  ergo?: ErgoRole;
  dims?: Partial<Product['dims']>;
  color?: string;
  material?: MatKind;
  notes?: string;
  options?: ImportedProductOption[];
  source?: 'page' | 'page+ai' | 'ai-web' | 'text' | 'text+ai' | 'image+ai';
  aiConfigured?: boolean;
  blocked?: boolean;
}

export const VALID_CATEGORIES: readonly CategoryId[] = [
  'sofa', 'chair', 'table', 'desk', 'bed', 'storage', 'shelf', 'lighting',
  'textile', 'plant', 'decor', 'appliance', 'electronics', 'kitchen', 'bath',
  'kids', 'fitness', 'misc',
];

export const VALID_MODELS: readonly string[] = [
  'sofa', 'chair', 'office', 'lounge', 'bench', 'table', 'bed', 'case', 'shelf',
  'rack', 'lamp', 'rug', 'curtain', 'plant', 'frame', 'mirror', 'decor', 'block',
  'appliance', 'screen', 'kitchen', 'bath', 'activity',
];

export const VALID_MOUNTS: readonly Mount[] = ['floor', 'wall', 'ceiling', 'surface'];

export const VALID_ERGO_ROLES: readonly ErgoRole[] = [
  'desk', 'standingDesk', 'diningTable', 'coffeeTable', 'chair', 'officeChair',
  'sofa', 'bed', 'counter', 'vanity', 'tv', 'pendant', 'mirror', 'tallStorage',
  'wardrobe', 'upperCabinet', 'lowTable', 'none',
];

export const VALID_MAT_KINDS: readonly MatKind[] = [
  'fabric', 'boucle', 'velvet', 'leather', 'wood', 'woodDark', 'lacquer', 'metal',
  'chrome', 'brass', 'glass', 'plastic', 'stone', 'marble', 'rattan', 'paper',
  'emissive', 'mirror', 'foliage', 'ceramic',
];

export function normalizeProductUrl(value: string): string {
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('판매 페이지의 http 또는 https 주소를 입력하세요');
  }
  url.hash = '';
  return url.href;
}

/**
 * Extracts a product URL from raw clipboard text (e.g. Ohouse mobile share text like
 * "[오늘의집] 상품명 https://ozip.me/..." or a bare domain like "store.ohou.se/goods/123")
 * and validates it with normalizeProductUrl.
 */
export function extractProductUrl(value: string): string {
  const trimmed = value.trim();
  const embedded = trimmed.match(/https?:\/\/[^\s<>"')\]}]+/i);
  if (embedded) {
    const cleaned = embedded[0].replace(/[.,;:!?]+$/, '');
    return normalizeProductUrl(cleaned);
  }
  if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i.test(trimmed)) {
    return normalizeProductUrl(`https://${trimmed}`);
  }
  return normalizeProductUrl(trimmed);
}

export const MODEL_FOR_CATEGORY: Record<CategoryId, string> = {
  sofa: 'sofa',
  chair: 'chair',
  table: 'table',
  desk: 'table',
  bed: 'bed',
  storage: 'case',
  shelf: 'shelf',
  lighting: 'lamp',
  textile: 'rug',
  plant: 'plant',
  decor: 'decor',
  appliance: 'appliance',
  electronics: 'screen',
  kitchen: 'kitchen',
  bath: 'bath',
  fitness: 'activity',
  kids: 'activity',
  misc: 'block',
};

export interface InferredAttributes {
  category?: CategoryId;
  model?: string;
  mount?: Mount;
  ergo?: ErgoRole;
  material?: MatKind;
  color?: string;
}

// Ordered from specific/compound terms to general terms to avoid misclassifying e.g.
// "소파 테이블" as sofa or "TV 거실장" as electronics.
const CATEGORY_RULES: [CategoryId, RegExp][] = [
  ['lighting', /펜던트|샹들리에|장스탠드|단스탠드|플로어\s*램프|테이블\s*램프|무드등|벽등|천장등|실링팬|식탁\s*(?:등|조명)|조명|\blamp\b|pendant|chandelier/i],
  ['table', /소파\s*테이블|커피\s*테이블|사이드\s*테이블|티\s*테이블|협탁|좌탁|거실\s*테이블|coffee\s*table|side\s*table|nightstand/i],
  ['chair', /식탁\s*의자|책상\s*의자|사무용?\s*의자|컴퓨터\s*의자|게이밍\s*의자|라운지\s*체어|안락\s*의자|바\s*체어|스툴|벤치|오토만|푸프|리클라이너\s*체어|dining\s*chair|office\s*chair|armchair|\bstool\b|\bbench\b|\bottoman\b/i],
  ['storage', /거실장|TV\s*장|티비\s*장|신발장|화장대|드레서|서랍장|와이드\s*체스트|사이드보드|협탁장|수납장|캐비닛|옷장|장롱|붙박이장|키큰장|팬트리장|tv\s*stand|cabinet|wardrobe|dresser|sideboard|chest\s*of\s*drawers|drawers?\b/i],
  ['kitchen', /렌지대|밥솥장|주방\s*수납|아일랜드\s*식탁|조리대|싱크대|홈바|와인랙|kitchen\s*island|pantry/i],
  ['textile', /커튼|커텐|블라인드|러그|카펫|카페트|발매트|\brug\b|carpet|curtain|blind/i],
  ['decor', /전신\s*거울|벽\s*거울|거울|액자|포스터|벽시계|시계|화병|오브제|캔들|디퓨저|\bmirror\b|\bframe\b|clock|vase|decor/i],
  ['desk', /모션\s*데스크|스탠딩\s*데스크|전동\s*책상|컴퓨터\s*책상|책상|데스크|\bdesk\b/i],
  ['sofa', /소파|쇼파|카우치|데이베드|\bsofa\b|\bcouch\b|loveseat|sectional/i],
  ['chair', /의자|체어|리클라이너|\bchair\b|recliner/i],
  ['bed', /침대|매트리스|토퍼|이층침대|침대\s*프레임|\bbed\b|mattress/i],
  ['table', /테이블|식탁|다이닝|콘솔|\btable\b|dining/i],
  ['shelf', /행거|드레스룸|옷걸이|선반|책장|북케이스|북선반|트롤리|이동식\s*카트|수납\s*랙|메탈랙|철제\s*랙|벽선반|\bshelf\b|bookcase|bookshelf|\brack\b|hanger|trolley/i],
  ['storage', /수납|서랍|보관함|정리함|storage/i],
  ['lighting', /스탠드|lighting/i],
  ['textile', /매트/i],
  ['plant', /화분|식물|조화|플랜터|반려식물|나무|\bplant\b|planter/i],
  ['appliance', /냉장고|김치냉장고|세탁기|건조기|워시타워|식기세척기|에어컨|공기청정기|제습기|가습기|청소기|로봇청소기|전자레인지|오븐|인덕션|정수기|스타일러|에어드레서|커피머신|refrigerator|fridge|washer|dryer|dishwasher|air\s*purifier/i],
  ['electronics', /텔레비전|\bTV\b|티비|스마트\s*모니터|모니터|스피커|사운드바|프로젝터|피아노|턴테이블|\bmonitor\b|speaker|piano|projector/i],
  ['bath', /세면대|욕실|욕조|변기|비데|수건걸이|샤워|bathroom|bathtub|vanity/i],
  ['kids', /캣타워|캣휠|고양이|강아지|반려견|반려묘|아기\s*침대|유아|키즈|베이비|cat\s*tower|crib/i],
  ['fitness', /러닝머신|워킹패드|실내\s*자전거|사이클|철봉|치닝디핑|홈트|요가\s*매트|아령|덤벨|treadmill|fitness/i],
];

const MATERIAL_RULES: [MatKind, RegExp][] = [
  ['boucle', /부클레|부클|boucl[eé]/i],
  ['velvet', /벨벳|velvet/i],
  ['leather', /천연\s*가죽|면피|소가죽|인조\s*가죽|가죽|레더|leather/i],
  ['fabric', /패브릭|아쿠아텍스|패브릭|린넨|리넨|코튼|면\s*원단|fabric|linen|cotton/i],
  ['marble', /대리석|마블|세라믹\s*상판|marble/i],
  ['ceramic', /세라믹|포세린|도자기|ceramic|porcelain/i],
  ['glass', /강화\s*유리|유리|글라스|glass/i],
  ['rattan', /라탄|케인|등나무|rattan|cane/i],
  ['woodDark', /월넛|호두나무|다크\s*우드|에스프레소|흑단|walnut/i],
  ['wood', /원목|오크|참나무|애쉬|물푸레|비치|너도밤나무|자작나무|소나무|편백|고무나무|티크|우드|wood|\boak\b|\bash\b|teak|birch|beech/i],
  ['brass', /브라스|황동|골드|brass/i],
  ['chrome', /크롬|스테인리스|스텐|chrome|stainless/i],
  ['metal', /철제|스틸|알루미늄|메탈|분체도장|steel|metal|iron|aluminum/i],
  ['stone', /스톤|테라조|콘크리트|석재|stone|concrete|terrazzo/i],
  ['paper', /한지|페이퍼|종이|paper/i],
  ['plastic', /플라스틱|아크릴|폴리카보네이트|ABS|PP|acrylic|plastic/i],
];

const COLOR_RULES: [string, RegExp][] = [
  ['#f4f2ee', /화이트|순백|\bwhite\b/i],
  ['#efe8dc', /아이보리|크림|오프화이트|밀크|ivory|cream/i],
  ['#d8cbb8', /베이지|샌드|오트밀|린넨|내추럴|beige|sand|oatmeal/i],
  ['#b7b5b0', /라이트\s*그레이|연그레이|실버|light\s*gr[ae]y/i],
  ['#7f8185', /그레이|회색|그레지|\bgr[ae]y\b/i],
  ['#3c3f44', /차콜|다크\s*그레이|진그레이|charcoal|dark\s*gr[ae]y/i],
  ['#222428', /블랙|검정|검은색|\bblack\b/i],
  ['#6b4c35', /월넛|다크\s*브라운|초코|에스프레소|walnut|dark\s*brown/i],
  ['#9e7351', /브라운|카멜|코냑|테라코타|brown|camel|cognac/i],
  ['#c49a6c', /오크|내추럴\s*우드|메이플|\boak\b|maple/i],
  ['#2c3e5a', /네이비|남색|navy/i],
  ['#4e7196', /블루|스카이|코발트|\bblue\b/i],
  ['#48634e', /그린|올리브|카키|포레스트|세이지|민트|green|olive|sage|forest/i],
  ['#c99c9c', /핑크|로즈|코랄|pink|rose/i],
  ['#d4a94f', /옐로우|머스타드|골드|yellow|mustard/i],
  ['#9b3b3b', /레드|버건디|와인|\bred\b|burgundy|wine/i],
];

export function inferProductAttributes(text: string, hintCategory?: CategoryId): InferredAttributes {
  const src = text.trim();
  if (!src && !hintCategory) return {};

  const category = hintCategory ?? CATEGORY_RULES.find(([, re]) => re.test(src))?.[0];

  let model: string | undefined;
  if (/사무용?\s*의자|오피스\s*체어|컴퓨터\s*의자|게이밍\s*의자|책상\s*의자|office\s*chair/i.test(src)) {
    model = 'office';
  } else if (/라운지\s*체어|안락\s*의자|리클라이너|1인\s*소파|lounge\s*chair|armchair|recliner/i.test(src)) {
    model = 'lounge';
  } else if (/벤치|스툴|오토만|푸프|\bbench\b|\bstool\b|\bottoman\b|pouf/i.test(src)) {
    model = 'bench';
  } else if (/행거|옷걸이|드레스룸|hanger|clothes\s*rack/i.test(src)) {
    model = 'rack';
  } else if (/커튼|커텐|블라인드|curtain|blind/i.test(src)) {
    model = 'curtain';
  } else if (/거울|\bmirror\b/i.test(src)) {
    model = 'mirror';
  } else if (/액자|포스터|\bframe\b|poster/i.test(src)) {
    model = 'frame';
  } else if (category) {
    model = MODEL_FOR_CATEGORY[category];
  }

  let mount: Mount | undefined;
  if (/펜던트|천장등|샹들리에|실링팬|pendant|chandelier/i.test(src)) {
    mount = 'ceiling';
  } else if (/벽걸이|벽\s*선반|벽등|벽\s*거울|벽시계|액자|wall[- ]?mount/i.test(src)) {
    mount = 'wall';
  } else if (/단스탠드|탁상|테이블\s*램프|무드등|모니터|table\s*lamp|desk\s*lamp/i.test(src)) {
    mount = 'surface';
  }

  let ergo: ErgoRole | undefined;
  if (/모션\s*데스크|스탠딩\s*데스크|전동\s*책상|높이\s*조절\s*책상|standing\s*desk/i.test(src)) {
    ergo = 'standingDesk';
  } else if (category === 'desk') {
    ergo = 'desk';
  } else if (model === 'office') {
    ergo = 'officeChair';
  } else if (category === 'chair') {
    ergo = 'chair';
  } else if (category === 'sofa') {
    ergo = 'sofa';
  } else if (category === 'bed') {
    ergo = 'bed';
  } else if (category === 'table' && /커피\s*테이블|소파\s*테이블|거실\s*테이블|좌탁|coffee\s*table/i.test(src)) {
    ergo = 'coffeeTable';
  } else if (category === 'table' && /식탁|다이닝\s*테이블|dining\s*table/i.test(src)) {
    ergo = 'diningTable';
  } else if (/옷장|장롱|붙박이장|드레스룸|wardrobe/i.test(src)) {
    ergo = 'wardrobe';
  } else if (model === 'mirror') {
    ergo = 'mirror';
  } else if (mount === 'ceiling' && category === 'lighting') {
    ergo = 'pendant';
  } else if (/\bTV\b|티비|텔레비전/i.test(src) && category === 'electronics') {
    ergo = 'tv';
  } else if (/조리대|아일랜드|싱크대|counter/i.test(src)) {
    ergo = 'counter';
  } else if (/화장대|세면대|vanity/i.test(src)) {
    ergo = 'vanity';
  }

  const material = MATERIAL_RULES.find(([, re]) => re.test(src))?.[0];
  const color = COLOR_RULES.find(([, re]) => re.test(src))?.[0];

  return {
    ...(category ? { category } : {}),
    ...(model ? { model } : {}),
    ...(mount ? { mount } : {}),
    ...(ergo ? { ergo } : {}),
    ...(material ? { material } : {}),
    ...(color ? { color } : {}),
  };
}
