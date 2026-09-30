import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('./DeviceManagementPanel.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', js)(
  (name) => name === '@/lib/supabase/client'
    ? { createClient: () => { throw new Error('Unexpected database access'); } }
    : require(name), module, module.exports,
);
const Panel = module.exports.default;

test('app info disclosure and build links are available only to admins', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test' });
  const saved = Object.fromEntries(['window', 'document', 'fetch', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, globalThis[key]]));
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ device: null, commands: [] }) });
  const container = document.getElementById('root');
  const root = createRoot(container);
  const render = isAdmin => act(async () => root.render(React.createElement(Panel, { customerId: 'fixture', isAdmin, isLocked: false })));
  const button = text => [...container.querySelectorAll('button')].find(node => node.textContent.includes(text));
  try {
    await render(false);
    await act(async () => button('Device & App Lock').click());
    assert.equal(button('App info & history'), undefined);
    assert.equal(container.querySelector('a[href*="expo.dev"]'), null);

    await render(true);
    assert.equal(button('App info & history').getAttribute('aria-expanded'), 'false');
    await act(async () => button('App info & history').click());
    assert.equal(button('App info & history').getAttribute('aria-expanded'), 'true');
    assert.ok(document.getElementById(button('App info & history').getAttribute('aria-controls')));
    const links = [...container.querySelectorAll('a[href*="expo.dev"]')];
    assert.equal(links.length, 2);
    assert.ok(links[0].href.endsWith('/c3031e96-4ca3-4159-95a5-d58facb1519e'));
    assert.ok(links[1].href.endsWith('/81e19605-161d-4beb-8422-04ab160cc3a3'));
    assert.ok(links.every(link => link.target === '_blank' && link.rel.includes('noopener')));
    assert.match(container.textContent, /has not registered on this phone yet/);

    await render(false);
    assert.equal(button('App info & history'), undefined);
    assert.equal(container.querySelector('a[href*="expo.dev"]'), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
