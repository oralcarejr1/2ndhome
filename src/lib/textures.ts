import * as THREE from 'three';
import { invalidate } from '@react-three/fiber';

// Procedural canvas textures (no external assets). Textures are near-white so that
// material.color tints them; values stay in a narrow band to keep the chosen colour readable.

const cache = new Map<string, THREE.Texture>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(canvas: HTMLCanvasElement, key: string, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

function gray(v: number) {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${c},${c},${c})`;
}

export function woodTexture(dark = false): THREE.Texture {
  const key = 'wood' + dark;
  if (cache.has(key)) return cache.get(key)!;
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d')!;
  const r = rng(dark ? 7 : 3);
  g.fillStyle = gray(0.9);
  g.fillRect(0, 0, W, H);
  // grain lines along x
  for (let i = 0; i < 140; i++) {
    const y0 = r() * H;
    const amp = 2 + r() * 6;
    const freq = 0.004 + r() * 0.01;
    const ph = r() * 10;
    g.strokeStyle = `rgba(60,40,20,${0.04 + r() * 0.1})`;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph) * amp * 0.3;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // a few knots
  for (let k = 0; k < 2; k++) {
    const kx = r() * W;
    const ky = r() * H;
    for (let j = 0; j < 6; j++) {
      g.strokeStyle = `rgba(70,45,25,${0.08})`;
      g.beginPath();
      g.ellipse(kx, ky, 4 + j * 4, 2 + j * 1.6, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  return finish(c, key);
}

export function weaveTexture(kind: 'fabric' | 'boucle' | 'velvet' | 'rattan' | 'paper' | 'leather'): THREE.Texture {
  const key = 'weave' + kind;
  if (cache.has(key)) return cache.get(key)!;
  const W = 256;
  const c = makeCanvas(W, W);
  const g = c.getContext('2d')!;
  const r = rng(kind.length * 31);
  g.fillStyle = gray(0.92);
  g.fillRect(0, 0, W, W);
  if (kind === 'fabric') {
    for (let y = 0; y < W; y += 2) {
      g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`;
      g.fillRect(0, y, W, 1);
    }
    for (let x = 0; x < W; x += 2) {
      g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.04})`;
      g.fillRect(x, 0, 1, W);
    }
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
      g.fillRect(r() * W, r() * W, 1.5, 1.5);
    }
  } else if (kind === 'boucle') {
    for (let i = 0; i < 2600; i++) {
      const x = r() * W;
      const y = r() * W;
      const rad = 1.5 + r() * 3;
      g.strokeStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.08 + r() * 0.12})`;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.stroke();
    }
  } else if (kind === 'velvet') {
    for (let i = 0; i < 40; i++) {
      const grd = g.createLinearGradient(0, r() * W, W, r() * W);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, `rgba(255,255,255,${0.03 + r() * 0.04})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, W);
    }
  } else if (kind === 'rattan') {
    const s = 16;
    for (let y = 0; y < W; y += s) {
      for (let x = 0; x < W; x += s) {
        const odd = ((x + y) / s) % 2 === 0;
        g.fillStyle = gray(odd ? 0.95 : 0.78);
        g.fillRect(x + 1, y + 1, s - 2, s - 2);
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      }
    }
    // cane hexagon holes
    for (let y = s / 2; y < W; y += s * 2) {
      for (let x = s / 2; x < W; x += s * 2) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (kind === 'paper') {
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.03})`;
      g.fillRect(0, r() * W, W, 1 + r() * 3);
    }
  } else if (kind === 'leather') {
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.06})`;
      g.beginPath();
      g.arc(r() * W, r() * W, 1 + r() * 2.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  return finish(c, key);
}

export function stoneTexture(kind: 'marble' | 'stone' | 'terrazzo' | 'concrete'): THREE.Texture {
  const key = 'stone' + kind;
  if (cache.has(key)) return cache.get(key)!;
  const W = 512;
  const c = makeCanvas(W, W);
  const g = c.getContext('2d')!;
  const r = rng(kind.length * 97);
  g.fillStyle = gray(0.95);
  g.fillRect(0, 0, W, W);
  if (kind === 'marble') {
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(80,80,90,${0.08 + r() * 0.18})`;
      g.lineWidth = 0.5 + r() * 2;
      g.beginPath();
      let x = r() * W;
      let y = 0;
      g.moveTo(x, y);
      while (y < W) {
        x += (r() - 0.5) * 40;
        y += 10 + r() * 30;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  } else if (kind === 'terrazzo') {
    const cols = ['#c9b8a6', '#8f9aa0', '#d8c3b0', '#6f7470', '#e6dccf', '#b07d62'];
    g.fillStyle = gray(0.93);
    g.fillRect(0, 0, W, W);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.beginPath();
      const x = r() * W;
      const y = r() * W;
      const s = 1.5 + r() * 6;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) g.lineTo(x + (r() - 0.5) * s * 2, y + (r() - 0.5) * s * 2);
      g.fill();
    }
  } else {
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.07})`;
      g.fillRect(r() * W, r() * W, 2, 2);
    }
    for (let i = 0; i < 25; i++) {
      const grd = g.createRadialGradient(r() * W, r() * W, 0, r() * W, r() * W, 60 + r() * 120);
      grd.addColorStop(0, `rgba(0,0,0,${0.03 + r() * 0.04})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, W);
    }
  }
  return finish(c, key);
}

/** Floor textures. Returns texture + the real-world size (cm) one texture tile covers. */
export function floorTexture(kind: string): { tex: THREE.Texture; size: number } {
  const key = 'floor' + kind;
  const sizes: Record<string, number> = {
    oak: 240,
    walnut: 240,
    ash: 240,
    vinyl: 240,
    herringbone: 120,
    tile: 120,
    bigtile: 240,
    concrete: 300,
    terrazzo: 200,
    carpet: 100,
  };
  const size = sizes[kind] ?? 200;
  if (cache.has(key)) return { tex: cache.get(key)!, size };
  const W = 1024;
  const c = makeCanvas(W, W);
  const g = c.getContext('2d')!;
  const r = rng(kind.length * 13 + 5);
  const px = W / size; // px per cm
  g.fillStyle = gray(0.9);
  g.fillRect(0, 0, W, W);
  const plank = (x: number, y: number, w: number, h: number, vertical: boolean) => {
    const v = 0.8 + r() * 0.18;
    g.fillStyle = gray(v);
    g.fillRect(x, y, w, h);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(60,40,20,${0.03 + r() * 0.07})`;
      g.lineWidth = 0.5 + r() * 1.5;
      g.beginPath();
      if (!vertical) {
        const yy = y + r() * h;
        g.moveTo(x, yy);
        g.bezierCurveTo(x + w * 0.3, yy + (r() - 0.5) * 6, x + w * 0.6, yy + (r() - 0.5) * 6, x + w, yy + (r() - 0.5) * 4);
      } else {
        const xx = x + r() * w;
        g.moveTo(xx, y);
        g.bezierCurveTo(xx + (r() - 0.5) * 6, y + h * 0.3, xx + (r() - 0.5) * 6, y + h * 0.6, xx + (r() - 0.5) * 4, y + h);
      }
      g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(40,25,10,0.35)';
    g.lineWidth = 1.2;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };
  if (kind === 'oak' || kind === 'walnut' || kind === 'ash' || kind === 'vinyl') {
    const pw = 20 * px; // plank width 20cm
    const pl = 120 * px; // plank length 120cm
    for (let row = 0; row * pw < W; row++) {
      const off = (row * 0.37 * pl) % pl;
      for (let x = -off; x < W; x += pl) plank(x, row * pw, pl, pw, false);
    }
  } else if (kind === 'herringbone') {
    const pw = 10 * px;
    const pl = 60 * px;
    g.save();
    for (let y = -pl; y < W + pl; y += pw * 2) {
      for (let x = -pl; x < W + pl; x += pl) {
        // two orientations of herringbone
        g.save();
        g.translate(x + ((y / (pw * 2)) % 2) * 0, y);
        g.rotate(Math.PI / 4);
        plank(0, 0, pl, pw, false);
        g.restore();
        g.save();
        g.translate(x + pl * 0.707, y + pl * 0.0);
        g.rotate((3 * Math.PI) / 4);
        plank(0, 0, pl, pw, false);
        g.restore();
      }
    }
    g.restore();
  } else if (kind === 'tile' || kind === 'bigtile') {
    const ts = (kind === 'tile' ? 60 : 120) * px;
    for (let y = 0; y < W; y += ts) {
      for (let x = 0; x < W; x += ts) {
        g.fillStyle = gray(0.88 + r() * 0.06);
        g.fillRect(x, y, ts, ts);
        for (let i = 0; i < 200; i++) {
          g.fillStyle = `rgba(0,0,0,${r() * 0.03})`;
          g.fillRect(x + r() * ts, y + r() * ts, 3, 3);
        }
        g.strokeStyle = 'rgba(80,80,80,0.45)';
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
      }
    }
  } else if (kind === 'concrete' || kind === 'terrazzo') {
    const t = stoneTexture(kind as 'concrete' | 'terrazzo');
    g.drawImage(t.image as HTMLCanvasElement, 0, 0, W, W);
  } else if (kind === 'carpet') {
    for (let i = 0; i < 40000; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.08})`;
      g.fillRect(r() * W, r() * W, 2, 2);
    }
  }
  return { tex: finish(c, key), size };
}

export type RugPattern = 'solid' | 'border' | 'stripe' | 'check' | 'abstract' | 'persian' | 'gradient';

export function rugTexture(pattern: RugPattern, c1: string, c2: string, w: number, d: number): THREE.Texture {
  const key = `rug|${pattern}|${c1}|${c2}|${Math.round(w)}|${Math.round(d)}`;
  if (cache.has(key)) return cache.get(key)!;
  const S = 512;
  const cw = w >= d ? S : Math.round((S * w) / d);
  const ch = d >= w ? S : Math.round((S * d) / w);
  const c = makeCanvas(cw, ch);
  const g = c.getContext('2d')!;
  const r = rng(pattern.length * 17);
  g.fillStyle = c1;
  g.fillRect(0, 0, cw, ch);
  const bw = Math.min(cw, ch) * 0.08;
  if (pattern === 'border') {
    g.strokeStyle = c2;
    g.lineWidth = bw * 0.5;
    g.strokeRect(bw, bw, cw - bw * 2, ch - bw * 2);
  } else if (pattern === 'stripe') {
    g.fillStyle = c2;
    const n = 9;
    for (let i = 0; i < n; i++) if (i % 2) g.fillRect(0, (i * ch) / n, cw, ch / n);
  } else if (pattern === 'check') {
    g.fillStyle = c2;
    const s = Math.min(cw, ch) / 8;
    for (let y = 0; y < ch; y += s) for (let x = 0; x < cw; x += s) if (((x + y) / s) % 2 < 1) g.fillRect(x, y, s, s);
  } else if (pattern === 'abstract') {
    for (let i = 0; i < 7; i++) {
      g.fillStyle = c2;
      g.globalAlpha = 0.35 + r() * 0.5;
      g.beginPath();
      g.ellipse(r() * cw, r() * ch, 30 + r() * cw * 0.3, 20 + r() * ch * 0.25, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  } else if (pattern === 'persian') {
    g.strokeStyle = c2;
    g.lineWidth = bw * 0.35;
    g.strokeRect(bw * 0.6, bw * 0.6, cw - bw * 1.2, ch - bw * 1.2);
    g.lineWidth = 2;
    g.strokeRect(bw * 1.3, bw * 1.3, cw - bw * 2.6, ch - bw * 2.6);
    g.fillStyle = c2;
    g.globalAlpha = 0.7;
    g.beginPath();
    g.ellipse(cw / 2, ch / 2, cw * 0.18, ch * 0.18, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.35;
    for (let i = 0; i < 60; i++) {
      g.beginPath();
      g.arc(bw * 2 + r() * (cw - bw * 4), bw * 2 + r() * (ch - bw * 4), 3 + r() * 6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  } else if (pattern === 'gradient') {
    const grd = g.createLinearGradient(0, 0, cw, ch);
    grd.addColorStop(0, c1);
    grd.addColorStop(1, c2);
    g.fillStyle = grd;
    g.fillRect(0, 0, cw, ch);
  }
  // pile noise
  for (let i = 0; i < cw * ch * 0.08; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.07})`;
    g.fillRect(r() * cw, r() * ch, 1.5, 1.5);
  }
  return finish(c, key, false);
}

export function screenTexture(): THREE.Texture {
  const key = 'screen';
  if (cache.has(key)) return cache.get(key)!;
  const c = makeCanvas(256, 144);
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 256, 144);
  grd.addColorStop(0, '#1d2a3a');
  grd.addColorStop(0.6, '#2c4a5e');
  grd.addColorStop(1, '#6b8a8c');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 144);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(110, 0);
  g.lineTo(40, 144);
  g.lineTo(0, 144);
  g.fill();
  return finish(c, key, false);
}

const imageTexCache = new Map<string, THREE.Texture>();
export function imageTexture(url: string): THREE.Texture {
  if (imageTexCache.has(url)) return imageTexCache.get(url)!;
  const t = new THREE.TextureLoader().load(url, () => invalidate());
  t.colorSpace = THREE.SRGBColorSpace;
  imageTexCache.set(url, t);
  return t;
}
