(() => {
  const names = [
    'brand-green', 'green-title',
    'highlight-brand', 'highlight-green', 'highlight-orange', 'highlight-purple', 'highlight-red',
    'rank-lrs', 'rank-jmrs', 'rank-mrs', 'rank-jhrs', 'rank-hrs', 'rank-prfs', 'rank-ldrs',
    'tooltip', 'tooltip-box', 'tooltip-box-large', 'doc-link', 'qualification-list',
    'content-block', 'content-list', 'sub-list', 'block-title', 'block-text',
    'leadership-grid', 'leadership-card'
  ];
  const properties = {
    color:'color', backgroundColor:'background-color', fontWeight:'font-weight',
    fontStyle:'font-style', textDecoration:'text-decoration', fontSize:'font-size', textAlign:'text-align'
  };
  function apply(serialized, scope = '#right-page-content', id = 'charter-theme') {
    let styles = {};
    try { styles = JSON.parse(serialized || '{}'); } catch {}
    let sheet = document.getElementById(id);
    if (!sheet) { sheet = document.createElement('style'); sheet.id = id; document.head.append(sheet); }
    sheet.textContent = names.map(name => {
      const values = styles?.[name] || {};
      const declarations = Object.entries(properties).flatMap(([key, css]) => {
        const value = values[key];
        const valid = key === 'fontWeight' ? /^[1-9]00$/.test(value)
          : ['color','backgroundColor'].includes(key) ? /^(#[0-9a-f]{6}(?:[0-9a-f]{2})?|transparent)$/i.test(value)
          : key === 'fontSize' ? /^\d+(?:\.\d+)?(?:px|rem|em|%)$/.test(value)
          : key === 'textAlign' ? /^(left|center|right|justify)$/.test(value)
          : key === 'fontStyle' ? /^(normal|italic)$/.test(value)
          : /^(none|underline|line-through)$/.test(value);
        return valid ? [css + ':' + value] : [];
      });
      return scope + ' .' + name + '{' + declarations.join(';') + '}';
    }).join('\n');
  }
  window.PortiaTheme = {names, apply};
})();
