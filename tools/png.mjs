// Minimal PNG writer. Node ships zlib, and a PNG is just four chunks around a
// deflate stream, so an 8-bit RGBA encoder is about sixty lines and keeps the
// project's zero-dependency property intact.
import { deflateSync } from 'node:zlib';

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
