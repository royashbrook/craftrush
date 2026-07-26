// A town drawn as a small top-down-ish diorama you can look at and poke: ground,
// a path, the houses you own, biome props, and the villagers who live there walking
// their loops. Pure canvas, seeded per town so a town always looks like itself.
import { TOWNS, townById, VILLAGERS, MAX_HOUSES, housePrice, HOME } from './config.js';
import { hash2 } from './engine.js';
import { getSprite, blit, hasSprite } from './assets.js';

// where the houses sit in the scene, as fractions of the view
const HOUSE_SPOTS = [
  { x: 0.20, y: 0.42 }, { x: 0.72, y: 0.40 },
  { x: 0.34, y: 0.72 }, { x: 0.82, y: 0.70 },
];

// per-biome scenery: which sprite to scatter and how green the grass reads
const TOWN_PROPS = {
  plains:   { prop: 'oak_tree',       ground: '#6bbf46', ground2: '#5aa93a', path: '#c2a26a' },
  cherry:   { prop: 'birch_tree',     ground: '#e69ec0', ground2: '#d488ac', path: '#d8b98f' },
  desert:   { prop: 'cactus',         ground: '#e8d79c', ground2: '#dcc98a', path: '#c9ab6d' },
  snowy:    { prop: 'snowy_spruce',   ground: '#e8f0f6', ground2: '#d3e2ee', path: '#b9c9d6' },
  savanna:  { prop: 'hay_bale',       ground: '#cdbb62', ground2: '#bcaa52', path: '#c0a05e' },
  mushroom: { prop: 'red_mushroom',   ground: '#9c8fb0', ground2: '#8b7ea0', path: '#c9bcae' },
  end:      { prop: 'end_pillar',     ground: '#ded7a2', ground2: '#cbc48f', path: '#a9a277' },
  nether:   { prop: 'crimson_fungus', ground: '#7a3630', ground2: '#682c26', path: '#8a4a3c' },
};
const propsFor = (id) => TOWN_PROPS[id] || TOWN_PROPS.plains;

// A villager walking its loop. Positions are fractions so the scene scales.
function makeWalker(townId, i, type) {
  const r = (n) => hash2(i * 7 + n, townId.length * 13 + n);
  return {
    type,
    x: 0.15 + r(1) * 0.7,
    y: 0.55 + r(2) * 0.35,
    // each one paces its own little beat, so the town never looks like a parade
    t: r(3) * 6.28,
    speed: 0.02 + r(4) * 0.03,
    range: 0.06 + r(5) * 0.12,
    home: 0,
  };
}

export class TownScene {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.walkers = [];
    this.townId = null;
    this.t = 0;
  }

  // rebuild the walking crew from what actually lives in this town
  setTown(townId, rec) {
    this.townId = townId;
    this.rec = rec;
    this.walkers = [];
    let i = 0;
    for (const v of VILLAGERS) {
      const n = (rec && rec.villagers && rec.villagers[v.id]) || 0;
      for (let k = 0; k < n; k++) {
        const w = makeWalker(townId, i++, v.id);
        w.home = w.x;
        this.walkers.push(w);
      }
    }
  }

  update(dt) {
    this.t += dt;
    for (const w of this.walkers) {
      w.t += dt * w.speed * 12;
      // pace back and forth around a home spot, pausing at the ends
      w.x = w.home + Math.sin(w.t) * w.range;
      w.facing = Math.cos(w.t) >= 0 ? 1 : -1;
      w.step = Math.abs(Math.cos(w.t)) > 0.25;   // still at the turnaround
    }
  }

  // houses the player owns, plus the next buyable slot
  houseSlots() {
    const rec = this.rec || { houses: [] };
    const owned = rec.houses ? rec.houses.length : 0;
    const slots = [];
    for (let i = 0; i < Math.min(MAX_HOUSES, HOUSE_SPOTS.length); i++) {
      slots.push({ index: i, ...HOUSE_SPOTS[i], owned: i < owned,
        price: i === owned ? housePrice(owned) : null });
    }
    return slots;
  }

  draw(locked) {
    const cv = this.cv, g = this.g;
    const W = cv.width, H = cv.height;
    if (!(W > 0 && H > 0)) return;
    const t = townById(this.townId);
    const P = propsFor(this.townId);

    // ground, in chunky blocks so it reads as the same world as the runner
    const cell = Math.max(8, Math.round(W / 22));
    for (let y = 0; y < H; y += cell) {
      for (let x = 0; x < W; x += cell) {
        const n = hash2(x / cell, y / cell);
        g.fillStyle = n > 0.5 ? P.ground : P.ground2;
        g.fillRect(x, y, cell + 1, cell + 1);
      }
    }

    // a path winding through the middle, the spine the town sits along
    g.fillStyle = P.path;
    const pathY = H * 0.58, pathH = Math.max(10, H * 0.1);
    for (let x = 0; x < W; x += cell) {
      const wob = Math.sin(x / W * 5) * H * 0.05;
      g.fillRect(x, pathY + wob, cell + 1, pathH);
    }

    // biome props scattered off the path
    if (hasSprite(P.prop)) {
      const spr = getSprite(P.prop);
      for (let i = 0; i < 7; i++) {
        const px = (0.06 + hash2(i, 3) * 0.9) * W;
        const py = (0.08 + hash2(i, 7) * 0.3) * H;
        blit(g, spr, 0, px, py, Math.max(18, H * 0.13));
      }
    }

    // houses: owned ones look lived in, the next slot shows its price
    for (const s of this.houseSlots()) {
      const hx = s.x * W, hy = s.y * H, hh = Math.max(26, H * 0.19);
      if (s.owned) {
        if (hasSprite('village_house')) blit(g, getSprite('village_house'), 0, hx, hy, hh);
      } else if (s.price != null) {
        g.globalAlpha = 0.55;
        g.fillStyle = '#000';
        g.fillRect(hx - hh * 0.5, hy - hh * 0.8, hh, hh * 0.8);
        g.globalAlpha = 1;
        if (hasSprite('ui_lock')) blit(g, getSprite('ui_lock'), 0, hx, hy - hh * 0.3, hh * 0.42);
      }
    }

    // the crew, drawn back to front so nearer ones overlap correctly
    const order = this.walkers.slice().sort((a, b) => a.y - b.y);
    for (const w of order) {
      const px = w.x * W, py = w.y * H;
      const hh = Math.max(16, H * 0.11);
      // each profession wears its own robe, so you can read the town at a glance
      const def = VILLAGERS.find((v) => v.id === w.type);
      const head = def && hasSprite(def.head) ? getSprite(def.head) : null;
      const body = def && hasSprite(def.body) ? getSprite(def.body, def.palette, `walk_${def.id}`) : null;
      const bob = w.step ? Math.abs(Math.sin(this.t * 8 + w.t)) * hh * 0.06 : 0;
      if (body) blit(g, body, 0, px, py - bob, hh * 0.62, { flip: w.facing < 0 });
      if (head) blit(g, head, 0, px, py - hh * 0.55 - bob, hh * 0.38);
    }

    // a locked town is a place you can see but not visit yet
    if (locked) {
      g.fillStyle = 'rgba(8,6,14,0.62)';
      g.fillRect(0, 0, W, H);
    }
  }
}
