// The mine: a real shaft you dig down through. The world is generated from (x, y)
// so nothing needs storing except which tiles you have already broken. A little
// miner stands in the hole, falls into empty space, and can only break what the
// pickaxe in hand is rated for.
import { MINE, TILES, mineTileAt, tileById, canBreak, pickaxeDmg } from './config.js';
import { getSprite, blit, hasSprite } from './assets.js';

const key = (x, y) => `${x},${y}`;

export class MineWorld {
  constructor(canvas, save) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.save = save;
    const m = save.mine;
    this.dug = new Set(Array.isArray(m.dug) ? m.dug : []);
    this.hits = new Map();                       // partial damage, not worth persisting
    this.mx = typeof m.mx === 'number' ? m.mx : 0;
    this.my = typeof m.my === 'number' ? m.my : 0;
    this.camY = this.my;
    this.t = 0;
    this.pops = [];                              // little "+3" flyups
  }

  // a tile is air if the world says so or if you already dug it out
  tileAt(x, y) {
    if (this.dug.has(key(x, y))) return TILES.air;
    return mineTileAt(x, y);
  }

  isOpen(x, y) { return this.tileAt(x, y).solid === false; }

  persist() {
    const m = this.save.mine;
    m.dug = [...this.dug];
    m.mx = this.mx; m.my = this.my;
    m.depth = Math.max(m.depth || 0, this.my);
  }

  // the miner sinks through any air beneath him, like a dug shaft should behave
  settle() {
    let guard = 0;
    while (this.isOpen(this.mx, this.my + 1) && guard++ < 64) this.my++;
  }

  // only the four neighbours are in reach, so digging feels deliberate
  inReach(x, y) {
    const dx = Math.abs(x - this.mx), dy = Math.abs(y - this.my);
    return (dx + dy) === 1;
  }

  /** Try to dig a tile. Returns a result the UI can speak to the player. */
  dig(x, y, energyLeft) {
    if (!this.inReach(x, y)) return { ok: false, why: 'reach' };
    const tile = this.tileAt(x, y);
    if (tile.solid === false) return { ok: false, why: 'air' };
    if (tile.hazard) return { ok: false, why: 'hazard' };
    if (!canBreak(this.save.mine.pickaxe, tile)) return { ok: false, why: 'tier', tile };
    if (energyLeft <= 0) return { ok: false, why: 'energy' };

    const k = key(x, y);
    const dealt = (this.hits.get(k) || 0) + pickaxeDmg(this.save.mine.pickaxe);
    if (dealt < (tile.hp || 1)) {
      this.hits.set(k, dealt);
      return { ok: true, broke: false, spent: 1 };
    }

    this.hits.delete(k);
    this.dug.add(k);
    let gained = null;
    if (tile.ore) {
      const inv = this.save.mine.inv || (this.save.mine.inv = {});
      inv[tile.id] = (inv[tile.id] || 0) + 1;
      gained = tile;
      this.pops.push({ x, y, text: `+1 ${tile.id}`, t: 0, color: tile.color });
    }
    // step in, then fall down any shaft you have opened up
    this.mx = x; this.my = y;
    this.settle();
    this.persist();
    return { ok: true, broke: true, spent: 1, tile, gained };
  }

  update(dt) {
    this.t += dt;
    this.camY += (this.my - this.camY) * Math.min(1, dt * 6);   // camera trails the miner
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1.1);
  }

  // pixel geometry for the current view, shared by draw and hit-testing
  metrics() {
    const W = this.cv.width, H = this.cv.height;
    const size = Math.max(12, Math.floor(W / MINE.cols));
    const cols = Math.ceil(W / size), rows = Math.ceil(H / size);
    const x0 = this.mx - Math.floor(cols / 2);
    const y0 = Math.round(this.camY) - Math.floor(rows * 0.42);
    return { W, H, size, cols, rows, x0, y0 };
  }

  tileFromPoint(px, py) {
    const { size, x0, y0 } = this.metrics();
    return { x: x0 + Math.floor(px / size), y: y0 + Math.floor(py / size) };
  }

  draw() {
    const g = this.g, { W, H, size, cols, rows, x0, y0 } = this.metrics();
    if (!(W > 0 && H > 0)) return;
    g.clearRect(0, 0, W, H);

    for (let ry = 0; ry <= rows; ry++) {
      for (let rx = 0; rx <= cols; rx++) {
        const tx = x0 + rx, ty = y0 + ry;
        const px = rx * size, py = ry * size;
        const tile = this.tileAt(tx, ty);
        if (tile.solid === false) {
          // open space: darker the deeper it is, so a shaft reads as a shaft
          g.fillStyle = ty < 0 ? '#7fb4e0' : '#171220';
          g.fillRect(px, py, size + 1, size + 1);
          continue;
        }
        // stone body, then the ore fleck on top so veins pop against it
        const base = tile.ore ? (ty > 60 ? '#3c3c44' : '#8a8a92') : (tile.color2 || tile.color);
        g.fillStyle = ((tx + ty) & 1) ? base : (tile.color2 || base);
        g.fillRect(px, py, size + 1, size + 1);
        if (tile.ore) {
          g.fillStyle = tile.color;
          const s = size * 0.3;
          g.fillRect(px + size * 0.16, py + size * 0.2, s, s);
          g.fillRect(px + size * 0.52, py + size * 0.48, s, s);
          g.fillRect(px + size * 0.28, py + size * 0.6, s * 0.7, s * 0.7);
        }
        // crack overlay for a tile you have started on
        const dealt = this.hits.get(key(tx, ty));
        if (dealt) {
          g.globalAlpha = Math.min(0.75, dealt / (tile.hp || 1));
          g.fillStyle = '#000';
          g.fillRect(px + size * 0.3, py + size * 0.15, size * 0.1, size * 0.7);
          g.fillRect(px + size * 0.55, py + size * 0.25, size * 0.1, size * 0.5);
          g.globalAlpha = 1;
        }
        g.strokeStyle = 'rgba(0,0,0,0.28)';
        g.strokeRect(px + 0.5, py + 0.5, size, size);
      }
    }

    // the miner himself, standing in the shaft
    const mpx = (this.mx - x0) * size + size / 2;
    const mpy = (this.my - y0) * size + size;
    const bob = Math.abs(Math.sin(this.t * 3)) * size * 0.05;
    if (hasSprite('runner_body_front')) {
      blit(g, getSprite('runner_body_front'), 0, mpx, mpy - bob, size * 0.92);
    }
    if (hasSprite('head_steve')) {
      blit(g, getSprite('head_steve'), 0, mpx, mpy - size * 0.66 - bob, size * 0.5);
    }

    // reach hints: the four tiles you could dig next
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const tx = this.mx + dx, ty = this.my + dy;
      if (this.tileAt(tx, ty).solid === false) continue;
      g.strokeRect((tx - x0) * size + 1, (ty - y0) * size + 1, size - 2, size - 2);
    }
    g.lineWidth = 1;

    for (const p of this.pops) {
      const px = (p.x - x0) * size + size / 2, py = (p.y - y0) * size - p.t * size;
      g.globalAlpha = Math.max(0, 1 - p.t);
      g.fillStyle = p.color;
      g.font = `bold ${Math.round(size * 0.42)}px monospace`;
      g.textAlign = 'center';
      g.fillText(p.text.split(' ')[0], px, py);
      g.globalAlpha = 1;
    }
  }
}
