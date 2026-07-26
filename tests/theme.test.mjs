import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { THEME, THEME_INFO, THEME_ART, THEME_ATLAS } from '../js/theme.js';
import { BIOMES, SKINS, COSMETICS, CAMPAIGN, ENEMY_TYPES, BOSS_TYPES, TILES,
  loadSave, chapterUnlocked } from '../js/config.js';

const artDir = new URL('./', THEME_ART + '/');
const ART = JSON.parse(readFileSync(new URL('sprites.json', artDir), 'utf8'));

test('a theme says who it is', () => {
  assert.ok(THEME_INFO.id && THEME_INFO.name, 'it has a name to show');
  assert.ok(THEME_ATLAS.startsWith('file:') || THEME_ATLAS.startsWith('http'), 'and a place its atlas lives');
});

test('the engine reads its content from the theme, not from itself', () => {
  assert.equal(BIOMES, THEME.biomes, 'biomes come from the theme');
  assert.equal(SKINS, THEME.skins);
  assert.equal(COSMETICS, THEME.cosmetics);
  assert.equal(CAMPAIGN, THEME.campaign.chapters);
  assert.equal(ENEMY_TYPES, THEME.enemies.mobs);
});

// The contract between engine and theme is sprite NAMES. If a theme references
// art it does not ship, the game draws magenta and nobody notices until a kid does.
test('every name the theme references has a drawing behind it', () => {
  const missing = [];
  const need = (name, where) => { if (name && !ART[name]) missing.push(`${where} -> ${name}`); };

  for (const b of BIOMES) {
    for (const s of b.scenery) need(s, `biome ${b.id} scenery`);
    need(b.obstacle, `biome ${b.id} obstacle`);
    for (const e of b.enemies) {
      assert.ok(ENEMY_TYPES[e], `biome ${b.id} rosters ${e}, which the theme defines`);
      need(ENEMY_TYPES[e].sprite || e, `enemy ${e}`);
    }
    if (b.boss) assert.ok(BOSS_TYPES[b.boss], `biome ${b.id} boss ${b.boss} is defined`);
  }
  for (const s of SKINS) { need(s.head, `skin ${s.id} head`); need(s.body, `skin ${s.id} body`); }
  for (const list of Object.values(COSMETICS)) for (const c of list) need(c.sprite, `cosmetic ${c.id}`);
  for (const c of CAMPAIGN) need(c.icon, `chapter ${c.id} icon`);

  assert.deepEqual(missing, [], 'nothing points at art that is not there');
});

test('every chapter runs somewhere the theme defines', () => {
  const places = new Set(BIOMES.map((b) => b.id));
  for (const c of CAMPAIGN) assert.ok(places.has(c.biome), `${c.id} runs in ${c.biome}`);
});

test('the mine tiles the theme ships are shaped the way the digger expects', () => {
  for (const [id, t] of Object.entries(TILES)) {
    assert.equal(typeof t.color, 'string', `${id} has a colour`);
    if (t.solid === false || t.hazard) continue;   // air and lava are never dug
    assert.ok(t.hp > 0, `${id} takes at least one hit to break`);
    assert.ok(Number.isFinite(t.tier), `${id} says which pickaxe it needs`);
  }
});

// A save made under one theme should survive meeting another. Swapping a folder
// must not be able to wipe a kid's progress.
test('a save naming content this theme does not have degrades instead of breaking', () => {
  const save = loadSave();
  save.skin = 'skin_from_another_theme';
  save.cosmetics = { cape: 'cape_that_does_not_exist', hat: 'none', trail: 'none', pet: 'none' };
  save.campaign = { done: ['a_chapter_from_another_theme'] };

  const skin = SKINS.find((s) => s.id === save.skin) || SKINS[0];
  assert.equal(skin.id, SKINS[0].id, 'an unknown skin falls back to the starter');

  const cape = COSMETICS.cape.find((c) => c.id === save.cosmetics.cape);
  assert.equal(cape, undefined, 'an unknown cape is simply absent, not an error');

  // an unknown finished chapter must not make the chain think it is further along
  assert.doesNotThrow(() => chapterUnlocked(save, CAMPAIGN[0].id));
  assert.equal(chapterUnlocked(save, CAMPAIGN[0].id), true, 'the chain still starts at the start');
});

test('every theme in the repo loads and carries what the engine needs', () => {
  const themes = readdirSync(new URL('../themes/', import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
  assert.ok(themes.length >= 1);
  for (const id of themes) {
    const t = JSON.parse(readFileSync(new URL(`../themes/${id}/theme.json`, import.meta.url), 'utf8'));
    assert.ok(t.name, `${id} has a name`);
    for (const part of ['biomes', 'skins', 'cosmetics', 'enemies', 'campaign', 'mine']) {
      assert.ok(t.data.includes(part), `${id} ships ${part}`);
      assert.doesNotThrow(
        () => JSON.parse(readFileSync(new URL(`../themes/${id}/${part}.json`, import.meta.url), 'utf8')),
        `${id}/${part}.json parses`);
    }
  }
});
