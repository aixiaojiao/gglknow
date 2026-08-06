import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Load the repo's browser-global scripts and hand back the classes they declare.
 *
 * tweet-browser.js, tweet-metadata-manager.js and ai-tag-engine.js are plain
 * <script> payloads — they declare classes and never export them, so they
 * cannot be imported. Evaluating them together inside one function scope
 * reproduces how the browser loads them.
 */
export function loadGlobalScripts<T>(files: string[], returnExpression: string): T {
  const sources = files.map(file => fs.readFileSync(path.join(repoRoot, file), 'utf8'));
  return new Function(`${sources.join('\n;\n')}\n; return ${returnExpression};`)() as T;
}
