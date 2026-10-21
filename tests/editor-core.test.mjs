import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../editor-core.mjs';

test('editor core exposes block selection and safe media helpers', () => {
  assert.equal(typeof core.BlockSelection, 'function');
  assert.equal(typeof core.normalizeMediaUrl, 'function');
  assert.equal(typeof core.sanitizeHtml, 'function');
});

test('history restores exact snapshots after undo and redo', () => {
  const history = new core.History(10);
  history.reset({ content: { page1: '<p>one</p>' } });
  history.push({ content: { page1: '<p>two</p>' } });

  assert.deepEqual(history.undo(), { content: { page1: '<p>one</p>' } });
  assert.deepEqual(history.redo(), { content: { page1: '<p>two</p>' } });
});

test('Ctrl-click toggles blocks while a normal click starts a new selection', () => {
  const selection = new core.BlockSelection();

  selection.toggle('page1:block-a', false);
  selection.toggle('page2:block-b', true);
  assert.deepEqual(selection.values(), ['page1:block-a', 'page2:block-b']);

  selection.toggle('page1:block-a', true);
  assert.deepEqual(selection.values(), ['page2:block-b']);

  selection.toggle('page3:block-c', false);
  assert.deepEqual(selection.values(), ['page3:block-c']);
});

test('known video providers become safe embeds and unknown HTTPS URLs remain links', () => {
  assert.deepEqual(core.normalizeMediaUrl('https://youtu.be/dQw4w9WgXcQ?t=3'), {
    kind: 'embed',
    provider: 'youtube',
    url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  });
  assert.deepEqual(core.normalizeMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), {
    kind: 'embed',
    provider: 'youtube',
    url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  });
  assert.deepEqual(core.normalizeMediaUrl('https://vimeo.com/123456'), {
    kind: 'embed',
    provider: 'vimeo',
    url: 'https://player.vimeo.com/video/123456',
  });
  assert.deepEqual(core.normalizeMediaUrl('https://example.com/video'), {
    kind: 'link',
    provider: null,
    url: 'https://example.com/video',
  });
  assert.equal(core.normalizeMediaUrl('javascript:alert(1)'), null);
});

test('sanitizer removes executable markup while preserving ordinary formatting', () => {
  const dirty = '<p onclick="steal()"><strong>Текст</strong><script>alert(1)</script>' +
    '<a href="javascript:alert(1)">ссылка</a><iframe src="https://evil.test"></iframe>' +
    '<span style="color:#fff;position:fixed;background-color:#123456">цвет</span></p>';

  const clean = core.sanitizeHtml(dirty);

  assert.match(clean, /<strong>Текст<\/strong>/);
  assert.match(clean, /color:\s*#fff/i);
  assert.match(clean, /background-color:\s*#123456/i);
  assert.doesNotMatch(clean, /script|iframe|onclick|javascript:|position\s*:/i);
});
