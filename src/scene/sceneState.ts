import { create } from 'zustand';
import type { Vec2 } from '../types';

export interface Ghost {
  x: number;
  z: number;
  y: number;
  rot: number;
  valid: boolean;
}

interface SceneState {
  guides: { a: Vec2; b: Vec2 }[];
  ghost: Ghost | null;
  dragging: boolean;
  measures: { a: [number, number, number]; b: [number, number, number] }[];
  measureStart: [number, number, number] | null;
  measureHover: [number, number, number] | null;
  walkEye: number | null;
  walkPos: { x: number; z: number; yaw: number } | null;
  walkPose: 'stand' | 'sit' | 'lie';
  walkSurface: number;
  camReq: { preset: 'iso' | 'window' | 'entry' | 'desk' | 'focus' | 'zoom'; t: number; x?: number; z?: number; f?: number } | null;
  set: (p: Partial<SceneState>) => void;
}

export const useScene = create<SceneState>((set) => ({
  guides: [],
  ghost: null,
  dragging: false,
  measures: [],
  measureStart: null,
  measureHover: null,
  walkEye: null,
  walkPos: null,
  walkPose: 'stand',
  walkSurface: 45,
  camReq: null,
  set: (p) => set(p),
}));

export function requestCamera(preset: NonNullable<SceneState['camReq']>['preset'], extra: { x?: number; z?: number; f?: number } = {}) {
  useScene.getState().set({ camReq: { preset, t: Date.now(), ...extra } });
}
