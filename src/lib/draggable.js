// Drag any room item (friend or decor) in WORLD coordinates (accounting for the
// pan). Playmates (a `redraw` callback is supplied) ragdoll — arms and legs
// swing opposite the motion and wobble to rest via damped springs. Decor tilts
// as a whole. Drop on the bin to remove it, or on the sack to carry it along.
//
// Ported ESSENTIALLY UNCHANGED from the pre-Svelte wireDrag (see v0.2): the damped-
// spring ragdoll (constants, tick loop) is tuned and must not be re-derived.
// `params` = { obj, scene, panX, worldW, onTap, onRemove, onCarry, redraw, bin,
// sack, commit }.
import { Audio } from '../../js/audio.js';
import { clamp01 } from '../../js/config.js';

export function draggable(node, params) {
  const el = node;
  let p = params;

  let moved = false, startX = 0, startY = 0, lastX = 0;
  let overBin = false, overSack = false, dragging = false;
  let raf = 0, settleRaf = 0, tilt = 0, vx = 0;

  const L = { aL: { a: 0, v: 0 }, aR: { a: 0, v: 0 }, lL: { a: 0, v: 0 }, lR: { a: 0, v: 0 } };

  const inside = (e, target) => {
    const b = target.getBoundingClientRect();
    return e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
  };
  const putTilt = (a, s) => { el.style.transform = `translate(-50%, -100%) rotate(${a.toFixed(2)}deg) scale(${s})`; };
  // loose springs: low stiffness and high retention, so limbs trail well behind a
  // fast drag and overshoot a few times before they settle instead of snapping back
  const spring = (limb, target, stiff) => { limb.v += (target - limb.a) * stiff; limb.v *= 0.93; limb.a += limb.v; };

  const tick = () => {
    vx *= 0.88;
    const d = Math.max(-1.7, Math.min(1.7, -vx * 0.045));
    spring(L.aL, d * 1.45, 0.16); spring(L.aR, d * 1.15, 0.16); // arms swing most
    spring(L.lL, d * 0.8, 0.12); spring(L.lR, d * 1.0, 0.12);   // legs less, slight asymmetry
    p.redraw({ aL: L.aL.a, aR: L.aR.a, lL: L.lL.a, lR: L.lR.a });
    const still = ['aL', 'aR', 'lL', 'lR'].every((k) => Math.abs(L[k].a) < 0.004 && Math.abs(L[k].v) < 0.004);
    if (!dragging && Math.abs(vx) < 0.3 && still) { raf = 0; p.redraw(null); return; }
    raf = requestAnimationFrame(tick);
  };

  const onMove = (e) => {
    const rect = p.scene.getBoundingClientRect();
    const worldW = p.worldW || rect.width;
    const nx = clamp01((e.clientX - rect.left + (p.panX || 0)) / worldW);
    const ny = clamp01((e.clientY - rect.top) / rect.height);
    if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 6) moved = true;
    el.style.left = `${nx * 100}%`; el.style.top = `${ny * 100}%`;
    p.obj.x = nx; p.obj.y = ny;
    const dx = e.clientX - lastX; lastX = e.clientX;
    if (p.redraw) { vx += (dx - vx) * 0.6; el.style.transform = 'translate(-50%, -100%) scale(1.07)'; }
    else { tilt += (Math.max(-20, Math.min(20, -dx * 1.6)) - tilt) * 0.35; putTilt(tilt, 1.08); }
    if (p.onRemove) {
      const hot = inside(e, p.bin);
      if (hot !== overBin) { overBin = hot; p.bin.classList.toggle('hot', hot); }
    }
    if (p.onCarry) {
      const hot = inside(e, p.sack);
      if (hot !== overSack) { overSack = hot; p.sack.classList.toggle('hot', hot); }
    }
  };

  const onUp = () => {
    dragging = false; el.classList.remove('dragging');
    p.bin.classList.remove('show', 'hot'); p.sack.classList.remove('show', 'hot');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (overSack && p.onCarry) { Audio.sfx('powerup'); p.onCarry(); return; }
    if (overBin && p.onRemove) { Audio.sfx('pop'); p.onRemove(); return; }
    p.commit();
    if (!moved) { el.style.transform = 'translate(-50%, -100%)'; if (p.redraw) p.redraw(null); if (p.onTap) p.onTap(); return; }
    if (p.redraw) { el.style.transform = 'translate(-50%, -100%)'; if (!raf) raf = requestAnimationFrame(tick); return; }
    let a = tilt, v = 0; // decor: spring the whole-sprite tilt back
    const settle = () => {
      v += -a * 0.26; v *= 0.80; a += v;
      putTilt(a, 1);
      if (Math.abs(a) > 0.2 || Math.abs(v) > 0.2) settleRaf = requestAnimationFrame(settle);
      else { settleRaf = 0; el.style.transform = 'translate(-50%, -100%)'; }
    };
    settleRaf = requestAnimationFrame(settle);
  };

  const onDown = (e) => {
    e.preventDefault(); e.stopPropagation(); // an item drag must not start a pan
    moved = false; dragging = true; startX = lastX = e.clientX; startY = e.clientY;
    overBin = overSack = false; vx = 0; tilt = 0;
    el.classList.add('dragging');
    if (p.onRemove) p.bin.classList.add('show');
    if (p.onCarry) p.sack.classList.add('show');
    if (p.redraw && !raf) raf = requestAnimationFrame(tick);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  el.addEventListener('pointerdown', onDown);

  return {
    update(next) { p = next; },
    destroy() {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (raf) cancelAnimationFrame(raf);
      if (settleRaf) cancelAnimationFrame(settleRaf);
    },
  };
}
