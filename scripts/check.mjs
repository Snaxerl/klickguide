import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'dist');
const json = async (name) => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const [manifest, packageInfo, tsconfig] = await Promise.all([
  json('dist/manifest.json'), json('package.json'), json('tsconfig.json'),
]);
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, packageInfo.version);
const lockfile = await json('package-lock.json');
assert.equal(lockfile.version, packageInfo.version);
assert.equal(lockfile.packages[''].version, packageInfo.version);
assert.equal((await import('../dist/core/model.js')).APP_VERSION, packageInfo.version);
assert.equal(await readFile(path.join(root, 'LICENSE'), 'utf8'), await readFile(path.join(output, 'LICENSE.txt'), 'utf8'));
assert.equal(manifest.background.type, 'module');
assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting', 'storage'].sort());
assert.deepEqual(manifest.host_permissions, ['<all_urls>'], 'Persistent screenshots need the declared all-sites host permission.');
for (const key of ['optional_host_permissions', 'content_scripts', 'externally_connectable', 'web_accessible_resources']) {
  assert.equal(manifest[key], undefined, `Unexpected manifest capability: ${key}`);
}
assert.equal(manifest.incognito, 'not_allowed');
assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
assert.doesNotMatch(manifest.content_security_policy.extension_pages, /unsafe-eval|unsafe-inline/);
for (const flag of ['strict', 'noUncheckedIndexedAccess', 'exactOptionalPropertyTypes', 'noUnusedLocals', 'noUnusedParameters']) {
  assert.equal(tsconfig.compilerOptions[flag], true, `Required TypeScript flag missing: ${flag}`);
}
assert.deepEqual(packageInfo.dependencies ?? {}, {}, 'Runtime dependencies need an explicit architectural review.');
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...await walk(filename));
    else if (entry.isFile())
      files.push(filename);
    else
      throw new Error(`Unexpected file type: ${filename}`);
  }
  return files;
}
const builtFiles = await walk(output);
const fileSet = new Set(builtFiles);
for (const filename of builtFiles) {
  if (!/\.(js|css|html|json)$/.test(filename))
    continue;
  const content = await readFile(filename, 'utf8');
  assert(content.endsWith('\n'), `Missing trailing newline: ${filename}`);
  if (filename.endsWith('.js')) {
    assert.doesNotMatch(content, /\b(?:eval|fetch)\s*\(|\bnew\s+(?:Function|WebSocket|XMLHttpRequest)\s*\(|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|sendBeacon\s*\(/, `Forbidden runtime sink in ${filename}`);
    for (const match of content.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      assert(specifier.startsWith('.'), `Nonlocal module import: ${filename}: ${specifier}`);
      assert(fileSet.has(path.resolve(path.dirname(filename), specifier)), `Missing module: ${filename}: ${specifier}`);
    }
  }
  if (filename.endsWith('.html')) {
    for (const match of content.matchAll(/(?:src|href)="([^"#?]+)(?:[^\"]*)"/g)) {
      assert(!/^(?:https?:)?\/\//.test(match[1]), `External asset in ${filename}`);
      assert(fileSet.has(path.resolve(path.dirname(filename), match[1])), `Missing HTML asset: ${filename}: ${match[1]}`);
    }
    assert.doesNotMatch(content, /<script(?![^>]*\bsrc=)[^>]*>/i, `Inline script in ${filename}`);
  }
}
const contentScript = await readFile(path.join(output, 'recorder/content.js'), 'utf8');
assert.doesNotMatch(contentScript, /^\s*(?:import|export)\b/m, 'Injected content script must remain a classic, self-contained script.');
const syntaxTree = ts.createSourceFile('content.js', contentScript, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
let recorderVersion;
function inspectRecorder(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'version' && node.initializer && ts.isStringLiteral(node.initializer)) {
    recorderVersion = node.initializer.text;
  }
  if (ts.isPropertyAccessExpression(node) && ['value', 'placeholder'].includes(node.name.text)) {
    // The recorder has no legitimate need to read an input value or placeholder.
    assert.fail(`Unexpected value access in the recorder; review for privacy risks: ${node.getText(syntaxTree)}`);
  }
  ts.forEachChild(node, inspectRecorder);
}
inspectRecorder(syntaxTree);
assert.equal(recorderVersion, packageInfo.version, 'The idempotent content-script version must match the release.');
for (const [size, relative] of Object.entries(manifest.icons)) {
  const icon = await readFile(path.join(output, relative));
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(icon.readUInt32BE(16), Number(size));
  assert.equal(icon.readUInt32BE(20), Number(size));
}
for (const entry of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page.split('#')[0]]) {
  assert((await stat(path.join(output, entry))).isFile(), `Missing extension entry: ${entry}`);
}
console.log(`Static release checks passed: ${builtFiles.length} files, declared all-sites access, local imports, strict types, no network sinks.`);
