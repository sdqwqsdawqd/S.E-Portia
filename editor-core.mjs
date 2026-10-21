// Text offsets survive span splitting and let selections cover different sections.
export function mergeRanges(ranges) {
  const sorted = ranges.filter(r => r.end > r.start).map(r => ({...r})).sort((a,b) => a.start-b.start);
  return sorted.reduce((out, r) => {
    const last = out.at(-1);
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push(r);
    return out;
  }, []);
}
export function textNodes(root) {
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  const out = []; let node; let start = 0;
  while ((node = walker.nextNode())) {
    out.push({node, start, end:start+node.length});
    start += node.length;
  }
  return out;
}
export function offsetRange(root, range) {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer) || range.collapsed) return null;
  const prefix = root.ownerDocument.createRange();
  prefix.selectNodeContents(root); prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length;
  return {start, end:start+range.toString().length};
}
export function domRange(root, offsets) {
  const nodes = textNodes(root);
  const start = nodes.find(n => n.end > offsets.start);
  const end = nodes.find(n => n.end >= offsets.end);
  if (!start || !end) return null;
  const range = root.ownerDocument.createRange();
  range.setStart(start.node, offsets.start-start.start);
  range.setEnd(end.node, offsets.end-end.start);
  return range;
}
export function wordAt(root, node, offset) {
  if (node?.nodeType !== 3 || !root.contains(node)) return null;
  const text = node.data;
  let start = Math.min(offset,text.length), end = start;
  const isWord = c => c && /[\p{L}\p{N}_-]/u.test(c);
  while (start > 0 && isWord(text[start-1])) start--;
  while (end < text.length && isWord(text[end])) end++;
  const base = textNodes(root).find(n => n.node === node)?.start ?? 0;
  return end > start ? {start:base+start,end:base+end} : null;
}
export function formatRanges(root, ranges, style, className = '') {
  // Operate on individual text nodes so lists, headings and links keep their structure.
  const portions = [];
  for (const entry of textNodes(root)) {
    for (const range of mergeRanges(ranges)) {
      const start = Math.max(entry.start,range.start), end = Math.min(entry.end,range.end);
      if (start < end) portions.push({node:entry.node,start:start-entry.start,end:end-entry.start});
    }
  }
  for (const portion of portions.reverse()) {
    let node = portion.node;
    if (portion.end < node.length) node.splitText(portion.end);
    if (portion.start > 0) node = node.splitText(portion.start);
    // Split inline ancestors around this fragment. Otherwise changing the background
    // of a word inside an existing highlight leaves the old colour underneath it.
    let selected = node;
    while (selected.parentElement && selected.parentElement !== root &&
      /^(SPAN|B|STRONG|I|EM|U|S|FONT|A|MARK|SMALL|SUB|SUP)$/.test(selected.parentElement.tagName)) {
      const parent = selected.parentElement;
      const before = parent.cloneNode(false), after = parent.cloneNode(false);
      while (parent.firstChild !== selected) before.append(parent.firstChild);
      while (selected.nextSibling) after.append(selected.nextSibling);
      if (before.hasChildNodes()) parent.before(before);
      if (after.hasChildNodes()) parent.after(after);
      if ('backgroundColor' in style) {
        parent.style.backgroundColor='transparent';
        parent.style.backgroundImage='none';
      }
      if (className) {
        [...parent.classList].filter(name => /^(highlight-|brand-green$|rank-)/.test(name)).forEach(name => parent.classList.remove(name));
        ['color','background-color','font-weight'].forEach(property => parent.style.removeProperty(property));
      }
      selected = parent;
    }
    const span = root.ownerDocument.createElement('span');
    if (className) span.className = className;
    Object.assign(span.style,style);
    node.replaceWith(span); span.append(node);
  }
}
export class History {
  constructor(limit=100) { this.limit=limit; this.entries=[]; this.index=-1; }
  reset(snapshot) { this.entries=[structuredClone(snapshot)]; this.index=0; }
  push(snapshot) {
    if (JSON.stringify(this.entries[this.index]?.content) === JSON.stringify(snapshot.content)) return;
    this.entries.splice(this.index+1); this.entries.push(structuredClone(snapshot));
    if (this.entries.length > this.limit) this.entries.shift();
    this.index=this.entries.length-1;
  }
  undo() { return this.index>0 ? structuredClone(this.entries[--this.index]) : null; }
  redo() { return this.index<this.entries.length-1 ? structuredClone(this.entries[++this.index]) : null; }
}

export class BlockSelection {
  constructor() { this.ids = new Set(); }
  toggle(id, additive = false) {
    if (!additive) this.ids.clear();
    if (additive && this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
    return this.values();
  }
  clear() { this.ids.clear(); }
  has(id) { return this.ids.has(id); }
  values() { return [...this.ids]; }
}

export function normalizeMediaUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); }
  catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let id = '';
  if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
    else if (/^\/(?:shorts|embed)\//.test(url.pathname)) id = url.pathname.split('/')[2] || '';
  }
  if (/^[\w-]{6,20}$/.test(id)) {
    return { kind: 'embed', provider: 'youtube', url: `https://www.youtube-nocookie.com/embed/${id}` };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = url.pathname.match(/(?:video\/)?(\d+)/);
    if (match) return { kind: 'embed', provider: 'vimeo', url: `https://player.vimeo.com/video/${match[1]}` };
  }

  if (host === 'rutube.ru') {
    const match = url.pathname.match(/\/(?:video|play\/embed)\/([a-f\d]{16,64})/i);
    if (match) return { kind: 'embed', provider: 'rutube', url: `https://rutube.ru/play/embed/${match[1]}` };
  }

  if (/\.(?:mp4|webm)(?:$|\?)/i.test(url.href)) {
    return { kind: 'video', provider: null, url: url.href };
  }
  if (/\.(?:avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(url.href)) {
    return { kind: 'image', provider: null, url: url.href };
  }
  return { kind: 'link', provider: null, url: url.href };
}

const SAFE_STYLE_PROPERTIES = new Set([
  'background-color', 'border', 'border-color', 'border-style', 'border-width',
  'color', 'font-size', 'font-style', 'font-weight', 'height', 'letter-spacing',
  'line-height', 'max-height', 'max-width', 'min-height', 'min-width',
  'text-align', 'text-decoration', 'width',
]);

export function sanitizeInlineStyle(value) {
  return String(value || '').split(';').map(part => part.trim()).filter(Boolean).flatMap(part => {
    const separator = part.indexOf(':');
    if (separator < 1) return [];
    const property = part.slice(0, separator).trim().toLowerCase();
    const styleValue = part.slice(separator + 1).trim();
    if (!SAFE_STYLE_PROPERTIES.has(property) || /url\s*\(|expression|javascript:/i.test(styleValue)) return [];
    return [`${property}:${styleValue}`];
  }).join(';');
}

export function isSafeResourceUrl(value) {
  const url = String(value || '').trim();
  if (!url || /[\\\u0000-\u001f\u007f]/.test(url) || url.startsWith('//')) return false;
  if (/^(?:https?:|\/|\.\/|\.\.\/|#)/i.test(url)) return true;
  return !/^[a-z][a-z\d+.-]*:/i.test(url);
}

function fallbackSanitize(html) {
  let clean = html
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select)\b[^>]*\/?\s*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src)\s*=\s*(["'])\s*(?:javascript|data:text\/html)[\s\S]*?\2/gi, '');
  clean = clean.replace(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_all, quote, style) => {
    const safe = sanitizeInlineStyle(style);
    return safe ? ` style=${quote}${safe}${quote}` : '';
  });
  return clean;
}

export function sanitizeHtml(value, documentRef = globalThis.document) {
  const html = String(value || '');
  if (!documentRef?.createElement) return fallbackSanitize(html);

  const template = documentRef.createElement('template');
  template.innerHTML = html;
  const blocked = new Set(['SCRIPT', 'STYLE', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT']);
  const allowedAttributes = new Set([
    'alt', 'class', 'controls', 'href', 'loading', 'poster', 'preload', 'rel',
    'src', 'style', 'target', 'title', 'allow', 'allowfullscreen', 'referrerpolicy',
  ]);

  for (const element of [...template.content.querySelectorAll('*')]) {
    if (blocked.has(element.tagName)) {
      element.remove();
      continue;
    }
    if (element.tagName === 'IFRAME') {
      const media = normalizeMediaUrl(element.getAttribute('src'));
      if (media?.kind !== 'embed' || media.url !== element.getAttribute('src')) {
        element.remove();
        continue;
      }
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (!allowedAttributes.has(name) && !name.startsWith('data-')) element.removeAttribute(attribute.name);
    }
    for (const name of ['href', 'src', 'poster']) {
      const attribute = element.getAttribute(name);
      if (attribute && !isSafeResourceUrl(attribute)) element.removeAttribute(name);
    }
    if (element.hasAttribute('style')) {
      const style = sanitizeInlineStyle(element.getAttribute('style'));
      if (style) element.setAttribute('style', style);
      else element.removeAttribute('style');
    }
    if (element.tagName === 'A' && element.getAttribute('target') === '_blank') {
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }
  return template.innerHTML;
}
