import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import Module from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export function loadTs(absPath, cache = new Map()) {
  if (cache.has(absPath)) return cache.get(absPath).exports;
  const src = readFileSync(absPath, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const m = { exports: {} };
  cache.set(absPath, m);
  const req = (spec) => {
    let resolved = spec;
    if (spec.startsWith('@/')) {
      resolved = path.join(rootDir, spec.slice(2));
    } else if (spec.startsWith('./') || spec.startsWith('../')) {
      resolved = path.resolve(path.dirname(absPath), spec);
    } else {
      return Module.createRequire(absPath)(spec);
    }
    if (!/\.[tj]sx?$/.test(resolved)) resolved += '.ts';
    return loadTs(resolved, cache);
  };
  new Function('exports', 'require', 'module', '__dirname', '__filename', js)(
    m.exports, req, m, path.dirname(absPath), absPath
  );
  return m.exports;
}
