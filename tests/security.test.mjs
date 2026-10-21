import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('browser bundle contains only a publishable Supabase key', async () => {
  const source = await read('supabase-data.js');
  assert.match(source, /sb_publishable_/);
  assert.doesNotMatch(source, /service_role|sb_secret_/);
});

test('editor is gated by the owner session and hidden URL flag', async () => {
  const boot = await read('editor-boot.js');
  assert.match(boot, /get\('edit'\) !== '1'/);
  assert.match(boot, /getOwnerSession/);
  assert.match(boot, /session\?\.isOwner/);
});

test('static frontend no longer depends on the Sites API', async () => {
  const sources = await Promise.all(['script.js', 'content-editor.js', 'editor-boot.js'].map(read));
  const combined = sources.join('\n');
  assert.doesNotMatch(combined, /\/api\/(?:charter|session)/);
  assert.match(combined, /PortiaSupabase\.saveCharter/);
});

test('migration enables RLS, owner-only updates and realtime', async () => {
  const migration = await read('supabase/migrations/20261021190000_create_charter_editor.sql');
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /auth\.jwt\(\).*qloxzick@gmail\.com/is);
  assert.match(migration, /security invoker/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /supabase_realtime add table public\.charter_state/i);
});

test('checked-in charter keeps the latest rules from d5b0d8d', async () => {
  const page2 = await read('sections/page2.html');
  const page6 = await read('sections/page6.html');

  assert.match(page2, /Аналитики и лидеры могут выступать в качестве сопровождающих\./);
  assert.match(page2, /1-2 БИО - 1 сопр \| 3 БИО - 2 сопр \| 4> БИО - 3 сопр\./);
  assert.match(page6, /17\.10\.26/);
});

test('checked-in theme exposes every incumbent semantic style family', async () => {
  const css = await read('styles.css');
  const requiredClasses = [
    'brand-green', 'green-title', 'highlight-brand', 'highlight-green',
    'highlight-orange', 'highlight-purple', 'highlight-red', 'rank-lrs',
    'rank-jmrs', 'rank-mrs', 'rank-jhrs', 'rank-hrs', 'rank-prfs',
    'rank-ldrs', 'tooltip', 'tooltip-box', 'tooltip-box-large', 'doc-link',
    'qualification-list', 'content-block', 'content-list', 'sub-list',
    'block-title', 'block-text', 'leadership-grid', 'leadership-card'
  ];

  for (const className of requiredClasses) {
    assert.match(css, new RegExp(`\\.${className}(?:[\\s,{.:#>]|$)`), `missing .${className}`);
  }
});
