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
