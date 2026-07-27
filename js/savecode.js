// A save, squeezed into something that fits in a QR code.
//
// Why a URL and not raw data: iOS has no BarcodeDetector, so we cannot scan a
// code from inside the game on the device this is most needed on. But the iPhone
// Camera app scans QR natively and offers to open a link. So the code carries a
// link to the rescue page with the save in the FRAGMENT, and the rescue page
// reads it back. Nothing to install, nothing to grant camera access to, and the
// fragment never reaches a server.
//
// Kept dependency free and inlined into static/rescue.html by
// tools/build-rescue.mjs, so the rescue page stays a single file that cannot
// break the way the app broke.

const PREFIX = 'cr1.';

/** base64url: '+/' and '=' are not safe in a URL fragment. */
function toB64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function squeeze(bytes, format) {
  const cs = new CompressionStream(format);
  const w = cs.writable.getWriter();
  w.write(bytes); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function unsqueeze(bytes, format) {
  const ds = new DecompressionStream(format);
  const w = ds.writable.getWriter();
  w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/**
 * Turn a save into a compact code.
 *
 * Compression roughly halves it, which is the difference between fitting in a
 * QR code and not. Where CompressionStream is missing the code still works, it
 * is just longer, so an old browser degrades rather than losing the feature.
 *
 * @param {string} json the save, exactly as stored
 * @returns {Promise<string>}
 */
export async function encodeSave(json) {
  const raw = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'undefined') return `${PREFIX}0.${toB64Url(raw)}`;
  try {
    return `${PREFIX}1.${toB64Url(await squeeze(raw, 'deflate-raw'))}`;
  } catch {
    return `${PREFIX}0.${toB64Url(raw)}`;
  }
}

/**
 * Read a code back. Throws with something a person can act on rather than
 * returning null, because every caller wants to show the reason.
 *
 * @param {string} code
 * @returns {Promise<string>} the save JSON
 */
export async function decodeSave(code) {
  const text = String(code || '').trim();
  if (!text.startsWith(PREFIX)) throw new Error('that is not a Craft Rush save code');
  const body = text.slice(PREFIX.length);
  const dot = body.indexOf('.');
  if (dot < 1) throw new Error('that save code looks damaged');
  const [flag, payload] = [body.slice(0, dot), body.slice(dot + 1)];

  let bytes;
  try { bytes = fromB64Url(payload); } catch { throw new Error('that save code looks damaged'); }

  if (flag === '1') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('this browser cannot read a compressed save code');
    }
    bytes = await unsqueeze(bytes, 'deflate-raw');
  } else if (flag !== '0') {
    throw new Error('that save code is from a newer version of the game');
  }

  const json = new TextDecoder().decode(bytes);
  JSON.parse(json);   // fail here rather than writing nonsense into storage
  return json;
}

/** The link a QR code carries: the rescue page, with the save in the fragment. */
export function saveLink(code, base) {
  const root = base || (typeof location !== 'undefined' ? location.href : '');
  const url = new URL('./rescue.html', root);
  url.hash = `save=${code}`;
  return url.href;
}

/** The code out of such a link, or null. */
export function codeFromHash(hash) {
  const m = /(?:^#?|&)save=([^&]+)/.exec(String(hash || ''));
  return m ? decodeURIComponent(m[1]) : null;
}
