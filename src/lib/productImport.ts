import type { CategoryId, Product } from '../types';

export interface ImportedProduct {
  url: string;
  name?: string;
  brand?: string;
  price?: number;
  category?: CategoryId;
  dims?: Partial<Product['dims']>;
}

export function normalizeProductUrl(value: string): string {
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('판매 페이지의 http 또는 https 주소를 입력하세요');
  url.hash = '';
  return url.href;
}

export const MODEL_FOR_CATEGORY: Partial<Record<CategoryId, string>> = {
  sofa: 'sofa', chair: 'chair', table: 'table', desk: 'table', bed: 'bed', storage: 'case',
  shelf: 'shelf', lighting: 'lamp', textile: 'rug', plant: 'plant', decor: 'decor',
  appliance: 'appliance', electronics: 'screen', kitchen: 'kitchen', bath: 'bath', fitness: 'activity', kids: 'activity', misc: 'block',
};
