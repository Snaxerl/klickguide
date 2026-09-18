import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const files = (await readdir(new URL('../tests/unit/', import.meta.url)))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => `tests/unit/${name}`);
if (!files.length)
  throw new Error('No test files were found.');
const argumentsForNode = ['--experimental-test-module-mocks'];
if (process.argv.includes('--coverage'))
  argumentsForNode.push('--experimental-test-coverage');
argumentsForNode.push('--test', ...files);
const result = spawnSync(process.execPath, argumentsForNode, { cwd: root, stdio: 'inherit' });
if (result.error)
  throw result.error;
process.exit(result.status ?? 1);
