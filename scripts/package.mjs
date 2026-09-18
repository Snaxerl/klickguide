import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeZip } from '../dist/core/zip.js';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'dist');
const release = path.join(root, 'release');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw new Error('A three-part release version is required.');
async function collect(directory, prefix = '') {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const filename = path.join(directory, entry.name);
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory())
      files.push(...await collect(filename, `${relative}/`));
    else if (entry.isFile())
      files.push({ name: relative, data: new Uint8Array(await readFile(filename)) });
    else
      throw new Error(`Symlinks and special files are not allowed in a release: ${filename}`);
  }
  return files;
}
const entries = await collect(output);
if (!entries.some((entry) => entry.name === 'manifest.json'))
  throw new Error('Build the extension before packaging.');
const archive = makeZip(entries);
const filename = `klickguide-${version}-chrome.zip`;
const checksum = createHash('sha256').update(archive).digest('hex');
await mkdir(release, { recursive: true });
await writeFile(path.join(release, filename), archive);
await writeFile(path.join(release, `${filename}.sha256`), `${checksum}  ${filename}\n`);
console.log(`Created release/${filename} (${archive.byteLength} bytes)`);
console.log(`SHA-256 ${checksum}`);
