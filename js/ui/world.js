// The world map: eight towns, buying into them, and the houses inside each.
//
// Mixed into UI.prototype by ui.js, so `this` is the UI instance.
import { Audio } from '../audio.js';
import { MAX_HOUSES, TOWNS, homeIncomeRate, housePrice, makeHouse, migrateWorld, persistSave, townById, townPop } from '../config.js';
import { TownScene } from '../townscene.js';

export const WorldMixin = {
  // ensure the current house's people list exists and references owned/valid items
  // ---- world / towns / houses ----
  worldData() { return migrateWorld(this.save); },
  townRec(id) { const w = this.worldData(); return w.towns[id || w.town]; },
  showWorld() {
    this.worldData();
    this.openScreen('world');
    if (this.save.music !== false) Audio.music('village');
    this.wireWorld();
    if (!this.viewTown || !this.townRec(this.viewTown)) this.viewTown = this.worldData().town;
    this.renderWorld();
  },
  // one canvas showing the town you're looking at; swipe or tap the arrows to travel
  wireWorld() {
    if (this._worldWired) return;
    this._worldWired = true;
    const E = this.els;
    this.scene = new TownScene(E.townCanvas);
    this.viewTown = this.worldData().town;

    E.townPrev.addEventListener('click', () => this.stepTown(-1));
    E.townNext.addEventListener('click', () => this.stepTown(1));
    E.btnTownAction.addEventListener('click', () => this.townAction());

    // swipe the scene to travel, tap it to poke a house
    let sx = 0, sy = 0, moved = false, down = false;
    E.townCanvas.addEventListener('pointerdown', (e) => { down = true; moved = false; sx = e.clientX; sy = e.clientY; });
    E.townCanvas.addEventListener('pointermove', (e) => {
      if (down && Math.abs(e.clientX - sx) > 12) moved = true;
    });
    E.townCanvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      down = false;
      const dx = e.clientX - sx;
      if (moved && Math.abs(dx) > 40 && Math.abs(e.clientY - sy) < 60) { this.stepTown(dx < 0 ? 1 : -1); return; }
      if (!moved) this.tapTown(e);
    });

    // the scene is alive: villagers keep walking while you look at it
    const tick = () => {
      if (!this.els.world.classList.contains('hidden')) {
        this.fitTownCanvas();
        this.scene.update(1 / 30);
        this.scene.draw(!this.townRec(this.viewTown).unlocked);
      }
      this._worldRaf = requestAnimationFrame(tick);
    };
    if (!this._worldRaf) tick();
  },
  // the canvas only knows its real size once it is laid out, so keep them in sync
  fitTownCanvas() {
    const cv = this.els.townCanvas, r = cv.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w > 10 && h > 10 && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
  },
  stepTown(dir) {
    const ids = TOWNS.map((t) => t.id);
    const i = Math.max(0, ids.indexOf(this.viewTown));
    const next = ids[Math.min(ids.length - 1, Math.max(0, i + dir))];
    if (next === this.viewTown) return;
    this.viewTown = next;
    Audio.sfx('click');
    this.renderWorld();
  },
  // tapping the scene: a house you own opens, the next slot offers to be bought
  tapTown(e) {
    const rec = this.townRec(this.viewTown);
    if (!rec.unlocked) { this.townAction(); return; }
    const r = this.els.townCanvas.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    for (const slot of this.scene.houseSlots()) {
      if (Math.abs(fx - slot.x) < 0.13 && Math.abs(fy - slot.y) < 0.15) {
        if (slot.owned) {
          const w = this.worldData();
          w.town = this.viewTown; w.house = slot.index;
          persistSave(this.save);
          this.showPlayroom();
        } else if (slot.price != null) {
          this.buyHouseIn(this.viewTown);
        }
        return;
      }
    }
  },
  // the bottom button does whatever this town needs next
  townAction() {
    const rec = this.townRec(this.viewTown);
    if (!rec.unlocked) { this.unlockTown(this.viewTown); this.renderWorld(); return; }
    const w = this.worldData();
    w.town = this.viewTown; w.house = 0;
    persistSave(this.save);
    this.showPlayroom();
  },
  buyHouseIn(townId) {
    const rec = this.townRec(townId);
    const price = housePrice(rec.houses.length);
    if (rec.houses.length >= MAX_HOUSES) { Audio.sfx('gate_bad'); return; }
    if (this.save.emeralds < price) { Audio.sfx('gate_bad'); return; }
    this.save.emeralds -= price;
    rec.houses.push(makeHouse(townId));
    persistSave(this.save);
    Audio.sfx('buy');
    this.renderWorld();
  },
  renderWorld() {
    const E = this.els, w = this.worldData();
    if (!this.scene) return;
    const id = this.viewTown || w.town;
    this.viewTown = id;
    const t = townById(id), rec = this.townRec(id);

    this.fitTownCanvas();
    this.scene.setTown(id, rec);
    this.scene.draw(!rec.unlocked);

    const ids = TOWNS.map((x) => x.id), i = ids.indexOf(id);
    E.townPrev.disabled = i <= 0;
    E.townNext.disabled = i >= ids.length - 1;

    E.townDots.innerHTML = '';
    for (const x of TOWNS) {
      const d = document.createElement('i');
      const xr = this.townRec(x.id);
      d.className = (x.id === id ? 'on' : (xr.unlocked ? '' : 'locked'));
      E.townDots.appendChild(d);
    }

    E.worldTownName.textContent = t.name;
    if (!rec.unlocked) {
      E.worldTownSub.textContent = `Locked · ${t.cost} emeralds`;
      E.btnTownAction.textContent = this.save.emeralds >= t.cost ? 'UNLOCK' : 'TOO PRICEY';
      E.btnTownAction.style.opacity = this.save.emeralds >= t.cost ? '1' : '0.6';
    } else {
      const pop = townPop(rec), rate = homeIncomeRate(rec.villagers);
      E.worldTownSub.textContent = `${rec.houses.length} ${rec.houses.length === 1 ? 'house' : 'houses'} · ${pop} villagers · +${rate}/hr`;
      E.btnTownAction.textContent = 'VISIT';
      E.btnTownAction.style.opacity = '1';
    }
  },
  unlockTown(id) {
    const t = townById(id), rec = this.townRec(id);
    if (rec.unlocked) return;
    if (this.save.emeralds < t.cost) { Audio.sfx('gate_bad'); return; }
    this.save.emeralds -= t.cost;
    rec.unlocked = true;
    if (!rec.houses.length) rec.houses.push(makeHouse(id)); // arrives pre-decorated
    persistSave(this.save);
    Audio.sfx('fanfare');
    this.viewTown = id;
    this.renderWorld();
  },
  enterTown(id) {
    const w = this.worldData();
    w.town = id; w.house = 0;
    persistSave(this.save);
    Audio.sfx('click');
    this.showTown();
  },
  showTown() {
    this.worldData();
    this.openScreen('town');
    this.renderTown();
  },
  renderTown() {
    const E = this.els, w = this.worldData(), t = townById(w.town), rec = this.townRec();
    E.townTitle.textContent = t.name.toUpperCase();
    E.townEmeralds.textContent = `${this.save.emeralds}`;
    E.townHint.textContent = w.carry
      ? 'You are carrying a friend — go into a house to place them'
      : 'Tap a house to go inside';
    E.houseGrid.innerHTML = '';
    rec.houses.forEach((h, i) => {
      const card = document.createElement('button');
      card.className = 'townCard' + (i === w.house ? ' here' : '');
      const icon = document.createElement('canvas'); icon.className = 'townIcon';
      this.drawTownIcon(icon, t, true);
      const name = document.createElement('div'); name.className = 'townName'; name.textContent = `House ${i + 1}`;
      const meta = document.createElement('div'); meta.className = 'townMeta';
      meta.textContent = `${h.people.length} ${h.people.length === 1 ? 'friend' : 'friends'}`;
      card.append(icon, name, meta);
      card.addEventListener('click', () => this.enterHouse(i));
      E.houseGrid.appendChild(card);
    });
    const full = rec.houses.length >= MAX_HOUSES;
    const cost = housePrice(rec.houses.length);
    E.btnBuyHouse.classList.toggle('hidden', full);
    if (!full) {
      E.btnBuyHouse.innerHTML = `＋ BUY HOUSE · <span class="em"></span> ${cost}`;
      E.btnBuyHouse.style.opacity = this.save.emeralds >= cost ? '1' : '0.6';
    }
  },
  buyHouse() {
    const rec = this.townRec(), w = this.worldData();
    if (rec.houses.length >= MAX_HOUSES) return;
    const cost = housePrice(rec.houses.length);
    if (this.save.emeralds < cost) { Audio.sfx('gate_bad'); return; }
    this.save.emeralds -= cost;
    rec.houses.push(makeHouse(w.town)); // pre-decorated, never an empty box
    persistSave(this.save);
    Audio.sfx('buy');
    this.renderTown();
  },
  // The house is wider than the viewport — you drag the background to pan through it.
  WORLD_SCALE: 2.4,
  // An installed PWA suspends and resumes instead of re-navigating, so it can hold
  // onto old app files indefinitely. This drops the cached files and the worker and
  // reloads. It only clears CACHES, never localStorage, so the save survives.
  async forceUpdate() {
    this.els.setMsg.textContent = 'Getting the latest version…';
    try {
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch { /* clearing is best effort; the reload below still helps */ }
    location.reload();
  },
};
