(async () => {
  if (new URLSearchParams(location.search).get('edit') !== '1') return;
  const session = await window.PortiaSupabase?.getOwnerSession();
  if (!session?.isOwner) return;
  await window.PortiaCharter.ready;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'content-editor.css?v=5';
  document.head.append(css);
  const { mountEditor } = await import('./content-editor.js?v=5');
  await mountEditor(window.PortiaCharter);
})().catch((error) => console.error('Editor boot failed', error));
