/** Dominant colours via k-means on a downscaled image. Returns hex strings sorted by share. */
export async function extractPalette(src: string, k = 5): Promise<string[]> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const S = 64;
  const c = document.createElement('canvas');
  const r = Math.min(1, S / Math.max(img.width, img.height));
  c.width = Math.max(1, Math.round(img.width * r));
  c.height = Math.max(1, Math.round(img.height * r));
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, c.width, c.height);
  const data = g.getImageData(0, 0, c.width, c.height).data; // throws if tainted
  const px: [number, number, number][] = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) px.push([data[i], data[i + 1], data[i + 2]]);
  if (!px.length) return [];
  // init centroids spread through luminance order
  const sorted = [...px].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let cents = Array.from({ length: k }, (_, i) => [...sorted[Math.floor(((i + 0.5) / k) * sorted.length)]] as [number, number, number]);
  let counts = new Array(k).fill(0);
  for (let it = 0; it < 10; it++) {
    const sums = cents.map(() => [0, 0, 0]);
    counts = new Array(k).fill(0);
    for (const p of px) {
      let best = 0;
      let bd = Infinity;
      for (let j = 0; j < k; j++) {
        const d = (p[0] - cents[j][0]) ** 2 + (p[1] - cents[j][1]) ** 2 + (p[2] - cents[j][2]) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      counts[best]++;
    }
    cents = cents.map((cc, j) => (counts[j] ? ([sums[j][0] / counts[j], sums[j][1] / counts[j], sums[j][2] / counts[j]] as [number, number, number]) : cc));
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return cents
    .map((cc, j) => ({ c: `#${hex(cc[0])}${hex(cc[1])}${hex(cc[2])}`, n: counts[j] }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.c);
}
