import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('..', import.meta.url));
const checkOnly = process.argv.includes('--check');
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const formatting = {
  indentSize: 2,
  tabSize: 2,
  newLineCharacter: '\n',
  convertTabsToSpaces: true,
  insertSpaceAfterCommaDelimiter: true,
  insertSpaceAfterSemicolonInForStatements: true,
  insertSpaceBeforeAndAfterBinaryOperators: true,
  insertSpaceAfterKeywordsInControlFlowStatements: true,
  insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
  placeOpenBraceOnNewLineForFunctions: false,
  placeOpenBraceOnNewLineForControlBlocks: false,
  semicolons: ts.SemicolonPreference.Insert,
};
async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...await collect(filename));
    else if (/\.(?:ts|mjs)$/.test(entry.name))
      files.push(filename);
  }
  return files;
}
function formatFile(filename, contents) {
  const kind = filename.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(filename, contents, ts.ScriptTarget.ES2022, true, kind);
  const printed = printer.printFile(source);
  const host = {
    getScriptFileNames: () => [filename],
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) => name === filename ? ts.ScriptSnapshot.fromString(printed) : undefined,
    getCurrentDirectory: () => root,
    getCompilationSettings: () => ({ target: ts.ScriptTarget.ES2022, allowJs: true }),
    getDefaultLibFileName: () => 'lib.d.ts',
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
  };
  const service = ts.createLanguageService(host);
  try {
    const edits = service.getFormattingEditsForDocument(filename, formatting).sort((a, b) => b.span.start - a.span.start);
    let result = printed;
    for (const edit of edits)
      result = result.slice(0, edit.span.start) + edit.newText + result.slice(edit.span.start + edit.span.length);
    return `${result.trimEnd()}\n`;
  }
  finally {
    service.dispose();
  }
}
const files = (await Promise.all(['src', 'scripts', 'tests/unit'].map((name) => collect(path.join(root, name))))).flat().sort();
let changed = 0;
for (const filename of files) {
  const contents = await readFile(filename, 'utf8');
  let formatted = contents;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = formatFile(filename, formatted);
    if (next === formatted)
      break;
    formatted = next;
  }
  if (formatFile(filename, formatted) !== formatted)
    throw new Error(`Formatter did not converge: ${filename}`);
  if (contents !== formatted) {
    changed += 1;
    if (checkOnly)
      console.error(`Formatting required: ${path.relative(root, filename)}`);
    else
      await writeFile(filename, formatted);
  }
}
if (checkOnly && changed)
  process.exitCode = 1;
else
  console.log(checkOnly ? `Formatting checked: ${files.length} files.` : `Formatted ${changed} of ${files.length} source files.`);
