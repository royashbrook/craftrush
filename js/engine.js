// Pseudo-3D renderer: perspective-projected ground plane viewed from behind and
// above the crowd, parallax pixel hills, biome sky, fog. All Canvas 2D, no deps.
import { TUNE } from './config.js';

// deterministic per-cell hash -> [0,1)
export function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Camera {
  constructor() {
    this.back = TUNE.camBack; this.h = TUNE.camHeight;
    this.focal = TUNE.focal; this.horizonFrac = 0.36;
    this.x = 0; this.z = -this.back;
    this.shake = 0; this.bobT = 0;
    this.W = 0; this.H = 0; this.horizon = 0;
    this.offX = 0; this.offY = 0;
  }
  setPreset(p) {
    this.back = p.camBack; this.h = p.camHeight;
    this.focal = p.focal; this.horizonFrac = p.horizonFrac;
    if (this.H) this.horizon = Math.round(this.H * this.horizonFrac);
  }
  resize(W, H) {
    this.W = W; this.H = H;
    this.horizon = Math.round(H * this.horizonFrac);
  }
  follow(playerX, playerZ, dt, running) {
    this.x += (playerX * 0.82 - this.x) * Math.min(1, dt * 8);
    this.z = playerZ - this.back;
    if (running) this.bobT += dt;
    this.shake = Math.max(0, this.shake - dt * 3.2);
    const sh = this.shake * this.shake * 14;
    this.offX = (Math.random() - 0.5) * sh;
    this.offY = (Math.random() - 0.5) * sh + Math.sin(this.bobT * 9) * 1.2;
  }
  // px-per-block at depth; sy of a point at height y (blocks) above ground
  project(x, y, z) {
    const rel = z - this.z;
    if (rel < 0.62) return null;
    const s = (this.focal * this.W * 0.14) / rel;
    const sx = this.W / 2 + (x - this.x) * s + this.offX;
    const sy = this.horizon + (this.h - y) * s + this.offY;
    return { sx, sy, s, rel };
  }
  groundY(rel) {
    const s = (this.focal * this.W * 0.14) / rel;
    return this.horizon + this.h * s + this.offY;
  }
}

// ---- biome background layers (pre-rendered) ----
const layerCache = new Map();

function hillLayer(color, seed, amp, base, w = 480, h = 90) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color;
  const step = 10;
  for (let x = 0; x < w; x += step) {
    const i = x / step;
    const t = hash2(seed, Math.floor(i / 3));
    const t2 = hash2(seed + 7, i);
    const hh = base + t * amp + t2 * amp * 0.3;
    g.fillRect(x, h - hh, step, hh);
  }
  return c;
}

function starLayer(w = 480, h = 160) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let i = 0; i < 90; i++) {
    const x = hash2(99, i) * w, y = hash2(53, i) * h;
    const b = hash2(31, i);
    g.fillStyle = b > 0.8 ? '#ffffff' : b > 0.5 ? '#c9c2ff' : '#8a84b8';
    const sz = b > 0.9 ? 2 : 1;
    g.fillRect(x | 0, y | 0, sz, sz);
  }
  return c;
}

function biomeLayers(biome) {
  let L = layerCache.get(biome.id);
  if (!L) {
    L = {
      far: hillLayer(biome.hillFar, 11, 34, 22),
      near: hillLayer(biome.hillNear, 23, 46, 12),
      stars: biome.stars ? starLayer() : null,
    };
    layerCache.set(biome.id, L);
  }
  return L;
}

function drawTiled(ctx, img, offsetX, y, W, scaleY = 1) {
  const w = img.width;
  let ox = ((offsetX % w) + w) % w;
  const h = img.height * scaleY;
  for (let x = -ox; x < W; x += w) ctx.drawImage(img, x, y - h, w, h);
}

export function renderWorld(ctx, cam, biome, t) {
  const { W, H, horizon } = cam;
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon + 20);
  sky.addColorStop(0, biome.sky[0]);
  sky.addColorStop(1, biome.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon + 20);

  const L = biomeLayers(biome);
  if (L.stars) drawTiled(ctx, L.stars, cam.z * 0.4, horizon - 40, W);
  if (biome.sun) {
    ctx.fillStyle = biome.sun;
    const sx = W * 0.72, sy = horizon * 0.42, r = Math.max(14, W * 0.045);
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(sx - r * 1.35, sy - r * 0.55, r * 2.7, r * 1.1);
    ctx.fillRect(sx - r * 0.55, sy - r * 1.35, r * 1.1, r * 2.7);
    ctx.globalAlpha = 1;
  }
  drawTiled(ctx, L.far, cam.x * 4 + cam.z * 1.2, horizon + 6, W);
  drawTiled(ctx, L.near, cam.x * 9 + cam.z * 2.6, horizon + 10, W);

  // ground: far fog band (overdrawn by strips) then per-block strips far-first
  ctx.fillStyle = biome.fog;
  ctx.fillRect(0, horizon + 4, W, Math.max(0, cam.groundY(8) - horizon - 4));

  const g = biome.ground;
  const zNear = Math.floor(cam.z + 0.7);
  const zFar = Math.floor(cam.z + TUNE.viewDist);
  for (let zi = zFar; zi >= zNear; zi--) {
    const rel0 = zi - cam.z, rel1 = zi + 1 - cam.z;
    if (rel0 < 0.65) continue;
    const y0 = cam.groundY(rel1); // top (far edge)
    const y1 = cam.groundY(rel0); // bottom (near edge)
    const hh = y1 - y0;
    if (hh < 0.4) continue;
    const relMid = rel0 + 0.5;
    const s = (cam.focal * W * 0.14) / relMid;
    const cellPx = s;
    const xToS = (wx) => W / 2 + (wx - cam.x) * s + cam.offX;

    if (cellPx < 3.2) {
      // LOD: single banded row
      ctx.fillStyle = (zi & 1) ? g.b : g.a;
      ctx.fillRect(0, y0, W, hh + 1);
      const pl = xToS(-TUNE.trackHalf), pr = xToS(TUNE.trackHalf);
      ctx.fillStyle = (zi & 1) ? g.pathB : g.pathA;
      ctx.fillRect(pl, y0, pr - pl, hh + 1);
      continue;
    }
    const xiMin = Math.floor(cam.x - TUNE.shoulderHalf);
    const xiMax = Math.ceil(cam.x + TUNE.shoulderHalf);
    for (let xi = xiMin; xi < xiMax; xi++) {
      const sxa = xToS(xi), sxb = xToS(xi + 1);
      if (sxb < 0 || sxa > W) continue;
      const cx = xi + 0.5;
      const onPath = Math.abs(cx) < TUNE.trackHalf;
      const edge = !onPath && Math.abs(cx) < TUNE.trackHalf + 1;
      const n = hash2(xi, zi);
      let col;
      if (onPath) col = ((xi + zi) & 1) ? g.pathB : (n > 0.75 ? g.pathB : g.pathA);
      else if (edge) col = ((xi + zi) & 1) ? g.edge : (n > 0.5 ? g.c : g.b);
      else col = n > 0.82 ? g.c : ((xi + zi) & 1 ? g.b : g.a);
      ctx.fillStyle = col;
      ctx.fillRect(sxa, y0, sxb - sxa + 0.6, hh + 0.6);
    }
  }

  // fog gradient over the far half
  const fogTop = horizon + 2;
  const fogBottom = cam.groundY(TUNE.viewDist * 0.45);
  const fog = ctx.createLinearGradient(0, fogTop, 0, fogBottom);
  fog.addColorStop(0, biome.fog + 'ff');
  fog.addColorStop(1, biome.fog + '00');
  ctx.fillStyle = fog;
  ctx.fillRect(0, fogTop, W, fogBottom - fogTop);
}

// simple painter's queue for billboards/effects
export class DrawQueue {
  constructor() { this.items = []; }
  add(z, fn) { this.items.push({ z, fn }); }
  flush(ctx) {
    this.items.sort((a, b) => b.z - a.z);
    for (const it of this.items) it.fn(ctx);
    this.items.length = 0;
  }
}

export function drawShadow(ctx, p, wPx) {
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(p.sx, p.sy, wPx / 2, wPx / 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function outlineText(ctx, text, x, y, sizePx, fill = '#fff', align = 'center') {
  ctx.font = `bold ${Math.round(sizePx)}px 'Courier New', monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, sizePx / 7);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
