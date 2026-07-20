// Craft Rush effects: particle bursts, ground rings, floating text.

export const FxMixin = {
  // ---------- fx ----------
  burst(x, y, z, colors, n = 8, spd = 5) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x, y: y + Math.random() * 0.4, z,
        vx: (Math.random() - 0.5) * spd, vy: Math.random() * spd * 0.9 + 1.5, vz: (Math.random() - 0.5) * spd,
        life: 0.55 + Math.random() * 0.4, color: colors[i % colors.length], size: 0.11 + Math.random() * 0.1,
      });
    }
  },

  ring(x, z, maxR = 2.2) { this.rings.push({ x, z, r: 0.3, maxR, life: 0.4, T: 0.4 }); },

  floaty(text, x, z, color = '#fff', sizeMul = 1) {
    this.floaties.push({ text, x, z, y: 1.6, vy: 2.2, life: 0.95, T: 0.95, color, sizeMul });
  },

  updateFx(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy -= 16 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.4; p.vx *= 0.8; p.vz *= 0.8; }
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const r of this.rings) { r.life -= dt; r.r += (r.maxR / r.T) * dt; }
    this.rings = this.rings.filter(r => r.life > 0);
    for (const f of this.floaties) { f.life -= dt; f.y += f.vy * dt; }
    this.floaties = this.floaties.filter(f => f.life > 0);
  },
};
