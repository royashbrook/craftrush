import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const path = process.env.SAVE_CODE_RUNTIME;
const runtime = await import(path ? pathToFileURL(resolve(path)).href : '../js/savecode.ts');
const { encodeSave, decodeSave, codeFromHash, saveLink } = runtime;
const MAX_SAVE_BYTES = runtime.MAX_SAVE_BYTES ?? 1024 * 1024;
const MAX_CODE_LENGTH = runtime.MAX_CODE_LENGTH ?? 6 + Math.ceil(MAX_SAVE_BYTES / 3) * 4;
const TRANSFER_TIMEOUT_MS = runtime.TRANSFER_TIMEOUT_MS ?? 5000;
const rawCode = bytes => `cr1.0.${Buffer.from(bytes).toString('base64url')}`;
const compressedCode = bytes => `cr1.1.${deflateRawSync(bytes).toString('base64url')}`;
const sample = JSON.stringify({ level: 12, emeralds: 5432, skin: 'steve', note: '古い町 🌙', world: { opaque: true } });
function replaceGlobal(t, name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const restore = () => Object.defineProperty(globalThis, name, descriptor);
  t.after(restore);
  return restore;
}

test('current and legacy raw/compressed cr1 envelopes preserve the exact save bytes', async () => {
  const encoded = await encodeSave(sample);
  assert.match(encoded, /^cr1\.[01]\./);
  assert.equal(await decodeSave(encoded), sample);
  assert.equal(await decodeSave(rawCode(sample)), sample);
  assert.equal(await decodeSave(compressedCode(Buffer.from(sample))), sample);
  const link = saveLink(encoded, 'https://craftrush.example/play?old=1');
  assert.equal(new URL(link).pathname, '/rescue.html');
  assert.equal(codeFromHash(new URL(link).hash), encoded);
  assert.equal(codeFromHash(`#other=yes&save=${encodeURIComponent(encoded)}`), encoded);
  assert.equal(codeFromHash('#unrelated'), null);
});

test('a generous retired-world payload round-trips without dropping opaque fields', async (t) => {
  const json = JSON.stringify({ level: 40, world: {
    towns: Array.from({ length: 40 }, (_, town) => ({
      id: town, houses: Array.from({ length: 20 }, (_, house) => ({
        id: house, people: Array.from({ length: 6 }, (_, person) => ({ skin: `friend-${person}`, x: house, y: town })),
        decor: Array.from({ length: 10 }, (_, item) => ({ item: `decoration-${item}`, x: item, y: house })),
      })),
    })),
  } });
  assert.ok(Buffer.byteLength(json) > 400_000, 'fixture exercises a substantial retained world');
  assert.ok(Buffer.byteLength(json) < MAX_SAVE_BYTES);
  t.diagnostic(`retained-world fixture: ${Buffer.byteLength(json)} UTF-8 bytes`);
  assert.equal(await decodeSave(await encodeSave(json)), json);
});

test('missing and unsupported compression retain the raw fallback', async (t) => {
  for (const replacement of [undefined, class { constructor() { throw new TypeError('format unavailable'); } }]) {
    const restore = replaceGlobal(t, 'CompressionStream', replacement);
    const code = await encodeSave(sample);
    assert.match(code, /^cr1\.0\./);
    assert.equal(await decodeSave(code), sample);
    restore();
  }
});

test('raw and export byte limits accept the boundary and reject one byte beyond it', async (t) => {
  replaceGlobal(t, 'CompressionStream', undefined);
  const atLimit = JSON.stringify('x'.repeat(MAX_SAVE_BYTES - 2));
  const encoded = await encodeSave(atLimit);
  assert.ok(encoded.length <= MAX_CODE_LENGTH);
  assert.equal(await decodeSave(encoded), atLimit);
  await assert.rejects(() => encodeSave(JSON.stringify('x'.repeat(MAX_SAVE_BYTES - 1))), /too large/);
  await assert.rejects(() => decodeSave(rawCode(JSON.stringify('x'.repeat(MAX_SAVE_BYTES - 1)))), /too large/);
  await assert.rejects(() => encodeSave(JSON.stringify('🌙'.repeat(MAX_SAVE_BYTES / 3))), /too large/);
});

test('code limit applies before trimming or base64 allocation', async (t) => {
  let decoded = 0;
  t.mock.method(globalThis, 'atob', () => { decoded++; return ''; });
  await assert.rejects(() => decodeSave(' '.repeat(MAX_CODE_LENGTH) + rawCode(sample)), /too large/);
  assert.equal(decoded, 0);
});

test('damaged payloads, unknown envelopes and invalid UTF-8 are refused', async () => {
  for (const code of ['', 'cr2.0.AA', 'cr1..AA', 'cr1.9.AA', 'cr1.0.@@', rawCode('not json'), rawCode(Buffer.from([34, 255, 34]))]) {
    await assert.rejects(() => decodeSave(code), undefined, code.slice(0, 30));
  }
  await assert.rejects(() => decodeSave('cr1.1.YnJva2Vu'), undefined);
  assert.throws(() => codeFromHash('#save=%GG'), /damaged/);
  assert.throws(() => codeFromHash('#save=%E0%A4%A'), /damaged/);
});

test('missing decompression explains why a compressed code cannot be opened', async (t) => {
  replaceGlobal(t, 'DecompressionStream', undefined);
  await assert.rejects(() => decodeSave(compressedCode(Buffer.from(sample))), /cannot read a compressed/);
});

test('native inflation is bounded while reading, not after collecting the full output', async (t) => {
  const RealDecoder = globalThis.DecompressionStream;
  let pulledBytes = 0;
  t.mock.method(globalThis, 'DecompressionStream', class extends RealDecoder {
    constructor(format) {
      super(format);
      const counted = super.readable.pipeThrough(new TransformStream({
        transform(chunk, controller) { pulledBytes += chunk.byteLength; controller.enqueue(chunk); },
      }));
      Object.defineProperty(this, 'readable', { value: counted });
    }
  });
  const payload = Buffer.from(JSON.stringify('x'.repeat(16 * MAX_SAVE_BYTES)));
  const code = compressedCode(payload);
  assert.ok(code.length < MAX_CODE_LENGTH);
  let failure;
  try { await decodeSave(code); } catch (error) { failure = error; }
  t.diagnostic(`native inflation: ${pulledBytes} bytes pulled from ${payload.byteLength}-byte payload`);
  assert.ok(pulledBytes < MAX_SAVE_BYTES * 2, `pulled ${pulledBytes} bytes`);
  assert.match(failure?.message ?? '', /too large/);
});

test('success, malformed streams and oversize streams all cancel the reader', async (t) => {
  const cancel = ReadableStreamDefaultReader.prototype.cancel;
  let cancelled = 0;
  t.mock.method(ReadableStreamDefaultReader.prototype, 'cancel', function (...args) {
    cancelled++;
    return cancel.apply(this, args);
  });
  await decodeSave(compressedCode(Buffer.from(sample)));
  assert.equal(cancelled, 1);
  await assert.rejects(() => decodeSave('cr1.1.YnJva2Vu'));
  assert.equal(cancelled, 2);
  await assert.rejects(() => decodeSave(compressedCode(Buffer.alloc(MAX_SAVE_BYTES * 2, 32))), /too large/);
  assert.equal(cancelled, 3);
});

test('a stalled decoder reaches its deadline and does not await a hanging cancel', async (t) => {
  let cancelled = 0;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'DecompressionStream', class {
    constructor() {
      return {
        writable: new WritableStream(),
        readable: new ReadableStream({ cancel() { cancelled++; return new Promise(() => {}); } }),
      };
    }
  });
  const decoding = decodeSave('cr1.1.AA');
  let settled = false;
  decoding.then(() => { settled = true; }, () => { settled = true; });
  const rejected = assert.rejects(decoding, /timed out/);
  t.mock.timers.tick(TRANSFER_TIMEOUT_MS - 1);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false, 'deadline did not expire early');
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(cancelled, 1);
});

test('transform write failures are observed through the pipe, with raw encode fallback', async (t) => {
  class BrokenTransform {
    constructor() {
      return new TransformStream({ transform() { throw new Error('transform failed'); } });
    }
  }
  t.mock.method(globalThis, 'CompressionStream', BrokenTransform);
  assert.equal(await encodeSave(sample), rawCode(sample));
  t.mock.method(globalThis, 'DecompressionStream', BrokenTransform);
  await assert.rejects(() => decodeSave('cr1.1.AA'), /transform failed/);
});
