import type { CategoryId } from '../types';

export const CATEGORIES: { id: CategoryId; label: string; icon: string }[] = [
  { id: 'sofa', label: '소파', icon: '🛋' },
  { id: 'chair', label: '의자', icon: '🪑' },
  { id: 'table', label: '테이블', icon: '◻' },
  { id: 'desk', label: '책상', icon: '🖥' },
  { id: 'bed', label: '침대', icon: '🛏' },
  { id: 'storage', label: '수납', icon: '🗄' },
  { id: 'shelf', label: '선반·행거', icon: '📚' },
  { id: 'lighting', label: '조명', icon: '💡' },
  { id: 'textile', label: '러그·커튼', icon: '🧶' },
  { id: 'plant', label: '식물', icon: '🌿' },
  { id: 'decor', label: '소품·거울', icon: '🖼' },
  { id: 'appliance', label: '가전', icon: '🧺' },
  { id: 'electronics', label: 'TV·전자', icon: '📺' },
  { id: 'kitchen', label: '주방', icon: '🍳' },
  { id: 'bath', label: '욕실', icon: '🚿' },
  { id: 'fitness', label: '운동·취미', icon: '🏃' },
  { id: 'kids', label: '반려·육아', icon: '🐈' },
  { id: 'misc', label: '기타·붙박이', icon: '📦' },
];

export const catLabel = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
