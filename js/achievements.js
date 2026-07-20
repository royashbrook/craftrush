// Java-edition-style achievements. Each has a check(save) predicate evaluated
// against accumulated save fields/stats. Icons reuse existing item/mob sprites.
export const ACHIEVEMENTS = [
  { id: 'start',        name: 'Off We Go!',      desc: 'Finish your first run',        icon: 'head_steve',    check: (s) => s.stats.runs >= 1 },
  { id: 'monster',      name: 'Monster Hunter',  desc: 'Defeat any boss',              icon: 'boss_slime',    check: (s) => Object.keys(s.stats.bossWins).length >= 1 },
  { id: 'squad',        name: 'Squad Goals',     desc: 'Grow a crowd of 50',           icon: 'head_alex',     check: (s) => s.bestCrowd >= 50 },
  { id: 'crowded',      name: 'Overcrowded',     desc: 'Reach an army of 170',         icon: 'head_zombie',   check: (s) => s.bestCrowd >= 170 },
  { id: 'giga',         name: 'GIGA STEVE!',     desc: 'Merge your first Giga Steve',   icon: 'iron_golem',    check: (s) => s.stats.gigas >= 1, special: true },
  { id: 'titan',        name: 'TITAN STEVE!',    desc: 'Reach an army of 500',         icon: 'boss_ravager',  check: (s) => s.bestCrowd >= 500, special: true },
  { id: 'golem',        name: 'Iron Friend',     desc: 'Summon an Iron Golem',         icon: 'iron_golem',    check: (s) => s.stats.golems >= 1 },
  { id: 'sniper',       name: 'Sharpshooter',    desc: 'Blast 100 mobs',               icon: 'arrow',         check: (s) => s.stats.kills >= 100 },
  { id: 'massacre',     name: 'Mob Destroyer',   desc: 'Blast 1000 mobs',              icon: 'tnt_block',     check: (s) => s.stats.kills >= 1000, special: true },
  { id: 'shop',         name: 'Time to Shop',    desc: 'Earn 100 emeralds total',      icon: 'emerald',       check: (s) => s.stats.totalEmeralds >= 100 },
  { id: 'baron',        name: 'Emerald Baron',   desc: 'Earn 2000 emeralds total',     icon: 'chest',         check: (s) => s.stats.totalEmeralds >= 2000, special: true },
  { id: 'nether',       name: 'Into the Nether', desc: 'Reach the Nether biome',       icon: 'head_piglin',   check: (s) => s.bestLevel >= 6 },
  { id: 'theend',       name: 'The End?',        desc: 'Reach The End biome',          icon: 'head_enderman', check: (s) => s.bestLevel >= 7 },
  { id: 'dragon',       name: 'Dragon Slayer',   desc: 'Defeat the Ender Dragon',      icon: 'boss_dragon',   check: (s) => !!s.stats.bossWins.end, special: true },
  { id: 'fashion',      name: 'Fashion Icon',    desc: 'Own 3 hero skins',             icon: 'head_creeper',  check: (s) => s.unlocked.length >= 3 },
  { id: 'hero',         name: 'Superhero',       desc: 'Equip a cape',                 icon: 'cape',          check: (s) => s.cosmetics.cape !== 'none' },
  { id: 'pet',          name: 'Best Friend',     desc: 'Adopt a pet',                  icon: 'wolf',          check: (s) => s.cosmetics.pet !== 'none' },
  { id: 'collector',    name: 'Collector',       desc: 'Own 8 cosmetics',              icon: 'golden_apple',  check: (s) => s.cosmeticsOwned.filter((x) => x !== 'none').length >= 8 },
  { id: 'deepdark',     name: 'Into the Deep',   desc: 'Reach The Deep Dark',          icon: 'head_enderman', check: (s) => s.bestLevel >= 8 },
  { id: 'warden',       name: 'Silence',         desc: 'Defeat the Warden',            icon: 'boss_warden',   check: (s) => !!s.stats.bossWins.deepdark, special: true },
  { id: 'worldtour',    name: 'World Tour',      desc: 'Reach level 9',                icon: 'heart',         check: (s) => s.bestLevel >= 9, special: true },
  { id: 'fortress',     name: 'Fortress Raider', desc: 'Collect 15 blaze rods',        icon: 'blaze_rod',     check: (s) => (s.inventory && s.inventory.blazeRods || 0) >= 15, special: true },
  { id: 'explorer',     name: 'Explorer',        desc: 'Finish a daily expedition',    icon: 'chest',         check: (s) => (s.stats.expeditions || 0) >= 1 },
  { id: 'streak7',      name: 'Daily Grinder',   desc: 'Reach a 7-day expedition streak', icon: 'golden_apple', check: (s) => (s.expedition && s.expedition.streak || 0) >= 7, special: true },
];

// Returns newly-unlocked achievements (and records them in save.achievements).
export function checkAchievements(save) {
  if (!save.achievements) save.achievements = [];
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements.includes(a.id)) continue;
    try {
      if (a.check(save)) { save.achievements.push(a.id); newly.push(a); }
    } catch { /* missing stat field on an old save — treat as not-yet */ }
  }
  return newly;
}
