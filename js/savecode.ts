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
// The active save is small, but retired village/world data is retained intact.
// Allow 1 MiB of UTF-8 data (including that opaque history), not unbounded
// inflation. The matching code limit also admits an uncompressed save this size.
export const MAX_SAVE_BYTES = 1024 * 1024;
export const MAX_CODE_LENGTH = PREFIX.length + 2 + Math.ceil(MAX_SAVE_BYTES / 3) * 4;
export const TRANSFER_TIMEOUT_MS = 5000;

/** base64url: '+/' and '=' are not safe in a URL fragment. */
function toB64Url(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(str: string) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function boundedBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_SAVE_BYTES) throw new Error('that save code is too large');
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return bytes;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('save transfer timed out; try copying the save instead')), TRANSFER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    // Do not let a stuck cancellation hold the error or deadline hostage.
    void reader.cancel().catch(() => {});
  }
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
export async function encodeSave(json: string): Promise<string> {
  if (json.length > MAX_SAVE_BYTES) throw new Error('that save code is too large');
  const raw = new TextEncoder().encode(json);
  if (raw.byteLength > MAX_SAVE_BYTES) throw new Error('that save code is too large');
  if (typeof CompressionStream === 'undefined') return `${PREFIX}0.${toB64Url(raw)}`;
  try {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return `${PREFIX}1.${toB64Url(await boundedBytes(stream))}`;
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
export async function decodeSave(code: string): Promise<string> {
  const input = String(code || '');
  if (input.length > MAX_CODE_LENGTH) throw new Error('that save code is too large');
  const text = input.trim();
  if (!text.startsWith(PREFIX)) throw new Error('that is not a Craft Rush save code');
  const body = text.slice(PREFIX.length);
  const dot = body.indexOf('.');
  if (dot < 1) throw new Error('that save code looks damaged');
  const [flag, payload] = [body.slice(0, dot), body.slice(dot + 1)];

  let bytes;
  try { bytes = fromB64Url(payload); } catch { throw new Error('that save code looks damaged'); }
  if (bytes.byteLength > MAX_SAVE_BYTES) throw new Error('that save code is too large');

  if (flag === '1') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('this browser cannot read a compressed save code');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = await boundedBytes(stream);
  } else if (flag !== '0') {
    throw new Error('that save code is from a newer version of the game');
  }

  const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  JSON.parse(json);   // fail here rather than writing nonsense into storage
  return json;
}

/** The link a QR code carries: the rescue page, with the save in the fragment. */
export function saveLink(code: string, base?: string) {
  const root = base || (typeof location !== 'undefined' ? location.href : '');
  const url = new URL('./rescue.html', root);
  url.hash = `save=${code}`;
  return url.href;
}

/** The code out of such a link, or null. */
export function codeFromHash(hash: string) {
  const m = /(?:^#?|&)save=([^&]+)/.exec(String(hash || ''));
  if (!m) return null;
  if (m[1].length > MAX_CODE_LENGTH * 3) throw new Error('that save link is too large');
  try { return decodeURIComponent(m[1]); }
  catch { throw new Error('that save link looks damaged'); }
}
