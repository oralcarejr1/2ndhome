import { create } from 'zustand';
import type { SnapGuide } from '../lib/snap';

export interface Ghost {
  x: number;
  z: number;
  y: number;
  rot: number;
  valid: boolean;
}

export interface SavedCamera {
  pos: [number, number, number];
  target: [number, number, number];
}

export interface PlanViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SceneState {
  guides: SnapGuide[];
  ghost: Ghost | null;
  ghostManualRot: boolean;
  /** name of the furniture the placed / dragged item is being put on top of */
  stackOn: string | null;
  dragging: boolean;
  rotating: { id: string; rot: number; x: number; y: number; z: number } | null;
  measures: { a: [number, number, number]; b: [number, number, number] }[];
  measureStart: [number, number, number] | null;
  measureHover: [number, number, number] | null;
  walkEye: number | null;
  walkPos: { x: number; z: number; yaw: number; tele?: boolean } | null;
  walkPose: 'stand' | 'sit' | 'lie';
  walkSurface: number;
  walkTarget: { x: number; z: number; t: number } | null;
  camReq: { preset: 'iso' | 'window' | 'entry' | 'desk' | 'focus' | 'zoom'; t: number; x?: number; z?: number; f?: number } | null;
  camSaved: Record<string, SavedCamera>;
  planVb: Record<string, PlanViewBox>;
  captureThumb: (() => void) | null;
  set: (p: Partial<SceneState>) => void;
}

export const useScene = create<SceneState>((set) => ({
  guides: [],
  ghost: null,
  ghostManualRot: false,
  stackOn: null,
  dragging: false,
  rotating: null,
  measures: [],
  measureStart: null,
  measureHover: null,
  walkEye: null,
  walkPos: null,
  walkPose: 'stand',
  walkSurface: 45,
  walkTarget: null,
  camReq: null,
  camSaved: {},
  planVb: {},
  captureThumb: null,
  set: (p) => set(p),
}));

export function requestCamera(preset: NonNullable<SceneState['camReq']>['preset'], extra: { x?: number; z?: number; f?: number } = {}) {
  useScene.getState().set({ camReq: { preset, t: Date.now(), ...extra } });
}
