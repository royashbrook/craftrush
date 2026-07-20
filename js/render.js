// Craft Rush rendering: billboards, scenery, crowd, enemies, boss, fx draw.
import { TUNE, SKINS, TIERS, PICKUPS } from './config.js';
import { drawShadow, outlineText, hash2 } from './engine.js';
import { getSprite, blit, hasSprite } from './assets.js';

export const RenderMixin = {
  bb(q, spriteId, x, z, worldH, opts = {}) {
    const p = this.cam.project(x, 0, z);
    if (!p || p.sy < this.cam.horizon - 200) return;
    const spr = getSprite(spriteId, opts.palette, opts.palKey);
    q.add(z + (opts.zBias || 0), (ctx) => {
      const hPx = worldH * p.s;
      if (opts.shadow !== false) drawShadow(ctx, p, hPx * spr.w / spr.h * 0.8);
      const yOff = (opts.yOff || 0) * p.s;
      blit(ctx, spr, opts.frame || 0, p.sx, p.sy - yOff, hPx, opts);
    });
  },

  renderScenery(q) {
    // deterministic per-cell decoration, no storage
    const seed = 4242 + this.level * 17;
    const zi0 = Math.floor(this.cam.z + 2), zi1 = Math.floor(this.cam.z + TUNE.viewDist);
    for (let zi = zi0; zi <= zi1; zi++) {
      for (const side of [-1, 1]) {
        const h = hash2(zi, seed + side * 31);
        if (h < 0.24) {
          const sc = this.biome.scenery;
          const id = sc[Math.floor(hash2(zi, seed + side * 77) * sc.length)];
          if (!hasSprite(id)) continue;
          const x = side * (TUNE.trackHalf + 1.6 + hash2(zi, seed + side * 13) * 3.4);
          const wh = id.includes('tree') || id.includes('pillar') || id.includes('house') ? 3.1 : id.includes('fungus') || id.includes('cactus') ? 1.9 : 1.1;
          this.bb(q, id, x, zi + 0.5, wh + hash2(zi, side) * 0.5, { shadow: false });
        }
      }
    }
  },

  renderGates(q) {
    for (const gt of this.gates) {
      if (gt.used) continue;
      const p = this.cam.project(gt.x, 0, gt.z);
      if (!p) continue;
      const good = this.gateGood(gt);
      q.add(gt.z, (ctx) => {
        const wPx = gt.halfW * 2 * p.s;
        const hPx = 2.3 * p.s * (1 + gt.pulse * 1.4);
        const x0 = p.sx - wPx / 2, y0 = p.sy - hPx;
        // posts
        ctx.fillStyle = '#241b2e';
        ctx.fillRect(x0 - p.s * 0.18, y0, p.s * 0.22, hPx);
        ctx.fillRect(x0 + wPx - p.s * 0.04, y0, p.s * 0.22, hPx);
        ctx.fillRect(x0 - p.s * 0.18, y0 - p.s * 0.2, wPx + p.s * 0.4, p.s * 0.24);
        // portal fill
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = good ? '#3fa9ff' : '#ff5533';
        ctx.fillRect(x0, y0, wPx, hPx);
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#ffffff';
        const sh = ((this.t * 2 + gt.z) % 1) * hPx;
        ctx.fillRect(x0, y0 + sh, wPx, Math.max(2, hPx * 0.08));
        ctx.globalAlpha = 1;
        outlineText(ctx, this.gateLabel(gt), p.sx, y0 + hPx * 0.42, Math.max(11, p.s * 0.8), good ? '#eaf6ff' : '#ffe3dc');
        if (this.mode === 'shooter' && !good) {
          outlineText(ctx, 'SHOOT ME!', p.sx, y0 + hPx * 0.8, Math.max(8, p.s * 0.3), '#ffd94d');
        }
      });
    }
  },

  renderObstacles(q) {
    for (const o of this.obstacles) {
      this.bb(q, o.sprite, o.x + Math.sin(o.wobble * 40) * 0.06, o.z, 1.15, {});
    }
  },

  renderPickups(q) {
    for (const p of this.pickups) {
      if (p.dead) continue;
      const def = PICKUPS[p.kind] || PICKUPS.emerald;
      const bob = def.grounded ? 0 : Math.sin(p.t * 3 + p.z) * 0.12 + 0.5;
      const frame = Math.floor(p.t * 3) % 2;
      this.bb(q, def.sprite, p.x, p.z, def.worldH, { yOff: bob, frame, zBias: -0.01 });
    }
  },

  renderEnemies(q) {
    for (const e of this.enemies) {
      const spriteId = e.type.sprite || e.id;
      const hop = e.type.hops ? Math.abs(Math.sin(e.t * 5)) * 0.35 : 0;
      const fl = e.type.floats ? 0.5 + Math.sin(e.t * 3) * 0.15 : 0;
      const fuseFlash = e.fuse >= 0 && (Math.floor(e.t * 12) % 2 === 0);
      this.bb(q, spriteId, e.x, e.z, e.type.worldH, {
        frame: Math.floor(e.t * 5) % 2,
        flash: e.flash > 0 || fuseFlash,
        yOff: hop + fl,
      });
      // hp pips for tougher enemies
      if (e.maxHp >= 10 && e.hp < e.maxHp) {
        const p = this.cam.project(e.x, 0, e.z);
        if (p) q.add(e.z - 0.01, (ctx) => {
          const w = p.s * 1.2, y = p.sy - e.type.worldH * p.s - p.s * 0.3;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(p.sx - w / 2, y, w, Math.max(2, p.s * 0.1));
          ctx.fillStyle = '#ff5545';
          ctx.fillRect(p.sx - w / 2, y, w * (e.hp / e.maxHp), Math.max(2, p.s * 0.1));
        });
      }
    }
  },

  renderWavesTelegraph(ctx) {
    for (const w of this.waves) {
      const steps = 14;
      ctx.globalAlpha = w.warn > 0 ? 0.22 + 0.12 * Math.sin(this.t * 16) : 0.4;
      ctx.fillStyle = w.color || '#ff3b2e';
      const z0 = this.playerZ + 1, z1 = w.z;
      for (let i = 0; i < steps; i++) {
        const z = z0 + (z1 - z0) * (i / steps);
        const pa = this.cam.project(w.x - w.halfW, 0, z);
        const pb = this.cam.project(w.x + w.halfW, 0, z + (z1 - z0) / steps);
        if (!pa || !pb) continue;
        ctx.fillRect(pa.sx, Math.min(pa.sy, pb.sy), pb.sx - pa.sx, Math.abs(pa.sy - pb.sy) + 1);
      }
      ctx.globalAlpha = 1;
    }
  },

  renderSummons(q) {
    for (const s of this.summons) {
      this.bb(q, 'iron_golem', s.x, s.z, 2.6, { frame: Math.floor(s.t * 6) % 2 });
    }
  },

  renderBoss(q) {
    const b = this.boss;
    const shakeX = b.lunge > 0 && b.lunge < 0.5 ? (Math.random() - 0.5) * 0.2 : 0;
    this.bb(q, b.id, b.x + shakeX, b.z, b.type.worldH, {
      frame: Math.floor(b.t * 3) % 2,
      flash: b.flash > 0,
    });
  },

  capeSprite() {
    const def = this.cosmetic?.cape;
    if (!def) return null;
    if (def.rainbow) {
      const CYCLE = [
        { c: '#ff5545', C: '#c02a1c' }, { c: '#ffd94d', C: '#c29222' },
        { c: '#2eff70', C: '#1d8f3e' }, { c: '#3fa9ff', C: '#2465a8' },
        { c: '#c76bff', C: '#8b3fd6' },
      ];
      const i = Math.floor(this.t * 4) % CYCLE.length;
      return getSprite('cape', CYCLE[i], `cape_rainbow_${i}`);
    }
    return getSprite('cape', def.colors, def.id);
  },

  renderCrowd(q) {
    const skin = this.skin || SKINS[0];
    const capeSpr = this.capeSprite();
    const hatDef = this.cosmetic?.hat;
    const hatSpr = hatDef && hasSprite(hatDef.sprite) ? getSprite(hatDef.sprite) : null;

    const drawUnit = (x, z, worldH, frame, bob, phase, tier, flash) => {
      const p = this.cam.project(x, 0, z);
      if (!p) return;
      // giants get a per-tier boot accent (gold, fire, ender) to read as elite
      const palette = tier > 0 ? { ...skin.palette, b: TIERS.units[tier - 1].boots } : skin.palette;
      const palKey = tier > 0 ? `${skin.id}_t${tier}` : skin.id;
      q.add(z, (ctx) => {
        const hPx = worldH * p.s;
        const px1 = hPx / 18; // one art pixel of the 18px-tall runner
        const spr = getSprite('runner_back', palette, palKey);
        drawShadow(ctx, p, hPx * spr.w / spr.h * 0.8);
        const y = p.sy - bob * p.s;
        blit(ctx, spr, frame, p.sx, y, hPx, { flash });
        if (capeSpr) {
          const sway = Math.sin(this.t * 6 + phase);
          blit(ctx, capeSpr, Math.abs(sway) > 0.45 ? 1 : 0, p.sx, y - px1 * 3.5, px1 * 9, { flip: sway < 0 });
        }
        if (hatSpr) {
          // scale hats to head width (~8 art px incl. overhang), not their native size
          blit(ctx, hatSpr, 0, p.sx, y - hPx + px1 * 1.2, (hatSpr.h / hatSpr.w) * 8 * px1);
        }
      });
    };

    for (const m of this.crowd) {
      drawUnit(this.playerX + m.ox, this.playerZ + m.oz, 1.45,
        Math.floor(this.t * 8 + m.phase) % 2,
        Math.abs(Math.sin(this.t * 9 + m.phase)) * 0.12, m.phase, 0, false);
    }
    const topIdx = TIERS.units.length - 1;
    TIERS.units.forEach((u, i) => {
      const scale = 1.45 * (i === topIdx ? this.topTierScale() : u.scale);
      const rate = Math.max(3, 8 - i * 1.5);
      for (const g of this.bigs[i]) {
        drawUnit(this.playerX + g.ox, this.playerZ + g.oz, scale,
          Math.floor(this.t * rate + g.phase) % 2,
          Math.abs(Math.sin(this.t * rate + g.phase)) * (0.12 + i * 0.03), g.phase, i + 1, g.flash > 0);
      }
    });
  },

  renderPet(q) {
    const pet = this.cosmetic?.pet;
    if (!pet || !hasSprite(pet.sprite) || (this.state !== 'run' && this.state !== 'boss')) return;
    const flying = pet.id === 'pet_parrot';
    const bob = flying ? 1.4 + Math.sin(this.t * 4) * 0.25 : Math.abs(Math.sin(this.t * 8)) * 0.15;
    // scouts ahead of the crowd where it's always visible
    this.bb(q, pet.sprite, this.playerX + 2.3, this.playerZ + 3.2, flying ? 0.8 : 1.0, {
      frame: Math.floor(this.t * 6) % 2, yOff: bob, shadow: !flying,
    });
  },

  renderArrows(q) {
    const trail = this.cosmetic?.trail;
    for (const a of this.arrows) {
      const p = this.cam.project(a.x, 0, a.z);
      if (!p) continue;
      q.add(a.z, (ctx) => {
        if (trail) {
          for (let k = 1; k <= 3; k++) {
            const tp = this.cam.project(a.x, 0, a.z - k * 0.55);
            if (!tp) continue;
            ctx.globalAlpha = 0.5 / k;
            ctx.fillStyle = trail.rainbow
              ? trail.colors[(k + Math.floor(this.t * 10)) % trail.colors.length]
              : trail.colors[(k - 1) % trail.colors.length];
            const s = Math.max(2, tp.s * (a.big ? 0.24 : 0.14));
            ctx.fillRect(tp.sx - s / 2, tp.sy - tp.s * 0.75, s, s);
          }
          ctx.globalAlpha = 1;
        }
        if (hasSprite('arrow')) {
          const spr = getSprite('arrow');
          blit(ctx, spr, 0, p.sx, p.sy - p.s * 0.75, (a.big ? 1.1 : 0.6) * p.s);
        } else {
          ctx.fillStyle = '#ffe9a0';
          ctx.fillRect(p.sx - 1.5, p.sy - p.s * 1.4, a.big ? 5 : 3, p.s * 0.7);
        }
      });
    }
  },

  renderEshots(q) {
    for (const s of this.eshots) {
      const id = s.kind === 'fireball' ? 'fireball' : s.kind === 'potion' ? 'potion' : 'arrow';
      this.bb(q, id, s.x, s.z, s.kind === 'fireball' ? 0.7 : 0.6, { yOff: s.y || 0.8, frame: Math.floor(this.t * 8) % 2, shadow: false });
    }
  },

  renderParticles(q) {
    for (const p of this.particles) {
      const pr = this.cam.project(p.x, p.y, p.z);
      if (!pr) continue;
      q.add(p.z, (ctx) => {
        ctx.globalAlpha = Math.min(1, p.life * 2.5);
        ctx.fillStyle = p.color;
        const s = Math.max(1.5, p.size * pr.s);
        ctx.fillRect(pr.sx - s / 2, pr.sy - s / 2, s, s);
        ctx.globalAlpha = 1;
      });
    }
    for (const r of this.rings) {
      const pr = this.cam.project(r.x, 0, r.z);
      if (!pr) continue;
      q.add(r.z, (ctx) => {
        ctx.globalAlpha = r.life / r.T * 0.7;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = Math.max(2, pr.s * 0.12);
        ctx.beginPath();
        ctx.ellipse(pr.sx, pr.sy, r.r * pr.s, r.r * pr.s * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }
  },

  renderFloaties(ctx) {
    for (const f of this.floaties) {
      const p = this.cam.project(f.x, f.y, f.z);
      if (!p) continue;
      ctx.globalAlpha = Math.min(1, f.life * 3);
      outlineText(ctx, f.text, p.sx, p.sy, Math.min(46, Math.max(12, p.s * 0.55 * f.sizeMul)), f.color);
      ctx.globalAlpha = 1;
    }
  },

  renderCrowdLabel(ctx) {
    if (this.state !== 'run' && this.state !== 'boss') return;
    const p = this.cam.project(this.playerX, 2.3, this.playerZ);
    if (!p) return;
    // show total army worth — the number just keeps climbing, no cap
    const w = this.worth();
    const low = w <= 3;
    outlineText(ctx, `${w}`, p.sx, p.sy, Math.max(15, p.s * 0.62), low ? '#ff8d7a' : '#ffffff');
  },
};
