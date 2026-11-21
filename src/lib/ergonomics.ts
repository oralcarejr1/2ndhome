// Anthropometric estimates from stature (ratios after Drillis & Contini, cross-checked against
// Size Korea averages). These are population-average proportions — good for planning, not for
// medical fitting. Users can override shoulder width per profile.

export interface Anthro {
  H: number;
  eyeH: number;
  shoulderH: number;
  elbowH: number;
  hipH: number;
  kneeH: number;
  shoulderW: number;
  hipW: number;
  chestD: number;
  headH: number;
  upperArm: number;
  forearm: number;
  footL: number;
  popliteal: number; // ideal chair seat height
  sitEyeH: number; // eye height above the seat
  sitElbowH: number; // elbow height above the seat
  buttockKnee: number;
  reachUp: number; // overhead grip reach, standing on the floor
  forwardReach: number;
  comfortTop: number; // highest shelf for frequent use
}

export function anthro(H: number, shoulderOverride?: number): Anthro {
  return {
    H,
    eyeH: 0.936 * H,
    shoulderH: 0.818 * H,
    elbowH: 0.63 * H,
    hipH: 0.53 * H,
    kneeH: 0.285 * H,
    shoulderW: shoulderOverride ?? 0.26 * H,
    hipW: 0.19 * H,
    chestD: 0.14 * H,
    headH: 0.13 * H,
    upperArm: 0.186 * H,
    forearm: 0.146 * H,
    footL: 0.152 * H,
    popliteal: 0.25 * H - 1,
    sitEyeH: 0.455 * H,
    sitElbowH: 0.14 * H,
    buttockKnee: 0.34 * H,
    reachUp: 1.2 * H,
    forwardReach: 0.44 * H,
    comfortTop: 1.0 * H,
  };
}

export interface Ideal {
  chairSeat: number;
  deskH: number;
  standDeskH: number;
  counterH: number;
  bedTop: [number, number];
  sofaSeat: [number, number];
  basinH: number;
  passMin: number;
  passOk: number;
  passGood: number;
}

export function ideals(H: number, shoulder?: number): Ideal {
  const a = anthro(H, shoulder);
  const chairSeat = a.popliteal;
  return {
    chairSeat,
    deskH: chairSeat + (0.183 * H - 1),
    standDeskH: a.elbowH - 1,
    counterH: H / 2 + 5,
    bedTop: [0.25 * H - 2, 0.25 * H + 12],
    sofaSeat: [0.21 * H, 0.27 * H],
    basinH: H / 2 - 3,
    passMin: a.shoulderW + 10,
    passOk: 75,
    passGood: 90,
  };
}

export type Level = 'ok' | 'warn' | 'bad' | 'info';

export function grade(diff: number, okTol: number, warnTol: number): Level {
  const d = Math.abs(diff);
  if (d <= okTol) return 'ok';
  if (d <= warnTol) return 'warn';
  return 'bad';
}

/** TV diagonal (inches) → recommended viewing distance range (cm), 4K content. */
export function tvDistance(diagInch: number): [number, number] {
  const cm = diagInch * 2.54;
  return [cm * 1.0, cm * 1.6];
}

/** Estimate a 16:9 TV diagonal (inches) from its width (cm). */
export function tvDiagFromWidth(wCm: number) {
  return (wCm - 2) / 2.54 / 0.8716;
}

/**
 * Can a box of dims w×d×h pass through an opening of ow×oh (cm)?
 * Allows any orientation of the box (tilting through). Corridor turns are not modelled.
 */
export function fitsThrough(dims: { w: number; d: number; h: number }, ow: number, oh: number): boolean {
  const s = [dims.w, dims.d, dims.h].sort((a, b) => a - b);
  // smallest two dims must fit the opening cross-section in some orientation
  return (s[0] <= ow && s[1] <= oh) || (s[0] <= oh && s[1] <= ow);
}

/** Diagonal sweep when standing a tall piece up after assembling it on the floor. */
export function tiltUpHeight(h: number, d: number) {
  return Math.hypot(h, d);
}
