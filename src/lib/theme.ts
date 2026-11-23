import type { ThemeMode } from '../store/store';

export const STAGE_COLORS = {
  dark: {
    canvasDay: '#1f2126',
    canvasNight: '#14161b',
    slab: '#2d3038',
    shadowOpacity: 0.34,
    gridMajor: '#3a3e47',
    gridMinor: '#2b2e36',
    previewFloor: '#262930',
    previewGridMajor: '#3e424c',
    previewGridMinor: '#2e323a',
  },
  light: {
    canvasDay: '#f8f8f6',
    canvasNight: '#eef0f5',
    slabDay: '#e6e4de',
    slabNight: '#dce0e8',
    shadowOpacity: 0.1,
    gridMajor: '#d4d2cc',
    gridMinor: '#e8e6e1',
    previewFloor: '#f0efec',
    previewGridMajor: '#d4d2cc',
    previewGridMinor: '#e6e4df',
  },
} as const;

export function isDayHour(hour: number): boolean {
  return hour > 6 && hour < 19;
}

export function stagePalette(theme: ThemeMode, hour: number) {
  const day = isDayHour(hour);
  if (theme === 'dark') {
    return {
      bg: day ? STAGE_COLORS.dark.canvasDay : STAGE_COLORS.dark.canvasNight,
      slab: STAGE_COLORS.dark.slab,
      shadowOpacity: STAGE_COLORS.dark.shadowOpacity,
      gridMajor: STAGE_COLORS.dark.gridMajor,
      gridMinor: STAGE_COLORS.dark.gridMinor,
    };
  }
  return {
    bg: day ? STAGE_COLORS.light.canvasDay : STAGE_COLORS.light.canvasNight,
    slab: day ? STAGE_COLORS.light.slabDay : STAGE_COLORS.light.slabNight,
    shadowOpacity: STAGE_COLORS.light.shadowOpacity,
    gridMajor: STAGE_COLORS.light.gridMajor,
    gridMinor: STAGE_COLORS.light.gridMinor,
  };
}
