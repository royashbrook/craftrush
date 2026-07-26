// Pure canvas drawing for the playroom: dressed characters (built from separate
// limb sprites so they can ragdoll), decor sprites, and the wide room backdrop.
//
// Lifted verbatim (in behaviour) from the `this`-bound PlayroomMixin in
// the pre-Svelte playroom — no maths or layer order changed, only `this.` removed and
// the values it used to reach through the UI instance passed in as arguments.
import { blit, getSprite, hasSprite } from '../../js/assets.js';
import { COSMETICS } from '../../js/config.js';

// draw a limb sprite hanging from a joint (jx,jy), rotated by `angle` radians
export function drawLimb(g, name, palette, key, jx, jy, hPx, angle) {
  const spr = getSprite(name, palette, key);
  const src = spr.frames[0];
  const wPx = spr.w * (hPx / spr.h);
  g.save(); g.translate(jx, jy); g.rotate(angle);
  g.drawImage(src, -wPx / 2, 0, wPx, hPx); // top edge at the joint, hangs down
  g.restore();
}

// Compose a front-facing character from separate limbs so it can ragdoll.
// pose = { aL, aR, lL, lR } are arm/leg swing angles in radians (default rest).
export function drawDressedCharacter(cv, skinObj, cos = {}, pose = null) {
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cv.width, cv.height);
  const S = cv.height / 80, cx = cv.width / 2, pal = skinObj.palette, key = skinObj.id;
  const P = pose || { aL: 0, aR: 0, lL: 0, lR: 0 };
  const shoulderY = 30 * S, hipY = 50 * S, headCY = 16 * S;
  const shoulderDX = 9 * S, hipDX = 4.5 * S;
  const armLen = 22 * S, legLen = 26 * S, headH = 24 * S, torsoH = 24 * S;

  // cape: a wide cloak behind the torso (peeks out both sides so it actually reads)
  if (cos.cape && cos.cape !== 'none') {
    const def = COSMETICS.cape.find((c) => c.id === cos.cape);
    if (def) {
      const cape = getSprite('cape', def.rainbow ? { c: '#ff5545', C: '#3fa9ff' } : def.colors, `pm_cape_${cos.cape}`);
      const w = 30 * S, h = 34 * S;
      g.save(); g.translate(cx, shoulderY - 4 * S); g.rotate((P.lL + P.lR) * 0.15);
      g.drawImage(cape.frames[0], -w / 2, 0, w, h); g.restore();
    }
  }
  // legs (behind the torso)
  drawLimb(g, 'pm_leg', pal, `${key}_leg`, cx - hipDX, hipY, legLen, P.lL);
  drawLimb(g, 'pm_leg', pal, `${key}_leg`, cx + hipDX, hipY, legLen, P.lR);
  // torso
  const torso = getSprite('pm_torso', pal, `${key}_torso`);
  const tw = torso.w * (torsoH / torso.h);
  g.drawImage(torso.frames[0], cx - tw / 2, hipY - torsoH, tw, torsoH);
  // arms (in front of the torso)
  drawLimb(g, 'pm_arm', pal, `${key}_arm`, cx - shoulderDX, shoulderY, armLen, P.aL);
  drawLimb(g, 'pm_arm', pal, `${key}_arm`, cx + shoulderDX, shoulderY, armLen, P.aR);
  // head
  const head = getSprite(skinObj.head);
  const hw = head.w * (headH / head.h);
  const headTop = headCY - headH / 2;
  g.drawImage(head.frames[0], cx - hw / 2, headTop, hw, headH);
  // hat on the head
  if (cos.hat && cos.hat !== 'none') {
    const def = COSMETICS.hat.find((h) => h.id === cos.hat);
    if (def && hasSprite(def.sprite)) {
      const hat = getSprite(def.sprite);
      const hatW = hw * 1.05, hatH = hat.h * (hatW / hat.w);
      g.drawImage(hat.frames[0], cx - hatW / 2, headTop - hatH + 3 * S, hatW, hatH);
    }
  }
}

// draw a single decoration sprite fitted (bottom-anchored) into a canvas
export function drawSprite(cv, name) {
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cv.width, cv.height);
  if (!name || !hasSprite(name)) return;
  const spr = getSprite(name);
  let h = cv.height * 0.92;
  if (spr.w * (h / spr.h) > cv.width * 0.95) h = cv.width * 0.95 * spr.h / spr.w;
  blit(g, spr, 0, cv.width / 2, cv.height - 2, h);
}

// Paint the whole wide house interior: patterned wall, floor with depth, trim,
// and windows + a door spread across the wall so panning reveals them.
//
// `worldW` is the full pixel width of the house (wider than the viewport, per
// the WORLD_SCALE the screen lays out with); `rect` is the viewport's bounding
// rect (only .width/.height are read). Sets canvas.width/height itself.
export function drawRoom(canvas, style, worldW, rect) {
  const cv = canvas;
  const LH = Math.max(60, Math.min(360, Math.round(128 * rect.height / rect.width)));
  const LW = Math.round(LH * worldW / rect.height);
  cv.width = LW; cv.height = LH;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const t = style;
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
}
