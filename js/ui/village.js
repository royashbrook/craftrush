// The village hub: hiring villagers in the town you are standing in, and collecting
// what they earned while you were away.
//
// Mixed into UI.prototype by ui.js, so `this` is the UI instance.
import { Audio } from '../audio.js';
import { HOME, VILLAGERS, homeIncomeRate, pendingIdleWorld, persistSave, townById, townHasRoom, townPop, villagerCost, worldIncomeRate } from '../config.js';

export const VillageMixin = {
  // ---- home hub ----
  // the collection clock is world-wide; the crew lives per town
  homeData() {
    const h = this.save.home || (this.save.home = { lastCollect: 0 });
    if (typeof h.lastCollect !== 'number') h.lastCollect = 0;
    return h;
  },
  // which town the village screen is hiring for: wherever you are on the map
  villageTownId() {
    const w = this.worldData();
    const id = this.viewTown && this.townRec(this.viewTown) && this.townRec(this.viewTown).unlocked
      ? this.viewTown : w.town;
    return this.townRec(id).unlocked ? id : 'plains';
  },
  homePending() {
    const h = this.homeData();
    return pendingIdleWorld(this.worldData(), h.lastCollect, Date.now());
  },
  showHome() {
    const h = this.homeData();
    if (!h.lastCollect) { h.lastCollect = Date.now(); persistSave(this.save); } // seed the clock on first visit
    this.openScreen('home');
    if (this.save.music !== false) Audio.music('village');
    this.renderHome();
  },
  renderHome() {
    const E = this.els;
    const townId = this.villageTownId(), rec = this.townRec(townId), town = townById(townId);
    const crew = rec.villagers;
    E.homeEmeralds.textContent = `${this.save.emeralds}`;
    const rate = worldIncomeRate(this.worldData());
    const here = homeIncomeRate(crew);
    E.homeIncome.textContent = rate > 0
      ? `${town.name}: ${townPop(rec)}/${HOME.townCap} villagers, +${here}/hr · all towns +${rate}/hr`
      : `Hire someone in ${town.name} to start earning emeralds!`;

    const pending = this.homePending();
    if (pending > 0) {
      E.homeWelcome.classList.remove('hidden');
      E.homeWelcome.innerHTML = `<span>Villagers gathered <span class="em"></span> ${pending}!</span>`;
      const btn = document.createElement('button');
      btn.className = 'mcbtn small'; btn.textContent = 'COLLECT';
      btn.addEventListener('click', () => this.collectIdle());
      E.homeWelcome.appendChild(btn);
    } else {
      E.homeWelcome.classList.add('hidden');
    }

    // scene: one bobbing sprite per owned villager type, with a count
    E.homeScene.innerHTML = '';
    const owned = VILLAGERS.filter(v => crew[v.id] > 0);
    if (!owned.length) {
      const empty = document.createElement('div');
      empty.className = 'homeEmpty'; empty.textContent = `No one lives in ${town.name} yet. Hire someone!`;
      E.homeScene.appendChild(empty);
    } else {
      for (const v of owned) {
        const wrap = document.createElement('div');
        wrap.className = 'homeSprite';
        const cv = document.createElement('canvas');
        cv.width = 40; cv.height = 56;
        cv.style.width = '40px'; cv.style.height = '56px';
        cv.style.animationDelay = `${(VILLAGERS.indexOf(v) % 5) * 0.2}s`;
        this.drawSkinPreview(cv, v);
        wrap.appendChild(cv);
        const cnt = document.createElement('div');
        cnt.className = 'cnt'; cnt.textContent = `×${crew[v.id]}`;
        wrap.appendChild(cnt);
        E.homeScene.appendChild(wrap);
      }
    }

    // villager shop list
    E.villagerList.innerHTML = '';
    for (const v of VILLAGERS) {
      const count = crew[v.id];
      const cost = villagerCost(v.id, count);
      const canAfford = this.save.emeralds >= cost;
      const card = document.createElement('div');
      card.className = 'vCard';
      const cv = document.createElement('canvas');
      cv.width = 64; cv.height = 88;
      this.drawSkinPreview(cv, v);
      card.appendChild(cv);
      const info = document.createElement('div');
      info.className = 'vInfo';
      info.innerHTML = `<div class="vName">${v.name} <span style="color:#b8f0c8">×${count}</span></div>`
        + `<div class="vMeta">+${v.income}/hr each · next <span class="em"></span> ${cost}</div>`;
      card.appendChild(info);
      const buy = document.createElement('button');
      buy.className = 'vBuy' + (canAfford ? '' : ' cant');
      buy.innerHTML = `<span class="em"></span> ${cost}`;
      buy.addEventListener('click', () => this.buyVillager(v.id));
      card.appendChild(buy);
      E.villagerList.appendChild(card);
    }
  },
  buyVillager(id) {
    const rec = this.townRec(this.villageTownId());
    if (!townHasRoom(rec)) { Audio.sfx('gate_bad'); return; }   // this town is full
    const cost = villagerCost(id, rec.villagers[id]);
    if (this.save.emeralds < cost) { Audio.sfx('gate_bad'); return; }
    this.save.emeralds -= cost;
    rec.villagers[id]++;
    persistSave(this.save);
    Audio.sfx('buy');
    this.renderHome();
  },
  collectIdle() {
    const h = this.homeData();
    const pending = this.homePending();
    if (pending <= 0) return;
    this.save.emeralds += pending;
    h.lastCollect = Date.now();
    persistSave(this.save);
    Audio.sfx('emerald');
    this.renderHome();
  },
};
