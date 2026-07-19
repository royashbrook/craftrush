#!/usr/bin/env node
// Validates sprite pack modules against docs/SPRITE_SPEC.md rules.
// Usage: node tools/validate_sprites.mjs js/sprites/hostiles.js [more...]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const HEX = /^#[0-9a-fA-F]{6}$/;
let failed = false;

for (const rel of process.argv.slice(2)) {
  const url = pathToFileURL(resolve(rel)).href + `?t=${process.hrtime.bigint()}`;
  let mod;
  try {
    mod = await import(url);
  } catch (e) {
    console.error(`FAIL ${rel}: module does not load — ${e.message}`);
    failed = true;
    continue;
  }
  const exports = Object.entries(mod).filter(([, v]) => v && typeof v === 'object');
  if (exports.length !== 1) {
    console.error(`FAIL ${rel}: expected exactly 1 exported object, got ${exports.length}`);
    failed = true;
    continue;
  }
  const [packName, pack] = exports[0];
  const errs = [];
  let count = 0;
  for (const [id, s] of Object.entries(pack)) {
    count++;
    const at = `${packName}.${id}`;
    if (!Number.isInteger(s.w) || !Number.isInteger(s.h) || s.w < 1 || s.h < 1 || s.w > 64 || s.h > 64) {
      errs.push(`${at}: bad w/h (${s.w}x${s.h}), max 64`);
      continue;
    }
    if (s.anchor !== 'bottom' && s.anchor !== 'center') errs.push(`${at}: anchor must be 'bottom'|'center'`);
    if (!s.palette || typeof s.palette !== 'object') { errs.push(`${at}: missing palette`); continue; }
    for (const [k, v] of Object.entries(s.palette)) {
      if (k.length !== 1 || k === '.') errs.push(`${at}: palette key '${k}' must be single non-dot char`);
      if (!HEX.test(v)) errs.push(`${at}: palette['${k}']='${v}' not #rrggbb`);
    }
    if (!Array.isArray(s.frames) || s.frames.length < 1) { errs.push(`${at}: frames must be non-empty array`); continue; }
    s.frames.forEach((f, fi) => {
      if (!Array.isArray(f) || f.length !== s.h) { errs.push(`${at}: frame ${fi} has ${f?.length} rows, want ${s.h}`); return; }
      f.forEach((row, ri) => {
        if (typeof row !== 'string' || row.length !== s.w) { errs.push(`${at}: frame ${fi} row ${ri} len ${row?.length}, want ${s.w}`); return; }
        for (const ch of row) {
          if (ch !== '.' && !(ch in s.palette)) errs.push(`${at}: frame ${fi} row ${ri} char '${ch}' not in palette`);
        }
      });
    });
    // opaque-pixel sanity: an all-transparent sprite is a bug
    const solid = s.frames[0].join('').replace(/\./g, '').length;
    if (solid < 8) errs.push(`${at}: only ${solid} solid pixels — nearly empty`);
  }
  if (errs.length) {
    for (const e of errs.slice(0, 40)) console.error(`FAIL ${rel}: ${e}`);
    if (errs.length > 40) console.error(`...and ${errs.length - 40} more`);
    failed = true;
  } else {
    console.log(`OK ${rel} (${packName}: ${count} sprites)`);
  }
}
process.exit(failed ? 1 : 0);
