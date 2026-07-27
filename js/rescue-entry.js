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

const SAVE_KEY = 'craftrush_save_v1';
const BACKUP_KEY = 'craftrush_backups_v1';
const $ = (id) => document.getElementById(id);

const readSave = () => { try { return localStorage.getItem(SAVE_KEY); } catch { return null; } };

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

function showBackups() {
  let b = null;
  try { b = localStorage.getItem(BACKUP_KEY); } catch { /* private mode */ }
  if (!b) { $('backups').textContent = 'none found'; return; }
  let list;
  try { list = JSON.parse(b); } catch { $('backups').textContent = 'found, but could not be read'; return; }
  const keys = Object.keys(list);
  if (!keys.length) { $('backups').textContent = 'none found'; return; }

  $('backups').innerHTML = '<ul>' + keys.map((k) => {
    let em = '';
    try {
      const p = typeof list[k] === 'string' ? JSON.parse(list[k]) : list[k];
      if (p && p.emeralds != null) em = ` — ${p.emeralds} emeralds`;
    } catch { /* show the date alone */ }
    return `<li>${k}${em} <button data-k="${k}" class="grey useBackup">USE THIS ONE</button></li>`;
  }).join('') + '</ul>';

  for (const btn of document.querySelectorAll('.useBackup')) {
    btn.addEventListener('click', () => {
      const entry = list[btn.getAttribute('data-k')];
      $('restoreBox').value = typeof entry === 'string' ? entry : JSON.stringify(entry);
      $('msg2').innerHTML = '<span class="ok">Loaded below. Press RESTORE to use it.</span>';
      $('restoreBox').scrollIntoView({ block: 'center' });
    });
  }
}

function show() {
  describeContext();
  const raw = readSave();
  if (raw) {
    $('status').innerHTML = '<span class="ok">FOUND YOUR SAVE — it is safe.</span>';
    $('box').value = raw;
    $('summary').textContent = summarise(raw);
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
    $('qrMsg').innerHTML = '<span class="bad">This save is too big for a QR code'
      + ' — use COPY and paste it into the other device instead.</span>'
      + `<div class="dim">${e && e.message ? e.message : e}</div>`;
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
    $('msg2').innerHTML = `<span class="bad">That scanned code did not work: ${e.message}</span>`;
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
    try { JSON.parse(v); } catch {
      $('msg2').innerHTML = '<span class="bad">That does not look like a save (not valid JSON).</span>';
      return;
    }
    if (readSave() && !confirm('This replaces the save in this browser. Copy it first if you need it. Continue?')) return;
    try {
      localStorage.setItem(SAVE_KEY, v);
      $('msg2').innerHTML = '<span class="ok">Restored. Open the game to check it.</span>';
      $('incoming').hidden = true;
      show();
    } catch (e) {
      $('msg2').innerHTML = `<span class="bad">Could not write to storage: ${e.message}</span>`;
    }
  });

  $('clean').addEventListener('click', async () => {
    $('msg3').textContent = 'Working…';
    try {
      if (window.caches) {
        for (const k of await caches.keys()) await caches.delete(k);
      }
      if (navigator.serviceWorker) {
        for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      }
      $('msg3').innerHTML = `<span class="ok">Cleared the app cache. Your save is ${readSave() ? 'still here' : 'NOT in this browser (it was not before either)'}.</span> Now open <a href="./">the game</a>.`;
    } catch (e) {
      $('msg3').innerHTML = `<span class="bad">Something went wrong: ${e.message}</span>`;
    }
  });
}

wire();
show();
takeIncoming();
