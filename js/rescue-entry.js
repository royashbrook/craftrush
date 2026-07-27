// The save rescue page's logic.
//
// Bundled by tools/build-rescue.mjs into a single inline <script> in
// static/rescue.html. The point of that page is that it has NO RUNTIME MODULE
// GRAPH: it is the page a player reaches when the app's modules already failed
// them, so it must not depend on any of the same machinery. Bundling npm code
// into it is fine — the library becomes part of the one file, exactly like
// Svelte does for the app. What it must never do is import anything at runtime.
import QRCode from 'qrcode';
import { encodeSave, decodeSave, saveLink, codeFromHash } from './savecode.js';
import {
  ownsCraftRushCache,
  ownsCraftRushRegistration,
  parsePlayableSave,
} from './pwa-safety.js';

const SAVE_KEY = 'craftrush_save_v1';
const BACKUP_KEY = 'craftrush_backups_v1';
const PRE_RESTORE_KEY = 'craftrush_pre_restore_v1';
const $ = (id) => document.getElementById(id);

const readSave = () => { try { return localStorage.getItem(SAVE_KEY); } catch { return null; } };
function message(id, kind, text) {
  const span = document.createElement('span');
  span.className = kind;
  span.textContent = text;
  $(id).replaceChildren(span);
}

/**
 * On iOS an app added to the Home Screen gets its OWN storage, separate from
 * Safari's. Same game, same phone, two different saves, which is baffling unless
 * something says so plainly.
 */
function describeContext() {
  let standalone = false;
  try {
    standalone = window.navigator.standalone === true
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  } catch { /* older browsers */ }
  $('where').innerHTML = standalone
    ? '<strong class="ok">The installed app.</strong> On iPhone this keeps its own save, separate '
      + 'from the one in Safari. The save below is the installed app\'s.'
    : '<strong class="ok">A browser tab.</strong> If you also added the game to your Home Screen, that '
      + 'installed app keeps a SEPARATE save on iPhone. Use the QR code below to move progress across.';
}

function summarise(json) {
  try {
    const s = JSON.parse(json);
    const bits = [];
    if (s.emeralds != null) bits.push(`${s.emeralds} emeralds`);
    if (s.level != null) bits.push(`level ${s.level}`);
    if (s.unlocked?.length) bits.push(`${s.unlocked.length} skins`);
    if (s.campaign?.done) bits.push(`${s.campaign.done.length} chapters done`);
    return bits.join('  ·  ');
  } catch {
    return '(could not read the details, but the text below is your save)';
  }
}

function decodeBackup(entry) {
  try {
    if (entry && typeof entry === 'object' && typeof entry.code === 'string') return decodeBackup(entry.code);
    if (entry && typeof entry === 'object') return JSON.stringify(entry);
    if (typeof entry !== 'string') return null;
    if (!entry.startsWith('CR1|')) return entry;
    return decodeURIComponent(escape(atob(entry.slice(4))));
  } catch {
    return null;
  }
}

function backupRows(list) {
  if (Array.isArray(list)) {
    return list.map((entry, index) => ({
      label: entry?.day || `backup ${index + 1}`,
      raw: decodeBackup(entry),
    }));
  }
  if (list && typeof list === 'object') {
    return Object.entries(list).map(([label, entry]) => ({ label, raw: decodeBackup(entry) }));
  }
  return [];
}

function showBackups() {
  let dailyRaw = null;
  let previousRaw = null;
  try {
    dailyRaw = localStorage.getItem(BACKUP_KEY);
    previousRaw = localStorage.getItem(PRE_RESTORE_KEY);
  } catch { /* private mode */ }

  const rows = [];
  if (previousRaw) {
    try {
      const previous = JSON.parse(previousRaw);
      if (typeof previous?.raw === 'string') {
        rows.push({
          label: `before last restore (${new Date(previous.ts).toLocaleString()})`,
          raw: previous.raw,
        });
      }
    } catch { /* a broken previous slot must not hide valid daily backups */ }
  }
  if (dailyRaw) {
    try {
      rows.push(...backupRows(JSON.parse(dailyRaw)));
    } catch {
      if (!rows.length) {
        $('backups').textContent = 'found, but could not be read';
        return;
      }
    }
  }
  if (!rows.length) { $('backups').textContent = 'none found'; return; }

  const list = document.createElement('ul');
  for (const row of rows) {
    const item = document.createElement('li');
    let emeralds = '';
    try {
      const parsed = JSON.parse(row.raw);
      if (parsed?.emeralds != null) emeralds = ` — ${parsed.emeralds} emeralds`;
    } catch { /* keep the backup visible even when its detail cannot be read */ }
    item.append(document.createTextNode(`${row.label}${emeralds} `));
    const button = document.createElement('button');
    button.className = 'grey useBackup';
    button.textContent = row.raw ? 'USE THIS ONE' : 'CANNOT READ';
    button.disabled = !row.raw;
    button.addEventListener('click', () => {
      $('restoreBox').value = row.raw;
      $('msg2').innerHTML = '<span class="ok">Loaded below. Press RESTORE to use it.</span>';
      $('restoreBox').scrollIntoView({ block: 'center' });
    });
    item.append(button);
    list.append(item);
  }
  $('backups').replaceChildren(list);
}

/**
 * A restore can replace the live slot only after the exact old bytes are in a
 * dedicated rollback slot. Daily backups keep their own cadence and are never
 * consumed or overwritten by rescue work.
 */
function preserveCurrentSave(raw) {
  localStorage.setItem(PRE_RESTORE_KEY, JSON.stringify({ ts: Date.now(), raw }));
  const written = JSON.parse(localStorage.getItem(PRE_RESTORE_KEY));
  if (written?.raw !== raw) throw new Error('the rollback copy could not be verified');
}

function show() {
  describeContext();
  const raw = readSave();
  if (raw) {
    $('box').value = raw;
    const playable = parsePlayableSave(raw);
    if (playable.error) {
      message('status', 'bad', 'FOUND SAVE DATA, but it is not playable yet.');
      $('summary').textContent = `Copy it before changing anything, then try Backups & one-step rollback below. Problem: ${playable.error}.`;
    } else {
      message('status', 'ok', 'FOUND YOUR SAVE — it is safe.');
      $('summary').textContent = summarise(raw);
    }
  } else {
    $('status').innerHTML = '<span class="bad">No save found in this browser.</span>';
    $('summary').textContent = 'If you played in a different browser, or as an installed app, try there.';
  }
  showBackups();
}

/**
 * Show the save as a QR code.
 *
 * The code carries a LINK to this page with the save in the fragment, not the
 * save on its own. iOS has no BarcodeDetector, so we cannot scan from inside the
 * game on the device that needs this most — but the iPhone Camera app reads a QR
 * natively and offers to open a link. Nothing to install, no camera permission
 * to grant, and the fragment never reaches a server.
 */
async function showQR() {
  const raw = readSave();
  if (!raw) { $('qrMsg').innerHTML = '<span class="bad">No save here to share.</span>'; return; }
  $('qrMsg').textContent = 'Building…';
  try {
    const code = await encodeSave(raw);
    const link = saveLink(code);
    await QRCode.toCanvas($('qr'), link, { errorCorrectionLevel: 'L', margin: 2, width: 280 });
    $('qrWrap').hidden = false;
    $('qrLink').value = link;
    $('qrMsg').innerHTML = '<span class="ok">Point the other device\'s camera at this.</span> '
      + `<span class="dim">(${(link.length / 1024).toFixed(1)}KB of ${(2.9).toFixed(1)}KB)</span>`;
  } catch (e) {
    // the honest failure: a very long save will not fit, and a code that cannot
    // be scanned is worse than saying so
    $('qrWrap').hidden = true;
    const explanation = document.createElement('span');
    explanation.className = 'bad';
    explanation.textContent = 'This save is too big for a QR code — use COPY and paste it into the other device instead.';
    const reason = document.createElement('div');
    reason.className = 'dim';
    reason.textContent = e && e.message ? e.message : String(e);
    $('qrMsg').replaceChildren(explanation, reason);
  }
}

/** A save arriving from a scanned code. */
async function takeIncoming() {
  const code = codeFromHash(location.hash);
  if (!code) return;
  try {
    const json = await decodeSave(code);
    $('restoreBox').value = json;
    $('incoming').hidden = false;
    $('incomingWhat').textContent = summarise(json);
    // do not leave the save sitting in the address bar
    history.replaceState(null, '', location.pathname + location.search);
  } catch (e) {
    message('msg2', 'bad', `That scanned code did not work: ${e.message}`);
  }
}

function wire() {
  $('copy').addEventListener('click', () => {
    const t = $('box');
    t.select(); t.setSelectionRange(0, 999999);
    let done = false;
    try { if (navigator.clipboard) { navigator.clipboard.writeText(t.value); done = true; } } catch { /* fall through */ }
    if (!done) { try { done = document.execCommand('copy'); } catch { /* ignore */ } }
    $('msg1').innerHTML = done
      ? '<span class="ok">Copied. Paste it somewhere safe.</span>'
      : '<span class="bad">Could not copy — select the text and copy it by hand.</span>';
  });

  $('download').addEventListener('click', () => {
    if (!$('box').value) { $('msg1').innerHTML = '<span class="bad">Nothing to download.</span>'; return; }
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([$('box').value], { type: 'application/json' }));
      a.download = 'craftrush-save.json';
      document.body.appendChild(a); a.click(); a.remove();
      $('msg1').innerHTML = '<span class="ok">Downloaded craftrush-save.json</span>';
    } catch {
      $('msg1').innerHTML = '<span class="bad">Download failed — use COPY instead.</span>';
    }
  });

  $('reload').addEventListener('click', () => location.reload());
  $('showQr').addEventListener('click', showQR);

  $('restore').addEventListener('click', () => {
    const v = $('restoreBox').value.trim();
    if (!v) { $('msg2').innerHTML = '<span class="bad">Paste a save first.</span>'; return; }
    const incoming = parsePlayableSave(v);
    if (incoming.error) {
      message('msg2', 'bad', `That is not a playable Craft Rush save: ${incoming.error}.`);
      return;
    }
    const beforeConfirm = readSave();
    if (beforeConfirm
        && !confirm('This replaces the save in this browser. The current save will be backed up first. Continue?')) return;
    // confirm() yields control to the browser. Another tab can save while the
    // dialog is open, so read again and preserve the bytes that are actually
    // about to be replaced rather than the stale pre-dialog snapshot.
    const current = readSave();
    if (current) {
      try {
        preserveCurrentSave(current);
      } catch (e) {
        message('msg2', 'bad', `Nothing was replaced because the current save could not be backed up: ${e.message}`);
        return;
      }
    }
    try {
      localStorage.setItem(SAVE_KEY, v);
      if (readSave() !== v) throw new Error('the restored bytes could not be verified');
    } catch (e) {
      message('msg2', 'bad', `Could not write the restored save: ${e.message}`);
      return;
    }
    message('msg2', 'ok', `Restored.${current ? ' Your previous save is available in Backups & one-step rollback above.' : ''} Open the game to check it.`);
    $('incoming').hidden = true;
    show();
    if (current) {
      const rollbackButton = $('backups').querySelector('button');
      rollbackButton?.focus();
      $('backups').scrollIntoView({ block: 'center' });
    }
  });

  $('clean').addEventListener('click', async () => {
    $('msg3').textContent = 'Working…';
    try {
      if (window.caches) {
        for (const k of await caches.keys()) {
          if (ownsCraftRushCache(k)) await caches.delete(k);
        }
      }
      if (navigator.serviceWorker) {
        for (const r of await navigator.serviceWorker.getRegistrations()) {
          if (ownsCraftRushRegistration(r, location.href)) await r.unregister();
        }
      }
      $('msg3').innerHTML = `<span class="ok">Cleared the app cache. Your save is ${readSave() ? 'still here' : 'NOT in this browser (it was not before either)'}.</span> Now open <a href="./">the game</a>.`;
    } catch (e) {
      message('msg3', 'bad', `Something went wrong: ${e.message}`);
    }
  });
}

wire();
show();
takeIncoming();
