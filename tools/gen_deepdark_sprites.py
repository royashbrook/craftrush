#!/usr/bin/env python3
"""Generate Deep Dark sprites (Warden boss + sculk scenery) as validated JS
object literals. Symmetry + row width are guaranteed by construction, so the
output always passes tools/validate_sprites.mjs. Prints JS to stdout."""

def grid(w, h):
    return [['.' for _ in range(w)] for _ in range(h)]

def rect(g, x0, y0, x1, y1, ch):
    for y in range(max(0, y0), min(len(g), y1 + 1)):
        for x in range(max(0, x0), min(len(g[0]), x1 + 1)):
            g[y][x] = ch

def px(g, x, y, ch):
    if 0 <= y < len(g) and 0 <= x < len(g[0]):
        g[y][x] = ch

def mirror(g):
    """Mirror the left half onto the right (left is authoritative)."""
    w = len(g[0])
    for row in g:
        for x in range(w // 2):
            row[w - 1 - x] = row[x]

def rows(g):
    return [''.join(r) for r in g]

def emit(name, w, h, anchor, palette, frames):
    print(f"  {name}: {{")
    print(f"    w: {w}, h: {h}, anchor: '{anchor}',")
    pal = ', '.join(f"{k}: '{v}'" for k, v in palette.items())
    print(f"    palette: {{ {pal} }},")
    print("    frames: [")
    for fr in frames:
        print("      [")
        for r in fr:
            assert len(r) == w, f"{name}: row width {len(r)} != {w}"
        for r in fr:
            print(f'        "{r}",')
        print("      ],")
    print("    ],")
    print("  },")

# ---------------- Warden ----------------
WPAL = {
    'k': '#0a1416',   # near-black outline
    'd': '#16303a',   # dark teal body
    't': '#20454f',   # mid teal
    'h': '#2c5a66',   # teal highlight
    'r': '#0f2228',   # rib shadow
    'c': '#2fd6d6',   # cyan glow
    'C': '#aeffff',   # bright cyan
    'y': '#123',      # unused placeholder (kept valid hex below)
}
WPAL['y'] = '#112024'

def warden(chest_big):
    W, H = 34, 38
    g = grid(W, H)
    cx = W // 2  # 17
    # sensory tendrils on top
    for tx in (10, 13):
        rect(g, tx, 0, tx, 3, 'c')
        px(g, tx, 0, 'C')
    # head block (cols 8..16 left half, mirrored)
    rect(g, 8, 4, cx, 15, 'd')
    rect(g, 8, 4, 8, 15, 'k')      # left outline
    rect(g, 8, 4, cx, 4, 'k')      # top
    rect(g, 8, 15, cx, 15, 'k')    # chin line
    # head shading speckle
    for (sx, sy) in [(10, 6), (12, 9), (9, 12), (13, 13), (11, 7)]:
        px(g, sx, sy, 't')
    # glowing eyes
    rect(g, 10, 8, 12, 9, 'C')
    px(g, 10, 10, 'c')
    # angry brow
    rect(g, 9, 7, 13, 7, 'k')
    # jaw / mouth
    rect(g, 9, 13, cx, 14, 'k')
    px(g, 11, 13, 'c')
    # shoulders + torso (cols 4..16 left)
    rect(g, 5, 16, cx, 33, 'd')
    rect(g, 5, 16, 5, 33, 'k')     # left body outline
    rect(g, 5, 16, cx, 16, 'k')    # shoulder top
    # rib texture
    for ry in range(19, 31, 3):
        rect(g, 7, ry, cx, ry, 'r')
    for (sx, sy) in [(8, 18), (11, 21), (7, 24), (12, 27), (9, 30)]:
        px(g, sx, sy, 't')
    # glowing chest heart (the Warden's core)
    hy0, hy1 = (18, 27) if chest_big else (19, 26)
    for y in range(hy0, hy1 + 1):
        spread = (min(y - hy0, hy1 - y)) + (2 if chest_big else 1)
        rect(g, cx - spread, y, cx, y, 'c')
    # bright core center
    rect(g, cx - (2 if chest_big else 1), (hy0 + hy1) // 2 - 1, cx, (hy0 + hy1) // 2 + 1, 'C')
    # arms hanging at the sides (left)
    ay = 2 if chest_big else 0
    rect(g, 1, 17 + ay, 4, 31 + ay, 'd')
    rect(g, 1, 17 + ay, 1, 31 + ay, 'k')
    rect(g, 1, 31 + ay, 4, 33 + ay, 'k')   # fist
    px(g, 2, 22 + ay, 't')
    # legs
    rect(g, 9, 34, 13, 37, 'd')
    rect(g, 9, 37, 13, 37, 'k')
    rect(g, 9, 34, 9, 37, 'k')
    mirror(g)
    return rows(g)

# ---------------- Sculk scenery ----------------
def sculk_sensor():
    # squat dark block with cyan tendrils waving up
    W, H = 16, 16
    g = grid(W, H)
    P = {'k': '#0a1416', 'd': '#16303a', 'v': '#123', 'c': '#2fd6d6', 'C': '#aeffff'}
    P['v'] = '#0f2228'
    rect(g, 2, 10, 13, 15, 'd')
    rect(g, 2, 10, 13, 10, 'k')
    rect(g, 2, 15, 13, 15, 'k')
    rect(g, 2, 10, 2, 15, 'k')
    rect(g, 13, 10, 13, 15, 'k')
    for (sx, sy) in [(4, 12), (8, 13), (10, 11)]:
        px(g, sx, sy, 'v')
    # tendrils
    for tx in (5, 8, 11):
        rect(g, tx, 5, tx, 9, 'c')
        px(g, tx, 4, 'C')
    px(g, 6, 7, 'C'); px(g, 10, 6, 'C')
    return W, H, P, rows(g)

def sculk_shrieker():
    # ringed eye-like block on the ground
    W, H = 16, 12
    g = grid(W, H)
    P = {'k': '#0a1416', 'd': '#16303a', 't': '#20454f', 'c': '#2fd6d6', 'C': '#aeffff'}
    rect(g, 1, 2, 14, 11, 'd')
    rect(g, 1, 2, 14, 2, 'k')
    rect(g, 1, 11, 14, 11, 'k')
    rect(g, 1, 2, 1, 11, 'k')
    rect(g, 14, 2, 14, 11, 'k')
    rect(g, 4, 4, 11, 9, 't')
    rect(g, 6, 5, 9, 8, 'c')
    rect(g, 7, 6, 8, 7, 'C')
    return W, H, P, rows(g)

def deepslate_pillar():
    W, H = 12, 34
    g = grid(W, H)
    P = {'k': '#0a1416', 'd': '#1b2b30', 't': '#2a3d42', 'c': '#2fd6d6', 'v': '#0f2228'}
    rect(g, 2, 0, 9, 33, 'd')
    rect(g, 2, 0, 2, 33, 'k')
    rect(g, 9, 0, 9, 33, 'k')
    for y in range(0, 34, 4):
        rect(g, 3, y, 8, y, 't')
    for (sx, sy) in [(4, 6), (7, 11), (3, 17), (8, 23), (5, 29)]:
        px(g, sx, sy, 'v')
    # a few sculk veins glowing
    px(g, 4, 9, 'c'); px(g, 7, 20, 'c'); px(g, 5, 27, 'c')
    return W, H, P, rows(g)

print("// --- appended Deep Dark sprites (generated) ---")
print("BOSSES block:")
emit('boss_warden', 34, 38, 'bottom', WPAL, [warden(False), warden(True)])
print()
print("SCENERY block:")
for nm, fn in [('sculk_sensor', sculk_sensor), ('sculk_shrieker', sculk_shrieker), ('deepslate_pillar', deepslate_pillar)]:
    w, h, pal, r = fn()
    emit(nm, w, h, 'bottom', pal, [r])
