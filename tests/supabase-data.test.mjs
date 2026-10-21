import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../supabase-data.js', import.meta.url), 'utf8');

function loadAdapter(remoteRow) {
  const query = {
    select() { return this; },
    eq() { return this; },
    async single() { return { data: remoteRow, error: null }; },
  };
  const client = {
    from() { return query; },
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  };
  const window = {
    supabase: { createClient: () => client },
    location: { href: 'https://example.test/' },
  };
  vm.runInNewContext(source, { window, console, URL });
  return window.PortiaSupabase;
}

test('loadCharter merges a partial remote document over every baseline page', async () => {
  const adapter = loadAdapter({
    content: { page2: '<p>remote two</p>' },
    revision: 7,
    updated_at: '2026-10-21T00:00:00Z',
  });
  const baseline = {
    page1: '<p>baseline one</p>',
    page2: '<p>baseline two</p>',
    page3: '<p>baseline three</p>',
  };

  const loaded = await adapter.loadCharter(baseline);

  assert.deepEqual(JSON.parse(JSON.stringify(loaded.content)), {
    page1: '<p>baseline one</p>',
    page2: '<p>remote two</p>',
    page3: '<p>baseline three</p>',
  });
  assert.equal(loaded.revision, 7);
});
