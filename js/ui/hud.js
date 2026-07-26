// The in-run HUD: wallet, level, progress and the golem meter.
//
// Mixed into UI.prototype by ui.js, so `this` is the UI instance.

export const HudMixin = {
  // ---------- HUD ----------
  updateHud(s) {
    const E = this.els;
    if (this._em !== s.emeralds) { this._em = s.emeralds; E.hudEmeralds.textContent = `${s.emeralds}`; }
    const lv = `LV ${s.level} · ${s.biome}`;
    if (this._lv !== lv) { this._lv = lv; E.hudLevel.textContent = lv; }
    const prog = `${(s.progress * 100).toFixed(1)}%`;
    if (this._prog !== prog) { this._prog = prog; E.hudProgress.style.width = prog; }
    const pct = s.redstone / s.redstoneMax;
    const fill = `${(pct * 100).toFixed(0)}%`;
    if (this._fill !== fill) { this._fill = fill; E.golemFill.style.width = fill; }
    const ready = pct >= 1;
    if (this._ready !== ready) { this._ready = ready; E.golemMeter.classList.toggle('ready', ready); }
    const glabel = ready ? 'GOLEM INCOMING!' : `GOLEM ${Math.floor(pct * 100)}%`;
    if (this._glabel !== glabel) { this._glabel = glabel; E.golemLabel.textContent = glabel; }
    // powerups
    const chips = [];
    if (s.power.triple > 0) chips.push(`3× ${Math.ceil(s.power.triple)}s`);
    if (s.power.rapid > 0) chips.push(`RAPID ${Math.ceil(s.power.rapid)}s`);
    if (s.power.power > 0) chips.push(`POWER ${Math.ceil(s.power.power)}s`);
    if (s.power.sword > 0) chips.push(`SWORD ${Math.ceil(s.power.sword)}s`);
    if (s.power.axe > 0) chips.push(`AXE ${Math.ceil(s.power.axe)}s`);
    const cstr = chips.join('  ');
    if (this._chips !== cstr) { this._chips = cstr; E.powerChips.textContent = cstr; }
    // boss
    if (s.bossActive) {
      if (!this._bossShown) { this._bossShown = true; E.bossBar.classList.remove('hidden'); E.bossName.textContent = s.boss.name; }
      E.bossFill.style.width = `${(s.boss.hp / s.boss.max * 100).toFixed(1)}%`;
      const hint = s.boss.needRunners ? `NEED ~${s.boss.needRunners} RUNNERS!` : '';
      if (this._bossHint !== hint) { this._bossHint = hint; E.bossHint.textContent = hint; }
    } else if (this._bossShown) {
      this._bossShown = false; E.bossBar.classList.add('hidden');
    }
  },
};
