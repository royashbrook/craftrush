import { test, expect } from '@playwright/test';

// The shell paints from theme tokens and nothing else: every colour, font, radius
// and shadow resolves from :root, a second theme repaints by redefining the same
// names, and the maker mark heart is the one token every theme shares. Read off
// the live stylesheet and the computed styles, not the source text.

const HEART = 'rgb(224, 116, 106)';

const themeSelector = (r) => /^:root$|^\[data-theme=/.test(r.selectorText ?? '');

test('no shell rule carries a literal colour, radius, shadow or font', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#btnPlayShooter')).toBeVisible();
  const literals = await page.evaluate(() => {
    const out = [];
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules) walk(r.cssRules);
        if (!r.style) continue;
        const sel = r.selectorText ?? r.keyText ?? '';
        // the pre-mount watchdog in app.html is deliberately standalone css
        if (/^:root$|^\[data-theme=|stuck/.test(sel)) continue;
        const props = ['color', 'background-color', 'background-image', 'border-color', 'outline-color', 'fill',
          'box-shadow', 'text-shadow', 'border-radius', 'font-family'];
        for (const p of props) {
          const v = r.style.getPropertyValue(p);
          if (!v || v === 'inherit' || v === 'transparent' || v === 'none' || v === 'initial') continue;
          if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|linear-gradient/i.test(v) || (/shadow|radius/.test(p) && /\d(px|rem|em|%)/.test(v)) || (p === 'font-family' && !/^var\(/.test(v))) {
            out.push(`${sel} { ${p}: ${v} }`);
          }
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules); } catch { /* a cross-origin sheet is not ours */ }
    }
    return out;
  });
  expect(literals).toEqual([]);
});

test('the maker mark heart is the signature token and the mark is set in the mono face', async ({ page }) => {
  await page.goto('/');
  await page.locator('#navMore').click();
  await page.locator('#btnAbout').click();
  const mark = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const heart = document.querySelector('#about .mmHeart');
    const text = document.querySelector('#about .makerMark');
    return {
      heart: getComputedStyle(heart).fill,
      heartToken: root.getPropertyValue('--mark-heart').trim(),
      font: getComputedStyle(text).fontFamily,
      fontToken: root.getPropertyValue('--font-mono').trim(),
    };
  });
  expect(mark.heart).toBe(HEART);
  expect(mark.heartToken).toBe('#e0746a');
  // browsers requote family names when they serialise them, so compare bare
  const bare = (s) => s.replace(/["']/g, '');
  expect(bare(mark.font)).toBe(bare(mark.fontToken));
});

test('a second theme changes only the paint: same structure, same heart', async ({ page }) => {
  await page.goto('/');
  await page.locator('#navMore').click();
  await page.locator('#btnAbout').click();
  const snapshot = () => page.evaluate(() => {
    const logo = document.querySelector('#about .logo, #menu .logo, .logo');
    const heart = document.querySelector('#about .mmHeart');
    const structure = [...document.querySelectorAll('#stage *')].map((el) => el.tagName + '#' + el.id + '.' + el.className).join('\n');
    return { logo: getComputedStyle(logo).color, heart: getComputedStyle(heart).fill, structure };
  });
  const before = await snapshot();
  await page.evaluate(() => { document.documentElement.dataset.theme = 'neon'; });
  const after = await snapshot();
  expect(after.logo).not.toBe(before.logo);
  expect(after.heart).toBe(HEART);
  expect(after.structure).toBe(before.structure);
});
