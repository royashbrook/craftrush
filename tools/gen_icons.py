#!/usr/bin/env python3
"""Generate PWA icons (pixel-art creeper-style face) with stdlib only."""
import struct, zlib, os

# 16x16 art: mottled green block + dark face
G = {'a': (102, 217, 79), 'g': (79, 191, 60), 'G': (61, 165, 46), 'd': (43, 125, 32), 'k': (15, 26, 12)}
ART = [
    "gaggGggaggGgagga",
    "agGggaggGgaggGgg",
    "ggggGggggGgaggGa",
    "gGaggGgaggGggagg",
    "ggkkggggggkkgggG",
    "gakkGgagagkkGagg",
    "ggkkggggggkkggga",
    "gGggagkkkkgggGgg",
    "gaggGgkkkkgaggGg",
    "ggagkkkkkkkkgagg",
    "gGggkkkkkkkkggGa",
    "ggagkkgggGkkgagg",
    "gagGkkgaggkkgGgg",
    "gGggkkggagkkggag",
    "ggaggGgaggGgggGa",
    "agGgagGggagGgagg",
]

def write_png(path, size, pad_frac=0.0, bg=None):
    px_art = 16
    inner = int(size * (1 - 2 * pad_frac))
    scale = max(1, inner // px_art)
    inner = scale * px_art
    off = (size - inner) // 2
    rows = []
    for y in range(size):
        row = bytearray([0])  # filter type 0
        ay = (y - off) // scale
        for x in range(size):
            ax = (x - off) // scale
            if 0 <= ax < px_art and 0 <= ay < px_art:
                r, g, b = G[ART[ay][ax]]
                row += bytes((r, g, b, 255))
            elif bg:
                row += bytes((*bg, 255))
            else:
                row += bytes((0, 0, 0, 0))
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print(f"wrote {path} ({size}x{size})")

here = os.path.dirname(os.path.abspath(__file__))
icons = os.path.join(here, '..', 'icons')
os.makedirs(icons, exist_ok=True)
write_png(os.path.join(icons, 'icon-192.png'), 192)
write_png(os.path.join(icons, 'icon-512.png'), 512)
write_png(os.path.join(icons, 'icon-512-maskable.png'), 512, pad_frac=0.12, bg=(20, 18, 24))
write_png(os.path.join(icons, 'apple-touch-icon.png'), 180, pad_frac=0.05, bg=(20, 18, 24))
