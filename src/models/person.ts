import * as THREE from 'three';
import { anthro } from '../lib/ergonomics';
import type { Pose } from '../types';

/**
 * Proportional mannequin built from anthropometric ratios of stature.
 * Origin at the floor below the pelvis; facing +z.
 */
export function buildPerson(height: number, pose: Pose, color: string, seatH = 45): THREE.Group {
  const a = anthro(height);
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.7, transparent: true, opacity: 0.92 });
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.75), roughness: 0.8, transparent: true, opacity: 0.92 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, pos: THREE.Vector3, rot?: THREE.Euler) => {
    const me = new THREE.Mesh(geo, m);
    me.position.copy(pos);
    if (rot) me.rotation.copy(rot);
    me.castShadow = true;
    g.add(me);
    return me;
  };
  const limb = (from: THREE.Vector3, to: THREE.Vector3, r: number, m: THREE.Material) => {
    const dir = new THREE.Vector3().subVectors(to, from);
    const L = dir.length();
    const me = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.1, L - r * 2 + r), 4, 10), m);
    me.position.copy(from).add(to).multiplyScalar(0.5);
    me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    me.castShadow = true;
    g.add(me);
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const sh = a.shoulderW / 2 - 4;
  const hipW = a.hipW / 2 - 4;
  const headR = a.headH / 2.3;

  if (pose === 'lie') {
    // lying on back along z, head at -z; y = surface height
    const y = seatH + 10;
    const L = height;
    add(new THREE.SphereGeometry(headR, 20, 16), skin, V(0, y + 2, -L / 2 + headR));
    limb(V(0, y, -L / 2 + a.headH + 4), V(0, y, -L / 2 + a.headH + 4 + (a.shoulderH - a.hipH)), a.chestD / 2, cloth);
    const hipZ = -L / 2 + a.headH + 4 + (a.shoulderH - a.hipH);
    for (const s of [-1, 1]) {
      limb(V(s * hipW, y, hipZ), V(s * hipW, y, hipZ + a.hipH - a.kneeH), 6, cloth);
      limb(V(s * hipW, y, hipZ + a.hipH - a.kneeH), V(s * hipW, y, L / 2 - 6), 5, cloth);
      limb(V(s * (sh + 3), y, -L / 2 + a.headH + 8), V(s * (sh + 6), y, hipZ + 10), 4.2, skin);
    }
    return g;
  }

  const sitting = pose === 'sit';
  const hipY = sitting ? seatH + 8 : a.hipH;
  const torsoTop = hipY + (a.shoulderH - a.hipH);
  const neckY = torsoTop + 4;
  // head & neck
  add(new THREE.SphereGeometry(headR, 20, 16), skin, V(0, neckY + headR + 4, sitting ? -2 : 0));
  limb(V(0, torsoTop, 0), V(0, neckY + 4, 0), 4.5, skin);
  // torso (tapered capsule)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(a.chestD / 2, torsoTop - hipY - a.chestD * 0.4, 4, 12), cloth);
  torso.scale.x = a.shoulderW / a.chestD / 1.15;
  torso.position.set(0, (torsoTop + hipY) / 2 + 2, sitting ? -3 : 0);
  torso.castShadow = true;
  g.add(torso);
  // arms
  const reach = pose === 'reach';
  for (const s of [-1, 1]) {
    const shoulder = V(s * sh, torsoTop - 3, sitting ? -3 : 0);
    let elbow: THREE.Vector3;
    let hand: THREE.Vector3;
    if (reach && s === 1) {
      elbow = V(s * sh, torsoTop + a.upperArm, 0);
      hand = V(s * sh, torsoTop + a.upperArm + a.forearm + 6, 0);
    } else if (sitting) {
      elbow = V(s * (sh + 2), torsoTop - a.upperArm, 2);
      hand = V(s * (sh - 2), torsoTop - a.upperArm + 2, 2 + a.forearm);
    } else {
      elbow = V(s * (sh + 3), torsoTop - a.upperArm, pose === 'walk' ? s * 6 : 0);
      hand = V(s * (sh + 4), torsoTop - a.upperArm - a.forearm, pose === 'walk' ? s * 12 : 3);
    }
    limb(shoulder, elbow, 4.2, cloth);
    limb(elbow, hand, 3.6, skin);
    add(new THREE.SphereGeometry(4.2, 12, 10), skin, hand);
  }
  // legs
  for (const s of [-1, 1]) {
    const hip = V(s * hipW, hipY, sitting ? -3 : 0);
    if (sitting) {
      const knee = V(s * hipW, seatH + 7, a.buttockKnee - 10);
      const ankle = V(s * hipW, 7, a.buttockKnee - 8);
      limb(hip, knee, 7, cloth);
      limb(knee, ankle, 5.5, cloth);
      add(new THREE.BoxGeometry(9, 6, a.footL), skin, V(s * hipW, 3, ankle.z + a.footL / 2 - 5));
    } else {
      const sw = pose === 'walk' ? s * 14 : 0;
      const knee = V(s * hipW, a.kneeH, sw * 0.5);
      const ankle = V(s * hipW, 7, sw);
      limb(hip, knee, 7, cloth);
      limb(knee, ankle, 5.5, cloth);
      add(new THREE.BoxGeometry(9, 6, a.footL), skin, V(s * hipW, 3, sw + a.footL / 2 - 6));
    }
  }
  // eye-level marker ring
  const eye = sitting ? seatH + a.sitEyeH : a.eyeH;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(headR + 2, 0.5, 6, 30), new THREE.MeshBasicMaterial({ color: '#2f6fed' }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, eye, sitting ? -2 : 0);
  g.add(ring);
  if (reach) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: '#e5484d' }));
    mark.position.set(sh, a.reachUp, 0);
    g.add(mark);
  }
  return g;
}
