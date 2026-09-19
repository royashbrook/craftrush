import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function packageForModule(id, cwd = process.cwd()) {
  const clean = id.replace(/\?.*$/, '').replace(/^\0/, '');
  if (!clean.includes('/node_modules/')) return null;
  let directory = dirname(clean);
  while (directory !== dirname(directory)) {
    const path = join(directory, 'package.json');
    if (existsSync(path)) {
      const pkg = JSON.parse(readFileSync(path, 'utf8'));
      if (pkg.name && pkg.version) {
        const notices = readdirSync(directory, { withFileTypes: true })
          .filter(entry => entry.isFile() && /^(licen[cs]e|copying|notice|third-party-license)([.-]|$)/i.test(entry.name))
          .map(entry => entry.name).sort()
          .map(name => ({ path: `${pkg.name}/${name}`, text: readFileSync(join(directory, name), 'utf8').trim() }));
        assert.ok(notices.some(notice => notice.text.length > 80), `missing license text for bundled ${pkg.name}`);
        return { name: pkg.name, version: pkg.version, license: pkg.license, notices, module: `${pkg.name}/${relative(directory, clean)}` };
      }
    }
    directory = dirname(directory);
  }
  throw new Error(`cannot identify bundled dependency: ${id}`);
}

export function inventoryForModules(ids, cwd = process.cwd()) {
  const packages = new Map();
  const firstPartyModules = [];
  const generatedModules = [];
  for (const id of [...new Set(ids)].sort()) {
    const helper = id.match(/^\0(vite|rolldown)\//)?.[1];
    const pkg = packageForModule(helper ? resolve(cwd, 'node_modules', helper, 'package.json') : id, cwd);
    if (pkg) {
      const { module, ...metadata } = pkg;
      const key = `${pkg.name}@${pkg.version}`;
      if (!packages.has(key)) packages.set(key, { ...metadata, modules: [] });
      packages.get(key).modules.push(helper ? id.replace(/^\0/, 'virtual:') : module);
    } else if (id.startsWith('\0')) {
      // Do not publish the machine's checkout path in virtual module ids.
      const clean = id.replace(/^\0/, '').replaceAll(resolve(cwd), '.');
      assert.ok(!clean.includes('/private/') && !clean.includes('/Users/'), 'virtual module includes a host path');
      generatedModules.push(clean);
    } else {
      const path = id.replace(/\?.*$/, '');
      if (!isAbsolute(path)) continue;
      const local = relative(cwd, path);
      assert.ok(!local.startsWith('../'), `module outside the build root: ${local}`);
      if (existsSync(path)) firstPartyModules.push({ path: local, sha256: digest(readFileSync(path)) });
    }
  }
  return { packages: [...packages.values()].sort((a, b) => a.name < b.name ? -1 : 1), firstPartyModules, generatedModules };
}

export function mergedInventory(main, rescue, cwd = process.cwd()) {
  const packages = new Map();
  for (const pkg of [...main.packages, ...rescue.packages]) {
    const key = `${pkg.name}@${pkg.version}`;
    if (!packages.has(key)) packages.set(key, { ...pkg, modules: [] });
    packages.get(key).modules.push(...pkg.modules);
  }
  for (const pkg of packages.values()) pkg.modules = [...new Set(pkg.modules)].sort();
  const assets = [];
  const scan = path => {
    for (const entry of readdirSync(join(cwd, path), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const name = `${path}/${entry.name}`;
      if (entry.isDirectory()) scan(name);
      else if (entry.isFile()) assets.push({ path: name, sha256: digest(readFileSync(join(cwd, name))) });
      else throw new Error(`unsupported static asset: ${name}`);
    }
  };
  scan('static');
  return {
    schema: 1,
    scope: 'Rendered package modules in the browser app and self-contained rescue page, plus static assets. Build-only packages are excluded. Complete bundler helper notices can cover more than the emitted helper. Game artwork and synthesized sound are original repository assets; system fonts are not distributed.',
    packages: [...packages.values()].sort((a, b) => a.name < b.name ? -1 : 1),
    firstParty: { notice: readFileSync(join(cwd, 'LICENSE'), 'utf8').trim(), modules: [...main.firstPartyModules, ...rescue.firstPartyModules] },
    staticAssets: assets,
    generatedModules: [...new Set([...main.generatedModules, ...rescue.generatedModules])].sort(),
  };
}

export function noticeText(inventory) {
  return `Craft Rush: distribution notices\n\n${inventory.scope}\n\n${inventory.firstParty.notice}\n\n`
    + inventory.packages.map(pkg => `${pkg.name} ${pkg.version} (${pkg.license})\n${pkg.notices.map(notice => `${notice.path}\n\n${notice.text}`).join('\n\n')}\n`).join('\n' + '='.repeat(72) + '\n\n');
}

export const rescueBuildInputs = ['src/rescue.template.html', 'tools/build-rescue.mjs',
  'tools/license-inventory.mjs', 'package.json', 'package-lock.json'];

export function assertRescueCurrent(rescue, cwd = process.cwd()) {
  assert.equal(digest(readFileSync(join(cwd, 'static/rescue.html'))), rescue.sha256,
    'rescue inventory must describe the generated page being shipped');
  assert.equal(rescue.node, process.version, 'rescue must be generated with the current Node runtime');
  for (const path of [...rescueBuildInputs, ...rescue.inventory.firstPartyModules.map(module => module.path)]) {
    assert.equal(rescue.inputs?.[path], digest(readFileSync(join(cwd, path))),
      `rescue input changed; run the prebuild: ${path}`);
  }
}

export function licensePlugin(release) {
  let client = false;
  return {
    name: 'craftrush-release-notices',
    configResolved(config) { client = !config.build.ssr && /[/\\]output[/\\]client$/.test(config.build.outDir); },
    generateBundle(_options, bundle) {
      if (!client) return;
      const ids = Object.values(bundle).flatMap(item => item.type === 'chunk'
        ? Object.entries(item.modules).filter(([, module]) => module.renderedLength > 0).map(([id]) => id) : []);
      const rescue = JSON.parse(readFileSync('.svelte-kit/rescue-inventory.json', 'utf8'));
      assertRescueCurrent(rescue);
      const inventory = mergedInventory(inventoryForModules(ids), rescue.inventory);
      for (const name of ['svelte', 'qrcode']) assert.ok(inventory.packages.some(pkg => pkg.name === name), `missing expected runtime ${name}`);
      for (const [fileName, source] of [
        ['licenses.json', JSON.stringify(inventory, null, 2) + '\n'],
        ['third-party-notices.txt', noticeText(inventory)],
        ['release.json', JSON.stringify(release, null, 2) + '\n'],
      ]) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}
