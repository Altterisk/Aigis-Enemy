// Screenshot unit-icon recognition for the Collection page.
//
// data/icon_hashes.json (python/export_icon_hashes.py) holds a 264-bit
// gradient-sign hash (dHash over a 12x12 luma grid, horizontal + vertical)
// of the crop-inset region of every unit icon variant (base/_aw1/_aw2/_aw3).
// Scanning a screenshot:
//   1. edge-energy profiles -> peak positions -> spacing votes give the
//      icon grid pitch and candidate cell corners,
//   2. a probe phase sweeps (dx, dy, size) exhaustively on the cells with
//      the strongest edges and takes the median geometry of confident hits
//      (peaks often sit on the frame's inner edge, so the true icon corner
//      is a shared constant offset away),
//   3. every cell is matched against the full hash set with a small jitter
//      around the consensus geometry; Hamming distance decides.
// Calibrated on real 962px-wide client screenshots: correct icons score
// 13-40 of 264 bits (overlay-heavy ones up to ~68), while the best wrong
// icon stays >= ~77.

export interface IconHashDb {
  crop: [number, number, number, number];
  grid: number;
  count: number;
  ids: Int32Array;
  tiers: Int8Array;
  words: Uint32Array; // WORDS_PER_HASH per icon
}

export interface IconMatchRect {
  x: number;
  y: number;
  size: number;
}

export interface IconMatch {
  unitId: number;
  tier: number;
  dist: number;
  rect: IconMatchRect;
}

export interface ScanResult {
  matches: IconMatch[];
  canvas: HTMLCanvasElement; // the (possibly downscaled) scanned image
}

interface IconHashJson {
  meta: { crop: [number, number, number, number]; grid: number; bits: number };
  icons: [number, number, string][];
}

const WORDS_PER_HASH = 9;
// distances are out of 264 bits; see the calibration note above
export const AUTO_ACCEPT_DIST = 45;
export const SUGGEST_DIST = 68;
const PREFIX_CUTOFF = 30; // first 64 bits; correct matches stay well below
const MAX_SCAN_WIDTH = 2600;

export function unpackIconHashes(json: IconHashJson): IconHashDb {
  const count = json.icons.length;
  const ids = new Int32Array(count);
  const tiers = new Int8Array(count);
  const words = new Uint32Array(count * WORDS_PER_HASH);
  json.icons.forEach(([id, tier, b64], i) => {
    ids[i] = id;
    tiers[i] = tier;
    const raw = atob(b64);
    const base = i * WORDS_PER_HASH;
    for (let bi = 0; bi < raw.length; bi += 1) {
      words[base + (bi >> 2)] |= raw.charCodeAt(bi) << ((bi & 3) * 8);
    }
  });
  return { crop: json.meta.crop, grid: json.meta.grid, count, ids, tiers, words };
}

function popcount(v: number): number {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (v * 0x01010101) >>> 24;
}

export interface Luma {
  w: number;
  h: number;
  px: Uint8Array;
  integral: Float64Array; // (w+1)*(h+1) summed-area table
}

export function lumaFromRgba(rgba: ArrayLike<number>, w: number, h: number): Luma {
  const px = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < px.length; i += 1, p += 4) {
    px[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114 + 500) / 1000;
  }
  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < w; x += 1) {
      rowSum += px[y * w + x];
      integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1] + rowSum;
    }
  }
  return { w, h, px, integral };
}

function boxMean(lu: Luma, x0: number, y0: number, x1: number, y1: number): number {
  const iw = lu.w + 1;
  const area = (x1 - x0) * (y1 - y0);
  if (area <= 0) return 0;
  return (
    (lu.integral[y1 * iw + x1] - lu.integral[y0 * iw + x1]
      - lu.integral[y1 * iw + x0] + lu.integral[y0 * iw + x0]) / area
  );
}

// 264-bit descriptor of the crop-inset region of cell (x, y, w, h),
// bit order identical to export_icon_hashes.py
function descriptor(
  lu: Luma, x: number, y: number, w: number, h: number,
  crop: [number, number, number, number], grid: number, out: Uint32Array,
): Uint32Array {
  out.fill(0);
  const bx = x + crop[0] * w;
  const by = y + crop[1] * h;
  const bw = (crop[2] - crop[0]) * w;
  const bh = (crop[3] - crop[1]) * h;
  const g = new Float64Array(grid * grid);
  for (let gy = 0; gy < grid; gy += 1) {
    const y0 = Math.max(0, Math.min(lu.h, Math.round(by + (gy * bh) / grid)));
    const y1 = Math.max(y0 + 1, Math.min(lu.h, Math.round(by + ((gy + 1) * bh) / grid)));
    for (let gx = 0; gx < grid; gx += 1) {
      const x0 = Math.max(0, Math.min(lu.w, Math.round(bx + (gx * bw) / grid)));
      const x1 = Math.max(x0 + 1, Math.min(lu.w, Math.round(bx + ((gx + 1) * bw) / grid)));
      g[gy * grid + gx] = boxMean(lu, x0, y0, x1, y1);
    }
  }
  let i = 0;
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid - 1; gx += 1, i += 1) {
      if (g[gy * grid + gx + 1] > g[gy * grid + gx]) out[i >>> 5] |= 1 << (i & 31);
    }
  }
  for (let gy = 0; gy < grid - 1; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1, i += 1) {
      if (g[(gy + 1) * grid + gx] > g[gy * grid + gx]) out[i >>> 5] |= 1 << (i & 31);
    }
  }
  return out;
}

function bestRef(db: IconHashDb, d: Uint32Array): { index: number; dist: number } {
  let bestIndex = -1;
  let bestDist = Infinity;
  const { words, count } = db;
  for (let r = 0, base = 0; r < count; r += 1, base += WORDS_PER_HASH) {
    const pre = popcount(d[0] ^ words[base]) + popcount(d[1] ^ words[base + 1]);
    if (pre > PREFIX_CUTOFF) continue;
    let dist = pre;
    for (let wi = 2; wi < WORDS_PER_HASH && dist < bestDist; wi += 1) {
      dist += popcount(d[wi] ^ words[base + wi]);
    }
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = r;
    }
  }
  return { index: bestIndex, dist: bestDist };
}

interface Peak {
  pos: number;
  height: number;
}

function edgeProfile(lu: Luma, axis: 0 | 1): Float64Array {
  const { w, h, px } = lu;
  if (axis === 0) {
    const prof = new Float64Array(w - 1);
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = 0; x < w - 1; x += 1) {
        prof[x] += Math.abs(px[row + x + 1] - px[row + x]);
      }
    }
    for (let x = 0; x < prof.length; x += 1) prof[x] /= h;
    return prof;
  }
  const prof = new Float64Array(h - 1);
  for (let y = 0; y < h - 1; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      prof[y] += Math.abs(px[row + w + x] - px[row + x]);
    }
  }
  for (let y = 0; y < prof.length; y += 1) prof[y] /= w;
  return prof;
}

function findPeaks(prof: Float64Array): Peak[] {
  const n = prof.length;
  const sm = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(n, i + 2);
    let sum = 0;
    for (let j = lo; j < hi; j += 1) sum += prof[j];
    sm[i] = sum / (hi - lo);
  }
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += sm[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i += 1) variance += (sm[i] - mean) ** 2;
  const thr = mean + 0.5 * Math.sqrt(variance / n);
  const peaks: Peak[] = [];
  for (let i = 2; i < n - 2; i += 1) {
    if (sm[i] >= thr && sm[i] >= sm[i - 1] && sm[i] >= sm[i + 1]
      && sm[i] >= sm[i - 2] && sm[i] >= sm[i + 2]) {
      const last = peaks[peaks.length - 1];
      if (last && i - last.pos < 8) {
        if (sm[i] > last.height) {
          last.pos = i;
          last.height = sm[i];
        }
        continue;
      }
      peaks.push({ pos: i, height: sm[i] });
    }
  }
  return peaks;
}

// top pitch candidates by peak-spacing votes; match quality in the probe
// phase decides between them (vote counts alone are ambiguous: icon width
// and grid pitch both collect votes)
function pitchCandidates(peaks: Peak[], lo: number, hi: number, take: number): number[] {
  const votes = new Map<number, number>();
  for (let i = 0; i < peaks.length; i += 1) {
    for (let j = i + 1; j < peaks.length; j += 1) {
      const d = peaks[j].pos - peaks[i].pos;
      if (d > hi) break;
      if (d >= lo) votes.set(d, (votes.get(d) || 0) + 1);
    }
  }
  const windows: { pitch: number; total: number }[] = [];
  votes.forEach((_, d) => {
    let total = 0;
    for (let o = -3; o <= 3; o += 1) total += votes.get(d + o) || 0;
    windows.push({ pitch: d, total });
  });
  windows.sort((a, b) => b.total - a.total);
  const picked: number[] = [];
  for (const w of windows) {
    if (picked.length >= take) break;
    if (picked.every((p) => Math.abs(p - w.pitch) > 6)) picked.push(w.pitch);
  }
  return picked;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

interface Geometry {
  dx: number;
  dy: number;
  ds: number;
}

function bestCellMatch(
  db: IconHashDb, lu: Luma, cx: number, cy: number, pitch: number,
  geoms: Geometry[], scratch: Uint32Array,
): { dist: number; index: number; geom: Geometry } | null {
  let best: { dist: number; index: number; geom: Geometry } | null = null;
  for (const geom of geoms) {
    const s = pitch + geom.ds;
    const d = descriptor(lu, cx + geom.dx, cy + geom.dy, s, s, db.crop, db.grid, scratch);
    const m = bestRef(db, d);
    if (m.index >= 0 && (!best || m.dist < best.dist)) {
      best = { dist: m.dist, index: m.index, geom: { ...geom } };
    }
  }
  return best;
}

const yieldToUi = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

export async function scanImage(
  source: CanvasImageSource & { width: number; height: number },
  db: IconHashDb,
  onProgress?: (fraction: number) => void,
): Promise<ScanResult> {
  const scale = Math.min(1, MAX_SCAN_WIDTH / source.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const matches = await scanLuma(lumaFromRgba(data.data, data.width, data.height), db, onProgress);
  return { matches, canvas };
}

// canvas-free scan core (also exercised by the Node test harness)
export async function scanLuma(
  lu: Luma,
  db: IconHashDb,
  onProgress?: (fraction: number) => void,
  debug?: (msg: string) => void,
): Promise<IconMatch[]> {
  const peaksX = findPeaks(edgeProfile(lu, 0));
  const peaksY = findPeaks(edgeProfile(lu, 1));
  debug?.(`peaksX: ${peaksX.map((p) => p.pos).join(",")}`);
  debug?.(`peaksY: ${peaksY.map((p) => p.pos).join(",")}`);
  const scratch = new Uint32Array(WORDS_PER_HASH);

  // cell corners for a given pitch: real grid corners form arithmetic
  // chains spaced one pitch apart, UI chrome peaks do not. Peaks on the
  // longest chains win; if nothing chains (single row/column screenshots)
  // fall back to peaks with any partner one pitch or one icon width away.
  // One corner is extrapolated beyond each chain end -- edge rows/columns
  // cut by the image border lack their own peak but still match (the
  // descriptor only samples the crop-inset interior of the cell).
  const corners = (peaks: Peak[], pitch: number, limit: number): Peak[] => {
    const used = new Set<Peak>();
    const chains: Peak[][] = [];
    peaks.forEach((start) => {
      if (used.has(start)) return;
      const chain = [start];
      for (;;) {
        const want = chain[chain.length - 1].pos + pitch;
        let next: Peak | null = null;
        peaks.forEach((p) => {
          if (!used.has(p) && Math.abs(p.pos - want) <= 8
            && (!next || Math.abs(p.pos - want) < Math.abs(next.pos - want))) next = p;
        });
        if (!next) break;
        chain.push(next);
      }
      if (chain.length >= 2) chain.forEach((p) => used.add(p));
      chains.push(chain);
    });
    const longest = Math.max(...chains.map((c) => c.length));
    let found: Peak[];
    if (longest >= 3) {
      found = chains.filter((c) => c.length >= 3).flat().sort((a, b) => a.pos - b.pos);
    } else {
      found = peaks.filter((a) => peaks.some((b) => {
        const gap = Math.abs(b.pos - a.pos);
        return gap >= 0.72 * pitch && gap <= 1.12 * pitch;
      }));
    }
    const extra: Peak[] = [];
    if (found.length) {
      [found[0].pos - pitch, found[found.length - 1].pos + pitch].forEach((pos) => {
        if (pos >= -0.1 * pitch && pos + 0.75 * pitch <= limit
          && found.every((f) => Math.abs(f.pos - pos) > 6)) {
          extra.push({ pos: Math.round(pos), height: 0 });
        }
      });
    }
    return [...found, ...extra];
  };
  const cellsFor = (pitch: number) => {
    const cells: { cx: number; cy: number; strength: number }[] = [];
    corners(peaksY, pitch, lu.h).forEach((row) => {
      corners(peaksX, pitch, lu.w).forEach((col) => {
        // the sampled crop-inset region must stay (nearly) inside the image
        if (col.pos >= -0.1 * pitch && col.pos + 0.9 * pitch <= lu.w + 2
          && row.pos >= -0.1 * pitch && row.pos + 0.75 * pitch <= lu.h + 2) {
          cells.push({ cx: col.pos, cy: row.pos, strength: col.height + row.height });
        }
      });
    });
    return cells;
  };

  // probe phase, run per pitch candidate: exhaustive geometry sweep on the
  // strongest-edged cells; actual match quality picks the winning pitch
  const probe = async (pitch: number, maxProbes: number, stopGood: number) => {
    const geoms: Geometry[] = [];
    for (let ds = -Math.round(pitch * 0.2); ds <= Math.round(pitch * 0.05); ds += 2) {
      for (let dx = -8; dx <= 8; dx += 2) {
        for (let dy = -8; dy <= 8; dy += 2) geoms.push({ dx, dy, ds });
      }
    }
    const cells = cellsFor(pitch);
    // round-robin over columns (strongest first) so UI chrome with strong
    // edges cannot crowd every real icon column out of the probe budget
    const byCol = new Map<number, typeof cells>();
    cells.forEach((c) => byCol.set(c.cx, [...(byCol.get(c.cx) || []), c]));
    const colOrder = [...byCol.values()]
      .map((list) => list.sort((a, b) => b.strength - a.strength))
      .sort((a, b) => b[0].strength - a[0].strength);
    const ranked: typeof cells = [];
    for (let k = 0; ranked.length < Math.min(maxProbes, cells.length); k += 1) {
      const before = ranked.length;
      colOrder.forEach((list) => {
        if (k < list.length && ranked.length < maxProbes) ranked.push(list[k]);
      });
      if (ranked.length === before) break;
    }
    const hits: { dist: number; geom: Geometry }[] = [];
    for (let i = 0; i < ranked.length; i += 1) {
      const hit = bestCellMatch(db, lu, ranked[i].cx, ranked[i].cy, pitch, geoms, scratch);
      if (hit) hits.push({ dist: hit.dist, geom: hit.geom });
      if (hits.filter((p) => p.dist <= AUTO_ACCEPT_DIST).length >= stopGood) break;
      if (i % 2 === 1) await yieldToUi();
    }
    hits.sort((a, b) => a.dist - b.dist);
    return { pitch, cells, hits };
  };

  // evaluate every pitch candidate: the icon-width cluster often collects
  // more spacing votes than the true pitch, so only actual match quality
  // can separate them (a decisive <=25 probe hit ends the search early)
  const candidates = pitchCandidates(peaksX, 48, 300, 3);
  debug?.(`pitch candidates: ${candidates.join(",")}`);
  let bestProbe: Awaited<ReturnType<typeof probe>> | null = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const result = await probe(candidates[i], 60, 4);
    debug?.(`pitch ${result.pitch}: ${result.cells.length} cells, probe hits `
      + result.hits.slice(0, 6).map((h) => `${h.dist}@(${h.geom.dx},${h.geom.dy},${h.geom.ds})`).join(" "));
    onProgress?.((0.5 * (i + 1)) / candidates.length);
    if (result.hits.length && (!bestProbe || result.hits[0].dist < bestProbe.hits[0].dist)) {
      bestProbe = result;
    }
    if (bestProbe && bestProbe.hits[0].dist <= 25) break;
  }
  if (!bestProbe || !bestProbe.hits.length) return [];
  const { pitch, cells, hits: probeHits } = bestProbe;
  const good = probeHits.filter((p) => p.dist <= AUTO_ACCEPT_DIST);
  const consensusFrom = good.length ? good : probeHits.slice(0, 1);
  const gdx = median(consensusFrom.map((p) => p.geom.dx));
  const gdy = median(consensusFrom.map((p) => p.geom.dy));
  const gds = median(consensusFrom.map((p) => p.geom.ds));

  // final phase: all cells, jitter around the consensus geometry (wide
  // enough to absorb pitch drift on extrapolated edge rows/columns)
  const fineGeoms: Geometry[] = [];
  for (const js of [-2, 0, 2]) {
    for (const jx of [-6, -4, -2, 0, 2, 4, 6]) {
      for (const jy of [-6, -4, -2, 0, 2, 4, 6]) {
        fineGeoms.push({ dx: gdx + jx, dy: gdy + jy, ds: gds + js });
      }
    }
  }
  const raw: (IconMatch & { cx: number; cy: number })[] = [];
  for (let i = 0; i < cells.length; i += 1) {
    const { cx, cy } = cells[i];
    const hit = bestCellMatch(db, lu, cx, cy, pitch, fineGeoms, scratch);
    if (hit && hit.dist <= SUGGEST_DIST) {
      raw.push({
        unitId: db.ids[hit.index],
        tier: db.tiers[hit.index],
        dist: hit.dist,
        cx,
        cy,
        rect: {
          x: cx + hit.geom.dx,
          y: cy + hit.geom.dy,
          size: pitch + hit.geom.ds,
        },
      });
    }
    onProgress?.(0.5 + (0.5 * (i + 1)) / cells.length);
    if (i % 8 === 7) await yieldToUi();
  }

  // non-maximum suppression: best match wins any half-pitch neighbourhood
  raw.sort((a, b) => a.dist - b.dist);
  const kept: (IconMatch & { cx: number; cy: number })[] = [];
  raw.forEach((m) => {
    if (!kept.some((k) => Math.abs(k.cx - m.cx) < pitch * 0.5 && Math.abs(k.cy - m.cy) < pitch * 0.5)) {
      kept.push(m);
    }
  });
  kept.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  return kept.map(({ cx: _cx, cy: _cy, ...m }) => m);
}

export async function scanScreenshotFile(
  file: File,
  db: IconHashDb,
  onProgress?: (fraction: number) => void,
): Promise<ScanResult> {
  const bitmap = await createImageBitmap(file);
  try {
    return await scanImage(bitmap, db, onProgress);
  } finally {
    bitmap.close();
  }
}

export function cropDataUrl(canvas: HTMLCanvasElement, rect: IconMatchRect, out = 64): string {
  const c = document.createElement("canvas");
  c.width = out;
  c.height = out;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(canvas, rect.x, rect.y, rect.size, rect.size, 0, 0, out, out);
  return c.toDataURL();
}
