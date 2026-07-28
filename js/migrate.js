// Carrying a save across the move from royashbrook.com/craftrush to
// craftrush.royashbrook.com.
//
// WHY THIS EXISTS AT ALL. localStorage is scoped to an ORIGIN, and a different
// hostname is a different origin, so moving the game to its own subdomain leaves
// every existing player's emeralds, skins and chapter progress behind on the old
// one. There is no browser API that reads across that line: the old
// hidden-iframe trick is dead, because Safari's ITP and Chrome's storage
// partitioning both give a third-party frame its own empty box. The only thing
// that still works is a FIRST-PARTY handoff: the old page reads its own storage,
// puts the payload in a URL fragment, and the new origin reads it back. A
// fragment (not a query) so it never leaves the browser: fragments are not sent
// to servers and do not land in logs.
//
// WHAT IT DELIBERATELY DOES NOT DO. It never writes a save itself. The payload
// is the game's own `CR1|` transfer code, so importSave() does the work it
// already does for a hand-pasted code: schema check, merge onto defaults, write
// a rollback slot, verify the write, restore the prior bytes on failure. A
// migration that invented its own save-writing path would be the one save path
// nobody had ever tested.
//
// AND IT NEVER OVERWRITES. If this device already has progress, the arriving
// save is filed as a backup entry instead, recoverable from Settings with the
// restore UI that already exists. Two people sharing a tablet, or one kid who
// found the new URL first and played on it, must not lose a run to a redirect.
import { importSave, listBackups, exportSave, MAX_BACKUPS } from './config.js';

// Written by the pre-boot script in app.html, which is deliberately dumb: it
// knows how to move bytes out of a URL and nothing about what they mean.
const INBOX_KEY = 'craftrush_migration_inbox_v1';
const DONE_KEY = 'craftrush_migration_done_v1';
// Adopting a save costs a reload, which throws away the toast that would have
// announced it. So the message outlives the page it was written on.
const TOAST_KEY = 'craftrush_migration_toast_v1';
const SAVE_KEY = 'craftrush_save_v1';
const BACKUP_KEY = 'craftrush_backups_v1';

const readInbox = () => {
  try { return localStorage.getItem(INBOX_KEY); } catch { return null; }
};
const clearInbox = () => {
  try { localStorage.removeItem(INBOX_KEY); } catch { /* private mode */ }
};

/**
 * File an arriving save as a dated backup rather than adopting it.
 *
 * Uses the same entry shape writeBackup() produces, so it shows up in the
 * existing restore list with a level and an emerald count on it, and can be
 * restored by the same code path. Stamped under its own day key so it cannot
 * quietly replace today's automatic snapshot.
 */
function fileAsBackup(code, decoded) {
  const entry = {
    day: `moved-${new Date().toISOString().slice(0, 10)}`,
    ts: Date.now(),
    level: decoded?.level ?? 0,
    emeralds: decoded?.emeralds ?? 0,
    code,
  };
  const kept = listBackups().filter((b) => b.day !== entry.day);
  kept.unshift(entry);
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(kept.slice(0, MAX_BACKUPS + 1)));
    return true;
  } catch { return false; }
}

/**
 * Consume anything the old origin handed us.
 *
 * Returns null when there is nothing to do (the common case, every load after
 * the first). Otherwise `{ adopted, message }`: `adopted` means the save is now
 * live and the caller should reload so the store rebuilds from it, because the
 * store reads localStorage once at module load and cannot be re-pointed.
 */
export function consumeMigration() {
  const raw = readInbox();
  if (!raw) return null;
  clearInbox();

  let payload;
  try { payload = JSON.parse(raw); } catch { return null; }
  const code = typeof payload?.s === 'string' ? payload.s : '';
  if (!code) return null;

  // Backups first, and independently of the save: they are pure gain, they
  // cannot collide with anything, and they are the safety net if the save
  // itself turns out to be unusable.
  if (Array.isArray(payload?.b) && payload.b.length) {
    try {
      const mine = listBackups();
      const days = new Set(mine.map((b) => b.day));
      const merged = mine.concat(payload.b.filter((b) => b?.day && b?.code && !days.has(b.day)));
      localStorage.setItem(BACKUP_KEY, JSON.stringify(merged.slice(0, MAX_BACKUPS + 3)));
    } catch { /* backups are a bonus, never a reason to fail the move */ }
  }

  let hasSave = false;
  try { hasSave = localStorage.getItem(SAVE_KEY) !== null; } catch { /* treat as empty */ }

  if (hasSave) {
    // Decode without writing, purely to label the backup entry.
    let decoded = null;
    try { decoded = JSON.parse(decodeURIComponent(escape(atob(code.replace(/^CR1\|/, ''))))); } catch { /* unlabelled */ }
    const ok = fileAsBackup(code, decoded);
    try { localStorage.setItem(DONE_KEY, '1'); } catch { /* cosmetic */ }
    return {
      adopted: false,
      message: ok
        ? 'THIS DEVICE ALREADY HAD A GAME. YOUR OLD ONE IS IN SETTINGS > RESTORE'
        : 'COULD NOT SAVE YOUR OLD GAME HERE. IT IS STILL ON THE OLD PAGE',
    };
  }

  const merged = importSave(code);
  if (!merged) {
    return { adopted: false, message: 'YOUR OLD GAME DID NOT TRANSFER. IT IS STILL ON THE OLD PAGE' };
  }
  // A snapshot of exactly what arrived, so the first thing that ever happens on
  // the new origin is recoverable even if the very next run goes wrong.
  fileAsBackup(exportSave(merged), merged);
  const message = 'YOUR GAME CAME WITH YOU!';
  try {
    localStorage.setItem(DONE_KEY, '1');
    localStorage.setItem(TOAST_KEY, message);
  } catch { /* cosmetic */ }
  return { adopted: true, message };
}

/**
 * The message left behind by an adoption, read once and then gone.
 *
 * Called on the load AFTER the reload, which is the first load where the store
 * has actually built itself from the transferred save.
 */
export function takePendingToast() {
  try {
    const msg = localStorage.getItem(TOAST_KEY);
    if (msg) localStorage.removeItem(TOAST_KEY);
    return msg || null;
  } catch { return null; }
}
