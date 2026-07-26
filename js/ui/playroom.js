// The playroom. A house you decorate and fill with friends you can dress and drag
// around. The ragdoll is the fiddly part: limbs are single sprites the physics
// rotates, rather than drawn frames.
//
// Mixed into UI.prototype by ui.js, so `this` is the UI instance.
import { blit, getSprite, hasSprite } from '../assets.js';
import { Audio } from '../audio.js';
import { COSMETICS, DECOR, ROOM_TIERS, SKINS, clamp01, decorById, persistSave, roomTierById, styleById, townById } from '../config.js';

export const PlayroomMixin = {
  // ---- playroom (dressable playmates) ----
  ownedSkins() { return SKINS.filter(s => this.save.unlocked.includes(s.id)); },
  ownedCos(cat) { return COSMETICS[cat].filter(c => c.id === 'none' || this.save.cosmeticsOwned.includes(c.id)); },
  skinById(id) { return SKINS.find(s => s.id === id) || SKINS[0]; },
  // draw a limb sprite hanging from a joint (jx,jy), rotated by `angle` radians
  drawLimb(g, name, palette, key, jx, jy, hPx, angle) {
    const spr = getSprite(name, palette, key);
    const src = spr.frames[0];
    const wPx = spr.w * (hPx / spr.h);
    g.save(); g.translate(jx, jy); g.rotate(angle);
    g.drawImage(src, -wPx / 2, 0, wPx, hPx); // top edge at the joint, hangs down
    g.restore();
  },
  // Compose a front-facing character from separate limbs so it can ragdoll.
  // pose = { aL, aR, lL, lR } are arm/leg swing angles in radians (default rest).
  drawDressedCharacter(cv, skinObj, cos = {}, pose = null) {
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    const S = cv.height / 80, cx = cv.width / 2, pal = skinObj.palette, key = skinObj.id;
    const P = pose || { aL: 0, aR: 0, lL: 0, lR: 0 };
    const shoulderY = 30 * S, hipY = 50 * S, headCY = 16 * S;
    const shoulderDX = 9 * S, hipDX = 4.5 * S;
    const armLen = 22 * S, legLen = 26 * S, headH = 24 * S, torsoH = 24 * S;

    // cape: a wide cloak behind the torso (peeks out both sides so it actually reads)
    if (cos.cape && cos.cape !== 'none') {
      const def = COSMETICS.cape.find(c => c.id === cos.cape);
      if (def) {
        const cape = getSprite('cape', def.rainbow ? { c: '#ff5545', C: '#3fa9ff' } : def.colors, `pm_cape_${cos.cape}`);
        const w = 30 * S, h = 34 * S;
        g.save(); g.translate(cx, shoulderY - 4 * S); g.rotate((P.lL + P.lR) * 0.15);
        g.drawImage(cape.frames[0], -w / 2, 0, w, h); g.restore();
      }
    }
    // legs (behind the torso)
    this.drawLimb(g, 'pm_leg', pal, `${key}_leg`, cx - hipDX, hipY, legLen, P.lL);
    this.drawLimb(g, 'pm_leg', pal, `${key}_leg`, cx + hipDX, hipY, legLen, P.lR);
    // torso
    const torso = getSprite('pm_torso', pal, `${key}_torso`);
    const tw = torso.w * (torsoH / torso.h);
    g.drawImage(torso.frames[0], cx - tw / 2, hipY - torsoH, tw, torsoH);
    // arms (in front of the torso)
    this.drawLimb(g, 'pm_arm', pal, `${key}_arm`, cx - shoulderDX, shoulderY, armLen, P.aL);
    this.drawLimb(g, 'pm_arm', pal, `${key}_arm`, cx + shoulderDX, shoulderY, armLen, P.aR);
    // head
    const head = getSprite(skinObj.head);
    const hw = head.w * (headH / head.h);
    const headTop = headCY - headH / 2;
    g.drawImage(head.frames[0], cx - hw / 2, headTop, hw, headH);
    // hat on the head
    if (cos.hat && cos.hat !== 'none') {
      const def = COSMETICS.hat.find(h => h.id === cos.hat);
      if (def && hasSprite(def.sprite)) {
        const hat = getSprite(def.sprite);
        const hatW = hw * 1.05, hatH = hat.h * (hatW / hat.w);
        g.drawImage(hat.frames[0], cx - hatW / 2, headTop - hatH + 3 * S, hatW, hatH);
      }
    }
  },
  curHouse() {
    const w = this.worldData();
    const houses = w.towns[w.town].houses;
    return houses[w.house] || houses[0];
  },
  enterHouse(i) {
    const w = this.worldData();
    w.house = i;
    this.panX = 0;
    persistSave(this.save);
    Audio.sfx('click');
    this.showPlayroom();
  },
  // put the carried friend down in the house you're standing in
  placeCarry() {
    const w = this.worldData();
    if (!w.carry) return;
    const p = w.carry;
    const worldW = this.worldW || 1, vx = ((this.panX || 0) + (this.sceneW || worldW) * 0.5) / worldW;
    p.x = clamp01(vx); p.y = 0.8;
    this.curHouse().people.push(p);
    w.carry = null;
    persistSave(this.save);
    Audio.sfx('powerup');
    this.renderPlayroom();
  },
  playmatesData() {
    const house = this.curHouse();
    if (!Array.isArray(house.people)) house.people = [];
    const owned = new Set(this.save.unlocked);
    for (const p of house.people) {
      if (!owned.has(p.skin)) p.skin = 'steve';
      if (!p.cosmetics) p.cosmetics = { cape: 'none', hat: 'none' };
      for (const cat of ['cape', 'hat']) {
        const id = p.cosmetics[cat];
        if (id && id !== 'none' && !this.save.cosmeticsOwned.includes(id)) p.cosmetics[cat] = 'none';
      }
      p.x = clamp01(typeof p.x === 'number' ? p.x : 0.5);
      p.y = clamp01(typeof p.y === 'number' ? p.y : 0.7);
    }
    return house.people;
  },
  showPlayroom() {
    this.playmatesData();
    this.els.dressPanel.classList.add('hidden');
    this.openScreen('playroom');
    if (this.save.music !== false) Audio.music('cozy');
    this.panX = this.panX || 0;
    this.wirePan();
    this.renderPlayroom();
  },
  // drag the empty background to pan through the wide house (Toca-Boca style)
  wirePan() {
    if (this._panWired) return;
    this._panWired = true;
    const scene = this.els.playScene;
    let last = 0, active = false;
    const move = (e) => { if (!active) return; this.setPan(this.panX - (e.clientX - last)); last = e.clientX; };
    const up = () => { active = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    scene.addEventListener('pointerdown', (e) => {
      // playmates/decor stop propagation, so a pointerdown that reaches here is background
      active = true; last = e.clientX;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  },
  addFriend() {
    const owned = this.ownedSkins();
    const list = this.playmatesData();
    const skin = owned[list.length % owned.length].id; // cycle through owned skins
    // drop the new friend where you're currently looking, in world coords
    const w = this.worldW || 1, vx = ((this.panX || 0) + (this.sceneW || w) * (0.35 + Math.random() * 0.3)) / w;
    list.push({ skin, cosmetics: { cape: 'none', hat: 'none' }, x: clamp01(vx), y: 0.72 + Math.random() * 0.2 });
    persistSave(this.save);
    Audio.sfx('powerup');
    this.renderPlayroom();
  },
  decorData() {
    const house = this.curHouse();
    if (!Array.isArray(house.decor)) house.decor = [];
    house.decor = house.decor.filter(d => decorById(d.item));
    for (const d of house.decor) { d.x = clamp01(typeof d.x === 'number' ? d.x : 0.5); d.y = clamp01(typeof d.y === 'number' ? d.y : 0.8); }
    return house.decor;
  },
  roomData() {
    // room styles are owned globally; each house picks one (or its town's native)
    const first = ROOM_TIERS[0].id;
    if (!Array.isArray(this.save.roomTiersOwned)) this.save.roomTiersOwned = [first];
    this.save.roomTiersOwned = this.save.roomTiersOwned.filter(id => ROOM_TIERS.some(r => r.id === id));
    if (!this.save.roomTiersOwned.includes(first)) this.save.roomTiersOwned.unshift(first);
    return this.save;
  },
  // the materials the current house renders with
  curStyle() {
    const w = this.worldData();
    return styleById(this.curHouse().style, w.town);
  },
  // draw a single decoration sprite fitted (bottom-anchored) into a canvas
  drawSprite(cv, name) {
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    if (!name || !hasSprite(name)) return;
    const spr = getSprite(name);
    let h = cv.height * 0.92;
    if (spr.w * (h / spr.h) > cv.width * 0.95) h = cv.width * 0.95 * spr.h / spr.w;
    blit(g, spr, 0, cv.width / 2, cv.height - 2, h);
  },
  layoutWorld() {
    const rect = this.els.playScene.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return null; // not laid out yet
    this.worldW = Math.round(rect.width * this.WORLD_SCALE);
    this.sceneW = rect.width;
    this.els.roomWorld.style.width = `${this.worldW}px`;
    if (this.panX == null) this.panX = 0;
    this.setPan(this.panX);
    return rect;
  },
  setPan(px) {
    const max = Math.max(0, (this.worldW || 0) - (this.sceneW || 0));
    this.panX = Math.max(0, Math.min(max, px));
    this.els.roomWorld.style.transform = `translateX(${-this.panX}px)`;
  },
  // paint the whole wide house interior: patterned wall, floor with depth, trim,
  // and windows + a door spread across the wall so panning reveals them
  drawRoom() {
    const rect = this.layoutWorld();
    if (!rect) { requestAnimationFrame(() => { if (!this.els.mine.classList.contains('hidden')) return; this.drawRoom(); }); return; }
    const cv = this.els.roomBg;
    const LH = Math.max(60, Math.min(360, Math.round(128 * rect.height / rect.width)));
    const LW = Math.round(LH * this.worldW / rect.height);
    cv.width = LW; cv.height = LH;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const t = this.curStyle();
    const floorY = Math.round(LH * 0.56);

    g.fillStyle = t.wall; g.fillRect(0, 0, LW, floorY);
    g.fillStyle = t.wallAlt;
    if (t.pattern === 'bricks') {
      for (let y = 0, row = 0; y < floorY; y += 6, row++) {
        g.fillRect(0, y + 5, LW, 1);
        for (let x = (row % 2 ? 0 : 6); x < LW; x += 12) g.fillRect(x, y, 1, 5);
      }
    } else if (t.pattern === 'tiles') {
      for (let y = 0; y < floorY; y += 8) g.fillRect(0, y, LW, 1);
      for (let x = 0; x < LW; x += 8) g.fillRect(x, 0, 1, floorY);
    } else {
      for (let y = 0, row = 0; y < floorY; y += 7, row++) {
        g.fillRect(0, y, LW, 1);
        for (let x = (row % 2 ? 42 : 0); x < LW; x += 84) g.fillRect(x, y, 1, 7); // staggered joints
      }
    }

    g.fillStyle = t.floor; g.fillRect(0, floorY, LW, LH - floorY);
    g.fillStyle = t.floorAlt;
    for (let y = floorY + 3, step = 3; y < LH; step *= 1.34, y += step) g.fillRect(0, Math.round(y), LW, 1);
    if (t.pattern === 'tiles') for (let x = 0; x < LW; x += 12) g.fillRect(x, floorY, 1, LH - floorY);

    g.fillStyle = t.trim; g.fillRect(0, floorY - 3, LW, 4);

    // furniture built into the wall, spread across the wide room
    const winH = Math.round(floorY * 0.30), doorH = Math.round(floorY * 0.5);
    if (hasSprite('room_window')) {
      blit(g, getSprite('room_window'), 0, Math.round(LW * 0.12), Math.round(floorY * 0.40), winH);
      blit(g, getSprite('room_window'), 0, Math.round(LW * 0.55), Math.round(floorY * 0.40), winH);
    }
    if (hasSprite('room_door')) blit(g, getSprite('room_door'), 0, Math.round(LW * 0.80), floorY + 1, doorH);
  },
  renderPlayroom() {
    const E = this.els, list = this.playmatesData(), decor = this.decorData();
    this.roomData();
    const w = this.worldData(), t = townById(w.town);
    E.playEmeralds.textContent = `${this.save.emeralds}`;
    E.playHouseTitle.textContent = `HOUSE ${w.house + 1}`;
    E.btnPlaceCarry.classList.toggle('hidden', !w.carry);
    E.playHint.textContent = w.carry
      ? 'Tap PLACE FRIEND to bring your visitor into this house'
      : 'Drag friends & decor · tap a friend to dress · drop one on the bag to take them along';
    this.drawRoom();
    const layer = E.roomItems;
    layer.innerHTML = '';
    if (!list.length && !decor.length) {
      const empty = document.createElement('div');
      empty.className = 'playEmpty';
      empty.textContent = 'Your house is empty — add a friend or some decor!';
      layer.appendChild(empty);
      return;
    }
    // decor first so furniture sits behind the friends
    decor.forEach((d, i) => {
      const el = document.createElement('div');
      el.className = 'playmate decor';
      el.style.left = `${d.x * 100}%`; el.style.top = `${d.y * 100}%`;
      const cv = document.createElement('canvas'); cv.width = 56; cv.height = 56;
      this.drawSprite(cv, decorById(d.item) && decorById(d.item).sprite);
      el.appendChild(cv);
      this.wireDrag(el, d, { onRemove: () => this.removeDecor(i) });
      layer.appendChild(el);
    });
    list.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'playmate';
      el.style.left = `${p.x * 100}%`; el.style.top = `${p.y * 100}%`;
      const cv = document.createElement('canvas'); cv.width = 52; cv.height = 74;
      cv.style.animationDelay = `${(i % 5) * 0.4}s`;
      const skin = this.skinById(p.skin);
      this.drawDressedCharacter(cv, skin, p.cosmetics);
      el.appendChild(cv);
      this.wireDrag(el, p, {
        onTap: () => this.openDress(i), onRemove: () => this.removePlaymate(i),
        redraw: (pose) => this.drawDressedCharacter(cv, skin, p.cosmetics, pose),
        onCarry: this.worldData().carry ? null : () => this.pickUpPlaymate(i), // one passenger at a time
      });
      layer.appendChild(el);
    });
  },
  // Drag any room item in WORLD coordinates (accounting for the pan). Playmates
  // (redraw given) ragdoll — arms and legs swing opposite the motion and wobble
  // to rest via damped springs. Decor tilts as a whole. Drop on the bin to remove.
  wireDrag(el, obj, { onTap, onRemove, redraw, onCarry } = {}) {
    const bin = this.els.trashZone, sack = this.els.carryZone;
    let moved = false, startX = 0, startY = 0, lastX = 0, overBin = false, overSack = false, dragging = false, raf = 0, tilt = 0, vx = 0;
    const inside = (e, node) => {
      const b = node.getBoundingClientRect();
      return e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
    };
    const L = { aL: { a: 0, v: 0 }, aR: { a: 0, v: 0 }, lL: { a: 0, v: 0 }, lR: { a: 0, v: 0 } };
    const putTilt = (a, s) => { el.style.transform = `translate(-50%, -100%) rotate(${a.toFixed(2)}deg) scale(${s})`; };
    // loose springs: low stiffness and high retention, so limbs trail well behind a
    // fast drag and overshoot a few times before they settle instead of snapping back
    const spring = (limb, target, stiff) => { limb.v += (target - limb.a) * stiff; limb.v *= 0.93; limb.a += limb.v; };

    const tick = () => {
      vx *= 0.88;
      const d = Math.max(-1.7, Math.min(1.7, -vx * 0.045));
      spring(L.aL, d * 1.45, 0.16); spring(L.aR, d * 1.15, 0.16); // arms swing most
      spring(L.lL, d * 0.8, 0.12); spring(L.lR, d * 1.0, 0.12);   // legs less, slight asymmetry
      redraw({ aL: L.aL.a, aR: L.aR.a, lL: L.lL.a, lR: L.lR.a });
      const still = ['aL', 'aR', 'lL', 'lR'].every(k => Math.abs(L[k].a) < 0.004 && Math.abs(L[k].v) < 0.004);
      if (!dragging && Math.abs(vx) < 0.3 && still) { raf = 0; redraw(null); return; }
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
      const rect = this.els.playScene.getBoundingClientRect();
      const nx = clamp01((e.clientX - rect.left + (this.panX || 0)) / (this.worldW || rect.width));
      const ny = clamp01((e.clientY - rect.top) / rect.height);
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 6) moved = true;
      el.style.left = `${nx * 100}%`; el.style.top = `${ny * 100}%`;
      obj.x = nx; obj.y = ny;
      const dx = e.clientX - lastX; lastX = e.clientX;
      if (redraw) { vx += (dx - vx) * 0.6; el.style.transform = 'translate(-50%, -100%) scale(1.07)'; }
      else { tilt += (Math.max(-20, Math.min(20, -dx * 1.6)) - tilt) * 0.35; putTilt(tilt, 1.08); }
      if (onRemove) {
        const hot = inside(e, bin);
        if (hot !== overBin) { overBin = hot; bin.classList.toggle('hot', hot); }
      }
      if (onCarry) {
        const hot = inside(e, sack);
        if (hot !== overSack) { overSack = hot; sack.classList.toggle('hot', hot); }
      }
    };

    const onUp = () => {
      dragging = false; el.classList.remove('dragging');
      bin.classList.remove('show', 'hot'); sack.classList.remove('show', 'hot');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (overSack && onCarry) { Audio.sfx('powerup'); onCarry(); return; }
      if (overBin && onRemove) { Audio.sfx('pop'); onRemove(); return; }
      persistSave(this.save);
      if (!moved) { el.style.transform = 'translate(-50%, -100%)'; if (redraw) redraw(null); if (onTap) onTap(); return; }
      if (redraw) { el.style.transform = 'translate(-50%, -100%)'; if (!raf) raf = requestAnimationFrame(tick); return; }
      let a = tilt, v = 0; // decor: spring the whole-sprite tilt back
      const settle = () => {
        v += -a * 0.26; v *= 0.80; a += v;
        putTilt(a, 1);
        if (Math.abs(a) > 0.2 || Math.abs(v) > 0.2) requestAnimationFrame(settle);
        else el.style.transform = 'translate(-50%, -100%)';
      };
      requestAnimationFrame(settle);
    };

    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); // an item drag must not start a pan
      moved = false; dragging = true; startX = lastX = e.clientX; startY = e.clientY; overBin = overSack = false; vx = 0; tilt = 0;
      el.classList.add('dragging');
      if (onRemove) bin.classList.add('show');
      if (onCarry) sack.classList.add('show');
      if (redraw && !raf) raf = requestAnimationFrame(tick);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  },
  // furniture you own but haven't placed; putting something in the bin comes back here
  decorOwnedData() {
    if (!this.save.decorOwned || typeof this.save.decorOwned !== 'object') this.save.decorOwned = {};
    return this.save.decorOwned;
  },
  showDecorCatalog() {
    const panel = this.els.dressPanel; panel.innerHTML = ''; Audio.sfx('click');
    const stock = this.decorOwnedData();
    const lab = document.createElement('div'); lab.className = 'dressLabel';
    lab.textContent = 'DECOR · tap to place · bin sends it back here';
    panel.appendChild(lab);
    const row = document.createElement('div'); row.className = 'dressRow';
    for (const d of DECOR) {
      const have = stock[d.id] || 0;
      const cell = document.createElement('button');
      // owning one means placing is free; otherwise you buy one
      cell.className = 'dressItem' + (have > 0 ? ' sel' : (this.save.emeralds < d.cost ? ' cant' : ''));
      const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40; this.drawSprite(cv, d.sprite); cell.appendChild(cv);
      const cost = document.createElement('div'); cost.className = 'dItemCost';
      cost.innerHTML = have > 0 ? `x${have}` : `<span class="em"></span>${d.cost}`;
      cell.appendChild(cost);
      cell.addEventListener('click', () => this.placeDecor(d.id));
      row.appendChild(cell);
    }
    panel.appendChild(row);
    this._dressClose(panel);
  },
  // place one from your inventory; only buy when you have none left
  placeDecor(id) {
    const def = decorById(id); if (!def) return;
    const stock = this.decorOwnedData();
    if (stock[id] > 0) { stock[id]--; Audio.sfx('click'); }
    else {
      if (this.save.emeralds < def.cost) { Audio.sfx('gate_bad'); return; }
      this.save.emeralds -= def.cost; Audio.sfx('buy');
    }
    // drop it where you're looking, in world coords
    const w = this.worldW || 1, vx = ((this.panX || 0) + (this.sceneW || w) * (0.35 + Math.random() * 0.3)) / w;
    this.decorData().push({ item: id, x: clamp01(vx), y: 0.78 + Math.random() * 0.18 });
    persistSave(this.save);
    this.renderPlayroom(); this.showDecorCatalog();
  },
  // the bin puts furniture BACK in your inventory — nothing you paid for is ever lost
  removeDecor(i) {
    const gone = this.curHouse().decor.splice(i, 1)[0];
    if (gone) {
      const stock = this.decorOwnedData();
      stock[gone.item] = (stock[gone.item] || 0) + 1;
    }
    persistSave(this.save); Audio.sfx('pop');
    this.renderPlayroom();
  },
  showRoomPicker() {
    const panel = this.els.dressPanel; panel.innerHTML = ''; Audio.sfx('click'); this.roomData();
    const native = townById(this.worldData().town).style;
    const cur = this.curHouse().style;
    const lab = document.createElement('div'); lab.className = 'dressLabel'; lab.textContent = 'ROOM STYLE'; panel.appendChild(lab);
    const row = document.createElement('div'); row.className = 'dressRow';
    // the town's own look is free here, then the styles you can buy anywhere
    const options = [{ ...native, cost: 0, free: true }, ...ROOM_TIERS];
    for (const t of options) {
      const owned = t.free || this.save.roomTiersOwned.includes(t.id);
      const cell = document.createElement('button');
      cell.className = 'dressItem' + (cur === t.id ? ' sel' : '') + (!owned && this.save.emeralds < t.cost ? ' cant' : '');
      const sw = document.createElement('div'); sw.className = 'roomSwatch';
      sw.style.background = `linear-gradient(${t.wall} 0%, ${t.wall} 54%, ${t.trim} 54%, ${t.floor} 62%, ${t.floorAlt} 100%)`;
      cell.appendChild(sw);
      const cap = document.createElement('div'); cap.className = 'dItemCost';
      cap.innerHTML = owned ? (cur === t.id ? 'ON' : (t.free ? 'TOWN' : 'OWNED')) : `<span class="em"></span>${t.cost}`;
      cell.appendChild(cap);
      cell.addEventListener('click', () => this.setRoomTier(t.id, t.free));
      row.appendChild(cell);
    }
    panel.appendChild(row);
    this._dressClose(panel);
  },
  setRoomTier(id, free = false) {
    this.roomData();
    if (!free && !this.save.roomTiersOwned.includes(id)) {
      const t = roomTierById(id);
      if (this.save.emeralds < t.cost) { Audio.sfx('gate_bad'); return; }
      this.save.emeralds -= t.cost; this.save.roomTiersOwned.push(id); Audio.sfx('buy');
    } else Audio.sfx('click');
    this.curHouse().style = id; // styles are owned globally, applied per house
    persistSave(this.save);
    this.renderPlayroom(); this.showRoomPicker();
  },
  _dressClose(panel) {
    const close = document.createElement('button'); close.className = 'mcbtn small dressClose'; close.textContent = 'DONE';
    close.addEventListener('click', () => { Audio.sfx('click'); panel.classList.add('hidden'); });
    panel.appendChild(close);
    panel.classList.remove('hidden');
  },
  // take a friend out of this house and carry them; place them in any other house
  pickUpPlaymate(i) {
    const w = this.worldData();
    if (w.carry) return; // one passenger at a time
    w.carry = this.curHouse().people.splice(i, 1)[0];
    persistSave(this.save);
    this.renderPlayroom();
  },
  removePlaymate(i) {
    this.curHouse().people.splice(i, 1);
    persistSave(this.save);
    Audio.sfx('pop');
    this.els.dressPanel.classList.add('hidden');
    this.renderPlayroom();
  },
  openDress(i) {
    const p = this.playmatesData()[i];
    if (!p) return;
    const panel = this.els.dressPanel;
    panel.innerHTML = '';
    Audio.sfx('click');

    const rowFor = (label, items, isSel, drawInto) => {
      const lab = document.createElement('div'); lab.className = 'dressLabel'; lab.textContent = label; panel.appendChild(lab);
      const row = document.createElement('div'); row.className = 'dressRow';
      for (const it of items) {
        const cell = document.createElement('button');
        cell.className = 'dressItem' + (isSel(it) ? ' sel' : '');
        drawInto(cell, it);
        cell.addEventListener('click', () => it.onPick());
        row.appendChild(cell);
      }
      panel.appendChild(row);
    };

    // skins
    rowFor('SKIN', this.ownedSkins().map(s => ({ s, onPick: () => this.setPlaymate(i, 'skin', s.id) })),
      (o) => p.skin === o.s.id,
      (cell, o) => { const cv = document.createElement('canvas'); cv.width = 40; cv.height = 54; this.drawSkinPreview(cv, o.s); cell.appendChild(cv); });

    // hats + capes (owned; 'none' always available)
    for (const cat of ['hat', 'cape']) {
      rowFor(cat.toUpperCase(), this.ownedCos(cat).map(c => ({ c, onPick: () => this.setPlaymate(i, cat, c.id) })),
        (o) => (p.cosmetics[cat] || 'none') === o.c.id,
        (cell, o) => {
          if (o.c.id === 'none') { const n = document.createElement('span'); n.className = 'none'; n.textContent = 'NONE'; cell.appendChild(n); return; }
          if (cat === 'hat' && o.c.sprite && hasSprite(o.c.sprite)) {
            const cv = document.createElement('canvas'); cv.width = 40; cv.height = 42;
            const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
            const hat = getSprite(o.c.sprite); blit(g, hat, 0, 20, 40, (hat.h / hat.w) * 32);
            cell.appendChild(cv); return;
          }
          const sw = document.createElement('div'); sw.className = 'swatch';
          const col = o.c.colors ? (Array.isArray(o.c.colors) ? o.c.colors[0] : o.c.colors.c) : '#7a5a3a';
          sw.style.background = col; cell.appendChild(sw);
        });
    }

    const close = document.createElement('button');
    close.className = 'mcbtn small dressClose'; close.textContent = 'DONE';
    close.addEventListener('click', () => { Audio.sfx('click'); panel.classList.add('hidden'); });
    panel.appendChild(close);
    panel.classList.remove('hidden');
  },
  setPlaymate(i, field, value) {
    const p = this.curHouse().people[i];
    if (!p) return;
    if (field === 'skin') p.skin = value;
    else p.cosmetics[field] = value;
    persistSave(this.save);
    Audio.sfx('buy');
    this.renderPlayroom();
    this.openDress(i); // refresh selection highlights
  },
};
