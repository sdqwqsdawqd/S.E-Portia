(() => {
  const names = ['highlight-green','highlight-red','highlight-orange','highlight-brand','brand-green','rank-lrs','rank-jmrs','rank-mrs','rank-jhrs','rank-hrs','rank-prfs','rank-ldrs'];
  const properties = {color:'color', backgroundColor:'background-color', fontWeight:'font-weight'};
  function apply(serialized, scope = '#right-page-content', id = 'charter-theme') {
    let styles = {};
    try { styles = JSON.parse(serialized || '{}'); } catch {}
    let sheet = document.getElementById(id);
    if (!sheet) { sheet = document.createElement('style'); sheet.id = id; document.head.append(sheet); }
    sheet.textContent = names.map(name => {
      const values = styles?.[name] || {};
      const declarations = Object.entries(properties).flatMap(([key, css]) => {
        const value = values[key];
        const valid = key === 'fontWeight' ? /^[1-9]00$/.test(value) : /^(#[0-9a-f]{6}|transparent)$/i.test(value);
        return valid ? [css + ':' + value] : [];
      });
      return scope + ' .' + name + '{' + declarations.join(';') + '}';
    }).join('\n');
  }
  window.PortiaTheme = {names, apply};
})();

