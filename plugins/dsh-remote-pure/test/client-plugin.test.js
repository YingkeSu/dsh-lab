import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Load client.js the way the Web module loader does and capture registrations. */
function loadClientPlugin() {
  let loaded;
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) { loaded = entry; },
    },
  };
  const react = { createElement: () => null, Fragment: null, useState: () => [undefined, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) };
  const factory = (require) => require('react') === react ? react : undefined;
  // Re-run the real factory with a require table that only exposes react.
  const module = { exports: {} };
  globalThis.window.__ModuleLoader__.load = (entry) => {
    entry.factory((name) => {
      if (name === 'react') return react;
      throw new Error(`unexpected external: ${name}`);
    });
    loaded = entry;
    return module.exports;
  };
  // client.js assigns to window directly; import it after the loader hook exists.
  return { entry: null, react };
}

test('client plugin registers a sidebar entry and its main panel', async () => {
  const registrations = [];
  const injections = [];
  const react = { createElement: () => null, Fragment: null, useState: () => [undefined, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) };
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        assert.equal(entry.id, 'dsh-remote-pure');
        globalThis.__clientModule = entry.factory((name) => {
          if (name === 'react') return react;
          throw new Error(`unexpected external: ${name}`);
        });
      },
    },
  };
  await import('../client.js');
  const mod = globalThis.__clientModule;
  assert.equal(mod.name, 'dsh-remote-pure');
  assert.deepEqual(mod.inject, ['slots']);
  const ctx = {
    slots: {
      inject(key, callback) { injections.push(key); callback(); return () => {}; },
      register(options) { registrations.push(options); return () => {}; },
    },
  };
  mod.apply(ctx);
  assert.deepEqual(injections, ['sidebar.panellist', 'main']);
  assert.deepEqual(registrations.map((row) => [row.name, row.id ?? row.key]), [
    ['sidebar.panellist', 'remote-pure'],
    ['main', 'remote-pure'],
  ]);
});
