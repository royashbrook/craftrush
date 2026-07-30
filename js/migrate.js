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
import { importSave, MAX_BACKUPS } from './config.js';
import { saveSchemaError } from './pwa-safety.js';

// Written by the pre-boot script in app.html, which is deliberately dumb: it
// knows how to move bytes out of a URL and nothing about what they mean.
const INBOX_KEY = 'craftrush_migration_inbox_v1';
const DONE_KEY = 'craftrush_migration_done_v1';
// Adopting a save costs a reload, which throws away the toast that would have
// announced it. So the message outlives the page it was written on.
const TOAST_KEY = 'craftrush_migration_toast_v1';
const SAVE_KEY = 'craftrush_save_v1';
const BACKUP_KEY = 'craftrush_backups_v1';

const readStorage = (key) => {
  try { return { ok: true, value: localStorage.getItem(key) }; } catch { return { ok: false, value: null }; }
};

const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return localStorage.getItem(key) === value;
  } catch {
    return false;
  }
};

const clearInbox = () => {
  try {
    localStorage.removeItem(INBOX_KEY);
    return localStorage.getItem(INBOX_KEY) === null;
  } catch {
    return false;
  }
};

// A small deterministic identity is enough here: this is an idempotency key,
// not a security boundary. Including the byte length makes accidental checksum
// collisions between realistic save codes even less plausible.
function transferId(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}-${(hash >>> 0).toString(36)}`;
}

function decodeSaveCode(code) {
  if (typeof code !== 'string' || !code.startsWith('CR1|')) return null;
  try {
    const decoded = JSON.parse(decodeURIComponent(escape(atob(code.slice(4)))));
    return saveSchemaError(decoded) ? null : decoded;
  } catch {
    return null;
  }
}

function readBackupState() {
  const stored = readStorage(BACKUP_KEY);
  if (!stored.ok) return { ok: false, raw: null, items: [] };
  if (stored.value === null) return { ok: true, raw: null, items: [] };
  try {
    const items = JSON.parse(stored.value);
    return Array.isArray(items)
      ? { ok: true, raw: stored.value, items }
      : { ok: false, raw: stored.value, items: [] };
  } catch {
    // Never replace backup bytes we could not understand. The rescue page can
    // still copy them out, and the source origin still has the arriving save.
    return { ok: false, raw: stored.value, items: [] };
  }
}

function restoreBackupBytes(raw) {
  try {
    if (raw === null) localStorage.removeItem(BACKUP_KEY);
    else localStorage.setItem(BACKUP_KEY, raw);
  } catch { /* the caller will retain the migration inbox for another attempt */ }
}

function writeBackups(state, items) {
  const raw = JSON.stringify(items);
  try {
    localStorage.setItem(BACKUP_KEY, raw);
    if (localStorage.getItem(BACKUP_KEY) !== raw) throw new Error('backup write could not be verified');
    return true;
  } catch {
    restoreBackupBytes(state.raw);
    return false;
  }
}

function normalizedIncomingBackups(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const entry of value) {
    const decoded = decodeSaveCode(entry?.code);
    if (!decoded || typeof entry.day !== 'string' || !entry.day || entry.day.length > 64) continue;
    out.push({
      day: entry.day,
      ts: Number.isFinite(entry.ts) ? entry.ts : 0,
      level: decoded.level,
      emeralds: Number.isFinite(decoded.emeralds) ? decoded.emeralds : 0,
      code: entry.code,
    });
  }
  return out;
}

/**
 * Add the arriving save and any valid source backups without replacing a
 * destination entry. Existing backups win day collisions; the arriving live
 * save gets a unique moved-* label and one extra slot beyond the normal daily
 * retention limit.
 */
function mergedBackups(existing, code, decoded, incoming) {
  const usedDays = new Set(existing.map((entry) => entry?.day).filter(Boolean));
  const usedCodes = new Set(existing.map((entry) => entry?.code).filter(Boolean));
  const baseDay = `moved-${new Date().toISOString().slice(0, 10)}`;
  let day = baseDay;
  for (let suffix = 2; usedDays.has(day); suffix++) day = `${baseDay}-${suffix}`;
  const entry = {
    day,
    ts: Date.now(),
    level: decoded.level,
    emeralds: Number.isFinite(decoded.emeralds) ? decoded.emeralds : 0,
    code,
  };
  const merged = [entry, ...existing];
  usedDays.add(day);
  usedCodes.add(code);
  for (const backup of incoming) {
    if (usedDays.has(backup.day) || usedCodes.has(backup.code)) continue;
    merged.push(backup);
    usedDays.add(backup.day);
    usedCodes.add(backup.code);
  }
  return merged.slice(0, MAX_BACKUPS + 1);
}

function finishTransfer(id) {
  // Either marker or inbox removal is sufficient to make the handoff one-shot.
  // Try both so a browser with a selectively failing storage operation still
  // has a route to idempotence.
  writeStorage(DONE_KEY, id);
  clearInbox();
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
  const inbox = readStorage(INBOX_KEY);
  if (!inbox.ok || !inbox.value) return null;
  const raw = inbox.value;
  const invalidId = `invalid-${transferId(raw)}`;
  const previousDone = readStorage(DONE_KEY);
  if (previousDone.ok && previousDone.value === invalidId) {
    clearInbox();
    return null;
  }

  let payload;
  try { payload = JSON.parse(raw); } catch {
    finishTransfer(invalidId);
    return { adopted: false, message: 'YOUR OLD GAME DID NOT TRANSFER. IT IS STILL ON THE OLD PAGE' };
  }
  const code = typeof payload?.s === 'string' ? payload.s : '';
  const decoded = decodeSaveCode(code);
  if (!decoded) {
    finishTransfer(invalidId);
    return { adopted: false, message: 'YOUR OLD GAME DID NOT TRANSFER. IT IS STILL ON THE OLD PAGE' };
  }

  const id = `save-${transferId(code)}`;
  if (previousDone.ok && previousDone.value === id) {
    clearInbox();
    return null;
  }

  const current = readStorage(SAVE_KEY);
  if (!current.ok) {
    return {
      adopted: false,
      message: 'COULD NOT CHECK THIS DEVICE SAFELY. YOUR OLD GAME IS STILL ON THE OLD PAGE',
    };
  }

  const backupState = readBackupState();
  const hasSave = current.value !== null;

  // If the marker write and inbox removal both failed after a successful move,
  // the exact arriving code in a moved backup is the durable third proof. Do
  // not turn the second boot into a misleading "already had a game" warning.
  if (hasSave && backupState.ok
      && backupState.items.some((entry) => entry?.code === code)) {
    finishTransfer(id);
    return null;
  }

  if (hasSave) {
    // The existing live bytes are never passed to importSave(), so this branch
    // has no path that can overwrite them. If backups cannot be read or written
    // durably, retain the inbox and let a later boot retry.
    if (!backupState.ok) {
      return {
        adopted: false,
        message: 'COULD NOT SAVE YOUR OLD GAME HERE. IT IS STILL ON THE OLD PAGE',
      };
    }
    const next = mergedBackups(
      backupState.items,
      code,
      decoded,
      normalizedIncomingBackups(payload?.b),
    );
    const ok = writeBackups(backupState, next);
    if (ok) finishTransfer(id);
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

  // Keep the source code, not a re-encoded normalized save. Besides being the
  // byte-exact handoff, that gives a later boot a durable idempotency proof if
  // both the done marker and inbox removal happened to fail.
  if (backupState.ok) {
    const next = mergedBackups(
      backupState.items,
      code,
      decoded,
      normalizedIncomingBackups(payload?.b),
    );
    writeBackups(backupState, next);
  }
  const message = 'YOUR GAME CAME WITH YOU!';
  writeStorage(TOAST_KEY, message);
  finishTransfer(id);
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
