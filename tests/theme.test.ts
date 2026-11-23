import { describe, expect, it } from 'vitest';
import { STAGE_COLORS, stagePalette } from '../src/lib/theme';

function hexLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('stagePalette', () => {
  it('keeps light mode backgrounds bright during both day and night hours', () => {
    const day = stagePalette('light', 14);
    const night = stagePalette('light', 21);
    const dawn = stagePalette('light', 5);

    expect(day.bg).toBe(STAGE_COLORS.light.canvasDay);
    expect(night.bg).toBe(STAGE_COLORS.light.canvasNight);
    expect(dawn.bg).toBe(STAGE_COLORS.light.canvasNight);

    expect(hexLuminance(day.bg)).toBeGreaterThan(0.95);
    expect(hexLuminance(night.bg)).toBeGreaterThan(0.9);
    expect(hexLuminance(day.slab)).toBeGreaterThan(0.85);
    expect(hexLuminance(night.slab)).toBeGreaterThan(0.8);
    expect(day.shadowOpacity).toBeLessThan(0.15);
    expect(night.shadowOpacity).toBe(day.shadowOpacity);
  });

  it('keeps dark mode backgrounds dark across day and night hours', () => {
    const day = stagePalette('dark', 14);
    const night = stagePalette('dark', 21);

    expect(day.bg).toBe(STAGE_COLORS.dark.canvasDay);
    expect(night.bg).toBe(STAGE_COLORS.dark.canvasNight);
    expect(hexLuminance(day.bg)).toBeLessThan(0.2);
    expect(hexLuminance(night.bg)).toBeLessThan(hexLuminance(day.bg));
    expect(day.shadowOpacity).toBe(STAGE_COLORS.dark.shadowOpacity);
  });
});
