// The mine: a shaft you dig down through and climb back up, an energy budget, and
// ore you sell at the top.
//
// Mixed into UI.prototype by ui.js, so `this` is the UI instance.
import { Audio } from '../audio.js';
import { MINE, PICKAXES, mineEnergy, nextPickaxe, persistSave, tileById } from '../config.js';
import { MineWorld } from '../minegame.js';

export const MineMixin = {
  // ---- mining minigame ----
  mineData() {
    const m = this.save.mine || (this.save.mine = { depth: 0, energy: MINE.energyCap, energyTs: 0, pickaxe: 'wood' });
    if (typeof m.depth !== 'number') m.depth = 0;
    if (typeof m.energy !== 'number') m.energy = MINE.energyCap;
    if (typeof m.energyTs !== 'number') m.energyTs = 0;
    if (!m.pickaxe) m.pickaxe = 'wood';
    if (!Array.isArray(m.dug)) m.dug = [];
    if (!m.inv || typeof m.inv !== 'object') m.inv = {};
    return m;
  },
  showMine() {
    const m = this.mineData();
    if (!m.energyTs) { m.energyTs = Date.now(); persistSave(this.save); } // seed the recharge clock
    this.openScreen('mine');
    if (this.save.music !== false) Audio.music('mine');
    this.wireMine();
    this.renderMine();
  },
  wireMine() {
    if (this._mineWired) return;
    this._mineWired = true;
    const E = this.els;
    this.mine = new MineWorld(E.mineCanvas, this.save);
    this.mine.settle();

    // tap a neighbouring block to swing at it; drag digs a run of them
    const swing = (e) => {
      const r = E.mineCanvas.getBoundingClientRect();
      const p = this.mine.tileFromPoint(e.clientX - r.left, e.clientY - r.top);
      this.digAt(p.x, p.y);
    };
    let down = false;
    E.mineCanvas.addEventListener('pointerdown', (e) => { down = true; swing(e); });
    E.mineCanvas.addEventListener('pointermove', (e) => { if (down) swing(e); });
    E.mineCanvas.addEventListener('pointerup', () => { down = false; });
    E.mineCanvas.addEventListener('pointerleave', () => { down = false; });
    E.btnSellOre.addEventListener('click', () => this.sellOre());

    const tick = () => {
      if (!E.mine.classList.contains('hidden')) {
        this.fitMineCanvas();
        this.mine.update(1 / 30);
        this.mine.draw();
      }
      this._mineRaf = requestAnimationFrame(tick);
    };
    if (!this._mineRaf) tick();
  },
  fitMineCanvas() {
    const cv = this.els.mineCanvas, r = cv.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w > 10 && h > 10 && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
  },
  digAt(x, y) {
    const m = this.mineData(), now = Date.now();
    const cur = mineEnergy(m, now);
    const res = this.mine.act(x, y, cur);
    if (!res.ok) {
      if (res.why === 'tier') { Audio.sfx('gate_bad'); this.els.mineStats.textContent = `Your pickaxe is too weak for ${res.tile.id}!`; }
      else if (res.why === 'energy') Audio.sfx('gate_bad');
      return;
    }
    if (res.moved) { Audio.sfx('click'); return; }   // a step costs nothing
    m.energy = Math.max(0, cur - res.spent);
    m.energyTs = now;
    Audio.sfx(res.broke ? (res.gained ? 'emerald' : 'hit') : 'hit', 30);
    persistSave(this.save);
    this.renderMine();
  },
  // the bag turns into emeralds whenever you want it to
  sellOre() {
    const m = this.mineData(), inv = m.inv || {};
    let total = 0;
    for (const [id, n] of Object.entries(inv)) total += (tileById(id).value || 0) * n;
    if (total <= 0) { Audio.sfx('gate_bad'); return; }
    this.save.emeralds += total;
    m.inv = {};
    persistSave(this.save);
    Audio.sfx('buy');
    this.els.mineStats.textContent = `Sold your haul for ${total}!`;
    this.renderMine();
  },
  renderMine() {
    const E = this.els, m = this.mineData(), now = Date.now();
    E.mineEmeralds.textContent = `${this.save.emeralds}`;
    const cur = mineEnergy(m, now), cap = MINE.energyCap;
    E.energyBar.style.width = `${(cur / cap) * 100}%`;
    E.energyText.textContent = `ENERGY ${cur} / ${cap}`;
    const pick = PICKAXES.find(p => p.id === m.pickaxe) || PICKAXES[0];
    E.mineStats.textContent = `Depth ${m.depth}  ·  ${pick.name} Pickaxe  ·  power ${pick.dmg}`;

    // what is in the bag, and what it is worth
    const inv = m.inv || {};
    E.mineBag.innerHTML = '';
    let worth = 0;
    for (const [id, n] of Object.entries(inv)) {
      if (!n) continue;
      const t = tileById(id);
      worth += (t.value || 0) * n;
      const chip = document.createElement('span'); chip.className = 'bagItem';
      const dot = document.createElement('i'); dot.className = 'bagDot'; dot.style.background = t.color;
      chip.append(dot, document.createTextNode(`${id.replace('ore', '')} ${n}`));
      E.mineBag.appendChild(chip);
    }
    if (!worth) E.mineBag.textContent = 'Tap rock to dig, tap open space to climb.';
    E.btnSellOre.textContent = worth ? `SELL ORE · ${worth}` : 'BAG EMPTY';
    E.btnSellOre.style.opacity = worth ? '1' : '0.6';

    const next = nextPickaxe(m.pickaxe);
    if (next) {
      E.btnPickUp.innerHTML = `${next.name} PICK · <span class="em"></span> ${next.cost}`;
      E.btnPickUp.style.opacity = this.save.emeralds >= next.cost ? '1' : '0.6';
    } else {
      E.btnPickUp.innerHTML = 'PICK MAXED';
      E.btnPickUp.style.opacity = '0.6';
    }
  },
  upgradePickaxe() {
    const m = this.mineData(), next = nextPickaxe(m.pickaxe);
    if (!next) return;
    if (this.save.emeralds < next.cost) { Audio.sfx('gate_bad'); return; }
    this.save.emeralds -= next.cost;
    m.pickaxe = next.id;
    persistSave(this.save);
    Audio.sfx('buy');
    this.renderMine();
  },
};
