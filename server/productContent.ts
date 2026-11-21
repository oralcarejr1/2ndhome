import type { ImportedProduct } from '../src/lib/productImport.js';
import {
  extractWithAi,
  isAiConfigured,
  mergeImportedProducts,
  type InlineImage,
} from './productAi.js';
import { parseProductText } from './productText.js';

const MAX_TEXT_CHARS = 40_000;
const MAX_IMAGE_DATA_URL_CHARS = 4_000_000;
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i;

export function parseImageDataUrl(raw: string): InlineImage {
  if (raw.length > MAX_IMAGE_DATA_URL_CHARS) throw new Error('image_too_large');
  const m = DATA_URL_RE.exec(raw.trim());
  if (!m) throw new Error('bad_image');
  const mime = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
  const base64 = m[2].replace(/\s+/g, '');
  if (!base64 || base64.length > MAX_IMAGE_DATA_URL_CHARS) throw new Error('bad_image');
  return { mimeType: mime, base64 };
}

export async function importProductContent(
  input: { url?: string; text?: string; image?: string },
  signal = AbortSignal.timeout(22_000),
): Promise<ImportedProduct> {
  const aiReady = isAiConfigured();
  const text = typeof input.text === 'string' ? input.text.trim().slice(0, MAX_TEXT_CHARS) : '';
  const image = typeof input.image === 'string' && input.image.trim() ? parseImageDataUrl(input.image) : undefined;

  if (!text && !image) throw new Error('empty_content');

  const deterministic: ImportedProduct = text ? parseProductText(text, input.url) : input.url ? { url: input.url } : {};

  if (image && !aiReady && !text) {
    throw new Error('ai_required');
  }

  if (!aiReady) {
    return {
      ...deterministic,
      source: 'text',
      aiConfigured: false,
    };
  }

  const aiResult = await extractWithAi(
    {
      url: input.url,
      text: text || undefined,
      partial: text ? deterministic : undefined,
      images: image ? [image] : undefined,
    },
    { signal },
  );

  if (!aiResult && image && !text) {
    throw new Error('page_unavailable');
  }

  const merged = mergeImportedProducts(deterministic, aiResult, Boolean(image));
  return {
    ...merged,
    ...(input.url ? { url: input.url } : {}),
    source: image ? 'image+ai' : aiResult ? 'text+ai' : 'text',
    aiConfigured: true,
  };
}
