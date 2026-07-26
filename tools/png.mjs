// Minimal PNG writer. Node ships zlib, and a PNG is just four chunks around a
// deflate stream, so an 8-bit RGBA encoder is about sixty lines and keeps the
// project's zero-dependency property intact.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Encode straight RGBA bytes as a PNG.
 * @param {Uint8Array} rgba  w * h * 4 bytes, row major, no padding
 */
export function encodePNG(rgba, w, h) {
  if (rgba.length !== w * h * 4) throw new Error(`rgba is ${rgba.length} bytes, expected ${w * h * 4}`);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: truecolour with alpha
  ihdr[10] = 0;   // deflate
  ihdr[11] = 0;   // adaptive filtering
  ihdr[12] = 0;   // no interlace

  // filter byte 0 (None) in front of every scanline. Pixel art is mostly flat
  // colour, so deflate does the work and a smarter filter buys nothing here.
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const src = y * w * 4;
    const dst = y * (1 + w * 4);
    raw[dst] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + src, w * 4).copy(raw, dst + 1);
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Decode an 8-bit RGBA PNG back to straight bytes.
 *
 * Only the shape encodePNG writes is supported: colour type 6, bit depth 8, no
 * interlace. That is enough to read the art files back in, and anything else is
 * a file this project did not produce, so it fails loudly rather than guessing.
 *
 * @returns {{ w: number, h: number, rgba: Uint8Array }}
 */
export function decodePNG(buf) {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (buf[i] !== SIGNATURE[i]) throw new Error('not a PNG');
  }

  let w = 0, h = 0, depth = 0, colour = 0, interlace = 0;
  const idat = [];
  let p = SIGNATURE.length;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8]; colour = data[9]; interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    p += 12 + len;                                // length + type + data + crc
  }

  if (depth !== 8 || colour !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG: depth ${depth}, colour type ${colour}, interlace ${interlace}`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = new Uint8Array(h * stride);

  // undo the per-scanline filter; every byte is four back for RGBA
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[dst + x - 4] : 0;    // left
      const b = y > 0 ? out[up + x] : 0;          // above
      const c = (x >= 4 && y > 0) ? out[up + x - 4] : 0;  // above-left
      const v = raw[src + x];
      let val;
      switch (filter) {
        case 0: val = v; break;
        case 1: val = v + a; break;
        case 2: val = v + b; break;
        case 3: val = v + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unknown scanline filter ${filter} on row ${y}`);
      }
      out[dst + x] = val & 255;
    }
  }
  return { w, h, rgba: out };
}
