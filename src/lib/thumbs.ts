import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildProcedural, disposeObject } from '../models';
import type { Product } from '../types';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
const cache = new Map<string, string>();
const queue: { key: string; p: Product; cb: (u: string) => void }[] = [];
let running = false;

function setup() {
  if (renderer) return true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 240;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(240, 240, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    (scene as unknown as { environmentIntensity: number }).environmentIntensity = 0.6;
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9a98f', 1.2));
    const d = new THREE.DirectionalLight('#ffffff', 1.4);
    d.position.set(2, 4, 3);
    scene.add(d);
    camera = new THREE.PerspectiveCamera(30, 1, 1, 5000);
    return true;
  } catch {
    renderer = null;
    return false;
  }
}

export function thumbKey(p: Product) {
  return JSON.stringify([p.id, p.model, p.dims, p.params, p.mats]);
}

export function getThumb(p: Product, cb: (u: string) => void) {
  const key = thumbKey(p);
  const hit = cache.get(key);
  if (hit) return cb(hit);
  queue.push({ key, p, cb });
  if (!running) pump();
}

function pump() {
  running = true;
  const step = () => {
    const job = queue.shift();
    if (!job) {
      running = false;
      return;
    }
    if (cache.has(job.key)) {
      job.cb(cache.get(job.key)!);
    } else if (!job.p.asset && setup()) {
      try {
        const obj = buildProcedural(job.p, undefined);
        scene!.add(obj);
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const c = box.getCenter(new THREE.Vector3());
        const r = size.length() * 0.5 + 1;
        const dist = (r / Math.sin((30 * Math.PI) / 360)) * 0.98;
        const dir = new THREE.Vector3(0.75, 0.6, 1).normalize();
        camera!.position.copy(c).addScaledVector(dir, dist);
        camera!.near = dist / 20;
        camera!.far = dist * 4;
        camera!.updateProjectionMatrix();
        camera!.lookAt(c);
        renderer!.render(scene!, camera!);
        const url = renderer!.domElement.toDataURL('image/png');
        cache.set(job.key, url);
        scene!.remove(obj);
        disposeObject(obj);
        job.cb(url);
      } catch {
        /* skip */
      }
    }
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(step, { timeout: 120 });
    else setTimeout(step, 16);
  };
  step();
}
