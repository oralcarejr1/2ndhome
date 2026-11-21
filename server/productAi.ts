import {
  VALID_CATEGORIES,
  VALID_ERGO_ROLES,
  VALID_MAT_KINDS,
  VALID_MODELS,
  VALID_MOUNTS,
  type ImportedProduct,
  type ImportedProductOption,
} from '../src/lib/productImport.js';
import type { CategoryId, ErgoRole, MatKind, Mount } from '../src/types.js';

export type AiProvider = 'gemini' | 'openai' | 'anthropic';

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface InlineImage {
  mimeType: string;
  base64: string;
}

const MARKETPLACE_BRAND = /^(오늘의집|ohouse|네이버(\s*스마트스토어|\s*쇼핑)?|스마트스토어|쿠팡|coupang|11번가|g마켓|옥션|ssg(\.com)?|롯데온|카카오(톡\s*쇼핑하기)?|29cm|무신사|집꾸미기|amazon|ebay)$/i;

const CATEGORY_SET = new Set<string>(VALID_CATEGORIES);
const MODEL_SET = new Set<string>(VALID_MODELS);
const MOUNT_SET = new Set<string>(VALID_MOUNTS);
const ERGO_SET = new Set<string>(VALID_ERGO_ROLES);
const MAT_SET = new Set<string>(VALID_MAT_KINDS);

type Env = Record<string, string | undefined>;
const currentEnv = (): Env => (typeof process !== 'undefined' && process.env ? (process.env as Env) : {});

export function getAiConfig(env: Env = currentEnv()): AiConfig | null {
  const geminiKey = (env.GEMINI_API_KEY || env.GOOGLE_API_KEY || '').trim();
  if (geminiKey) {
    return {
      provider: 'gemini',
      apiKey: geminiKey,
      model: (env.GEMINI_MODEL || env.AI_MODEL || 'gemini-4-hydrogen').trim(),
    };
  }
  const openaiKey = (env.OPENAI_API_KEY || '').trim();
  if (openaiKey) {
    return {
      provider: 'openai',
      apiKey: openaiKey,
      model: (env.OPENAI_MODEL || env.AI_MODEL || 'gpt-6-luna').trim(),
      baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/+$/, ''),
    };
  }
  const anthropicKey = (env.ANTHROPIC_API_KEY || '').trim();
  if (anthropicKey) {
    return {
      provider: 'anthropic',
      apiKey: anthropicKey,
      model: (env.ANTHROPIC_MODEL || env.AI_MODEL || 'claude-haiku-5-5').trim(),
    };
  }
  return null;
}

export function isAiConfigured(env: Env = currentEnv()): boolean {
  return getAiConfig(env) !== null;
}

const SYSTEM_INSTRUCTION = `You extract structured furniture/home-product specifications for a 3D Korean interior planner (2ndhome).
Return ONLY a single valid JSON object with this schema (use null for any field not explicitly supported by the provided text/images):
{
  "name": string | null,        // clean product name without promo tags like [오늘의집 단독], [무료배송], [특가]
  "brand": string | null,       // actual manufacturer/brand name (NEVER marketplace names like 오늘의집, 쿠팡, 네이버 스마트스토어)
  "price": number | null,       // KRW integer only (e.g. 549000). Use sale/selling price if shown. NEVER convert foreign currencies (USD/EUR/JPY -> null).
  "category": one of [${VALID_CATEGORIES.join(', ')}] | null,
  "model": one of [${VALID_MODELS.join(', ')}] | null,
  "mount": one of ["floor", "wall", "ceiling", "surface"] | null,
  "ergo": one of [${VALID_ERGO_ROLES.join(', ')}] | null,
  "dims": { "w": number | null, "d": number | null, "h": number | null }, // ALWAYS in centimeters (cm)! Convert mm ÷ 10, m × 100, inch × 2.54. w=가로/폭/width, d=깊이/세로/depth, h=높이/height. For round items with diameter, set both w and d to diameter.
  "color": string | null,       // approximate #rrggbb hex of the main body finish/fabric/wood if mentioned or clearly visible
  "material": one of [${VALID_MAT_KINDS.join(', ')}] | null,
  "notes": string | null,       // brief Korean note (<= 120 chars) summarizing material, key option notes, or seat height if shown
  "options": [                  // optional list (up to 10) if multiple distinct size/price options exist (e.g. 2인용/3인용/4인용, SS/Q/K, 1200/1400)
    { "label": string, "dims": { "w": number | null, "d": number | null, "h": number | null }, "price": number | null }
  ]
}
CRITICAL RULES:
1. NEVER guess, estimate, or hallucinate dimensions or prices. Only output numbers explicitly stated in the text or visibly readable in the attached images.
2. Pay close attention to Korean furniture size diagrams/tables in images (e.g., W2100×D950×H850mm -> w: 210, d: 95, h: 85; 가로 120 × 세로 60 × 높이 75cm -> w: 120, d: 60, h: 75).
3. Ignore packaging/box dimensions, delivery fees, coupon amounts, pixel sizes, and unrelated recommended products.
4. For Korean furniture, "세로" in top-view specs (tables, desks, beds, rugs, cabinets) usually means depth (d), while "높이" is height (h). For vertical flat items (mirrors, wall frames), "세로" is height (h).`;

function cleanStr(v: unknown, max = 240): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, ' ').trim().slice(0, max);
  return s || undefined;
}

function cleanDim(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : NaN;
  if (!Number.isFinite(n) || n < 0.5 || n > 1000) return undefined;
  return Math.round(n * 10) / 10;
}

function cleanPrice(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[,\s원₩]/g, '')) : NaN;
  if (!Number.isFinite(n) || n < 100 || n > 500_000_000) return undefined;
  return Math.round(n);
}

function cleanDims(raw: unknown): Partial<{ w: number; d: number; h: number }> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const w = cleanDim(obj.w);
  const d = cleanDim(obj.d);
  const h = cleanDim(obj.h);
  if (w === undefined && d === undefined && h === undefined) return undefined;
  return {
    ...(w !== undefined ? { w } : {}),
    ...(d !== undefined ? { d } : {}),
    ...(h !== undefined ? { h } : {}),
  };
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* fall through to brace scanning */ }

  const start = candidate.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(candidate.slice(start, i + 1));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function sanitizeAiProduct(raw: Record<string, unknown>, url?: string): ImportedProduct {
  const name = cleanStr(raw.name, 200);
  const rawBrand = cleanStr(raw.brand, 80);
  const brand = rawBrand && !MARKETPLACE_BRAND.test(rawBrand) ? rawBrand : undefined;
  const price = cleanPrice(raw.price);
  const category = typeof raw.category === 'string' && CATEGORY_SET.has(raw.category) ? (raw.category as CategoryId) : undefined;
  const model = typeof raw.model === 'string' && MODEL_SET.has(raw.model) ? raw.model : undefined;
  const mount = typeof raw.mount === 'string' && MOUNT_SET.has(raw.mount) ? (raw.mount as Mount) : undefined;
  const ergo = typeof raw.ergo === 'string' && ERGO_SET.has(raw.ergo) ? (raw.ergo as ErgoRole) : undefined;
  const material = typeof raw.material === 'string' && MAT_SET.has(raw.material) ? (raw.material as MatKind) : undefined;
  const color = typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color.trim()) ? raw.color.trim().toLowerCase() : undefined;
  const notes = cleanStr(raw.notes, 200);
  const dims = cleanDims(raw.dims);

  const options: ImportedProductOption[] = [];
  if (Array.isArray(raw.options)) {
    for (const item of raw.options) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const label = cleanStr(o.label, 80);
      if (!label) continue;
      const oDims = cleanDims(o.dims);
      const oPrice = cleanPrice(o.price);
      if (!oDims && oPrice === undefined) continue;
      options.push({ label, ...(oDims ? { dims: oDims } : {}), ...(oPrice !== undefined ? { price: oPrice } : {}) });
      if (options.length >= 12) break;
    }
  }

  return {
    ...(url ? { url } : {}),
    ...(name ? { name } : {}),
    ...(brand ? { brand } : {}),
    ...(price !== undefined ? { price } : {}),
    ...(category ? { category } : {}),
    ...(model ? { model } : {}),
    ...(mount ? { mount } : {}),
    ...(ergo ? { ergo } : {}),
    ...(dims ? { dims } : {}),
    ...(color ? { color } : {}),
    ...(material ? { material } : {}),
    ...(notes ? { notes } : {}),
    ...(options.length > 0 ? { options } : {}),
  };
}

async function callGemini(
  config: AiConfig,
  prompt: string,
  images: InlineImage[],
  opts: { signal?: AbortSignal; useWebTools?: boolean },
): Promise<string | null> {
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }
  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts }],
  };
  const generationConfig: Record<string, unknown> = {};
  if (/^gemini-[34]/i.test(config.model)) {
    generationConfig.thinkingConfig = { thinkingLevel: opts.useWebTools ? 'MEDIUM' : 'LOW' };
  }
  if (opts.useWebTools) {
    body.tools = [{ url_context: {} }, { google_search: {} }];
  } else {
    generationConfig.responseMimeType = 'application/json';
  }
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const outParts = data.candidates?.[0]?.content?.parts ?? [];
  const text = outParts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('\n');
  return text || null;
}

async function callOpenAi(
  config: AiConfig,
  prompt: string,
  images: InlineImage[],
  opts: { signal?: AbortSignal },
): Promise<string | null> {
  const content: Record<string, unknown>[] = [{ type: 'text', text: prompt }];
  for (const img of images) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    });
  }
  const res = await fetch(`${config.baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content },
      ],
    }),
    signal: opts.signal,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? null;
}

async function callAnthropic(
  config: AiConfig,
  prompt: string,
  images: InlineImage[],
  opts: { signal?: AbortSignal },
): Promise<string | null> {
  const content: Record<string, unknown>[] = [{ type: 'text', text: prompt }];
  for (const img of images) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
    });
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1500,
      system: SYSTEM_INSTRUCTION,
      messages: [{ role: 'user', content }],
    }),
    signal: opts.signal,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    content?: { type?: string; text?: string }[];
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
  return text || null;
}

export async function extractWithAi(
  input: {
    url?: string;
    text?: string;
    partial?: ImportedProduct;
    images?: InlineImage[];
  },
  opts: { signal?: AbortSignal; env?: Env } = {},
): Promise<ImportedProduct | null> {
  const config = getAiConfig(opts.env);
  if (!config) return null;

  const sections: string[] = [];
  if (input.url) sections.push(`Product URL: ${input.url}`);
  if (input.partial) {
    const summary: Record<string, unknown> = {};
    if (input.partial.name) summary.name = input.partial.name;
    if (input.partial.brand) summary.brand = input.partial.brand;
    if (input.partial.price !== undefined) summary.price = input.partial.price;
    if (input.partial.category) summary.category = input.partial.category;
    if (input.partial.dims) summary.dims = input.partial.dims;
    if (Object.keys(summary).length > 0) {
      sections.push(`Already parsed metadata (verify & fill missing fields):\n${JSON.stringify(summary)}`);
    }
  }
  if (input.text) {
    sections.push(`Page content:\n${input.text.slice(0, 18_000)}`);
  }
  if (input.images?.length) {
    sections.push(`Attached ${input.images.length} product/spec image(s). Carefully read any dimension tables, size diagrams (W×D×H / 가로×세로×높이 / mm or cm), brand, product name, and prices shown in the images.`);
  }
  if (sections.length === 0) return null;

  const prompt = `${sections.join('\n\n')}\n\nExtract the furniture product data as JSON.`;
  const images = (input.images ?? []).slice(0, 4);

  try {
    let rawText: string | null = null;
    if (config.provider === 'gemini') rawText = await callGemini(config, prompt, images, { signal: opts.signal });
    else if (config.provider === 'openai') rawText = await callOpenAi(config, prompt, images, { signal: opts.signal });
    else if (config.provider === 'anthropic') rawText = await callAnthropic(config, prompt, images, { signal: opts.signal });
    if (!rawText) return null;
    const parsed = extractJsonObject(rawText);
    if (!parsed) return null;
    return sanitizeAiProduct(parsed, input.url);
  } catch {
    return null;
  }
}

/**
 * Fallback when a furniture store blocks direct server HTTP access (e.g. WAF/403).
 * Uses Gemini's built-in URL Context + Google Search grounding to retrieve publicly
 * indexed product facts. Never fabricates missing numbers.
 */
export async function lookupUrlWithGemini(
  url: string,
  opts: { signal?: AbortSignal; env?: Env } = {},
): Promise<ImportedProduct | null> {
  const config = getAiConfig(opts.env);
  if (!config || config.provider !== 'gemini') return null;

  const prompt = `Inspect this furniture product webpage URL and find its exact product specifications:
${url}

Use URL context and Google Search to look up the exact product at this URL (including Ohouse / 오늘의집 goods ID if present).
Output ONLY a JSON object matching the schema. Return null for any field (especially dims or price) that you cannot explicitly verify from the retrieved page or search results — NEVER guess dimensions or prices.`;

  try {
    const rawText = await callGemini(config, prompt, [], { signal: opts.signal, useWebTools: true });
    if (!rawText) return null;
    const parsed = extractJsonObject(rawText);
    if (!parsed) return null;
    const sanitized = sanitizeAiProduct(parsed, url);
    if (!sanitized.name && !sanitized.dims) return null;
    return sanitized;
  } catch {
    return null;
  }
}

export function mergeImportedProducts(
  base: ImportedProduct,
  ai: ImportedProduct | null,
  preferAiDims = false,
): ImportedProduct {
  if (!ai) return base;
  const baseDims = base.dims ?? {};
  const aiDims = ai.dims ?? {};
  const aiHasAllDims = aiDims.w !== undefined && aiDims.d !== undefined && aiDims.h !== undefined;
  const baseHasAllDims = baseDims.w !== undefined && baseDims.d !== undefined && baseDims.h !== undefined;

  const mergedDims = preferAiDims && aiHasAllDims && !baseHasAllDims
    ? { w: aiDims.w, d: aiDims.d, h: aiDims.h }
    : {
        ...(baseDims.w !== undefined ? { w: baseDims.w } : aiDims.w !== undefined ? { w: aiDims.w } : {}),
        ...(baseDims.d !== undefined ? { d: baseDims.d } : aiDims.d !== undefined ? { d: aiDims.d } : {}),
        ...(baseDims.h !== undefined ? { h: baseDims.h } : aiDims.h !== undefined ? { h: aiDims.h } : {}),
      };

  const hasDims = Object.values(mergedDims).some((v) => v !== undefined);
  const options = ai.options?.length ? ai.options : base.options;

  return {
    ...(base.url ?? ai.url ? { url: base.url ?? ai.url } : {}),
    ...(ai.name ?? base.name ? { name: ai.name ?? base.name } : {}),
    ...(ai.brand ?? base.brand ? { brand: ai.brand ?? base.brand } : {}),
    ...(base.price !== undefined ? { price: base.price } : ai.price !== undefined ? { price: ai.price } : {}),
    ...(ai.category ?? base.category ? { category: ai.category ?? base.category } : {}),
    ...(ai.model ?? base.model ? { model: ai.model ?? base.model } : {}),
    ...(ai.mount ?? base.mount ? { mount: ai.mount ?? base.mount } : {}),
    ...(ai.ergo ?? base.ergo ? { ergo: ai.ergo ?? base.ergo } : {}),
    ...(hasDims ? { dims: mergedDims } : {}),
    ...(ai.color ?? base.color ? { color: ai.color ?? base.color } : {}),
    ...(ai.material ?? base.material ? { material: ai.material ?? base.material } : {}),
    ...(ai.notes ?? base.notes ? { notes: ai.notes ?? base.notes } : {}),
    ...(options?.length ? { options } : {}),
  };
}
