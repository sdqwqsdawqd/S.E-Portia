import {mergeRanges,textNodes,offsetRange,domRange,wordAt,formatRanges,History} from './editor-core.mjs';

export async function mountEditor(api) {
  if (!api) return;
  const history = new History();
  const state = {content:{}, revision:0, active:'page1', dirty:false, saving:false, sourceMode:false, ranges:{}, addNext:false};
  let saved = '', inputTimer, gesture = null, composing = false;
  const dialog = document.createElement('dialog');
  dialog.className='charter-editor-dialog';
  dialog.setAttribute('aria-labelledby','editor-title');
  dialog.innerHTML=`
    <div class="charter-editor-shell">
      <header class="charter-editor-header">
        <div><span class="charter-editor-kicker">PORTIA / УПРАВЛЕНИЕ СОДЕРЖИМЫМ</span><h1 id="editor-title">Редактор устава</h1><p>Выделяйте текст. Удерживайте Ctrl, чтобы добавлять фрагменты, или Ctrl + ЛКМ — для выбора слова.</p></div>
        <button type="button" class="charter-editor-close" aria-label="Закрыть">×</button>
      </header>
      <nav class="charter-editor-tabs" aria-label="Разделы редактора"></nav>
      <div class="charter-editor-toolbar" aria-label="Форматирование">
        <div class="editor-tools-row">
          <button data-undo title="Ctrl+Z" aria-label="Отменить действие">↶ Отменить</button>
          <button data-redo title="Ctrl+Shift+Z / Ctrl+Y" aria-label="Повторить действие">↷ Повторить</button>
          <span class="tool-divider"></span>
          <button data-style="fontWeight" data-value="700" title="Ctrl+B"><b>Жирный</b></button>
          <button data-style="fontStyle" data-value="italic"><i>Курсив</i></button>
          <button data-style="textDecoration" data-value="underline"><u>Подчеркнуть</u></button>
          <label>Жирность <select data-weight aria-label="Жирность текста"><option value="400">400 · обычная</option><option value="500">500 · средняя</option><option value="600">600 · полужирная</option><option value="700">700 · жирная</option><option value="900">900 · максимальная</option></select></label>
          <button data-clear-format>Сбросить формат</button>
        </div>
        <div class="editor-tools-row">
          <label>Текст <input type="color" data-color value="#1c2422" aria-label="Цвет текста"></label><button data-apply-color>Применить цвет</button>
          <label>Фон <input type="color" data-background value="#fff0a6" aria-label="Цвет фона текста"></label><button data-apply-background>Применить фон</button><button data-no-background>Без фона</button>
          <span class="tool-divider"></span>
          <button data-command="insertUnorderedList">• Список</button><button data-command="insertOrderedList">1. Список</button>
          <button data-link>Ссылка</button><button data-source aria-pressed="false">HTML</button>
        </div>
        <div class="editor-selection-row">
          <strong data-selection-count aria-live="polite">Выделите текст</strong>
          <button data-add aria-pressed="false">+ Добавить выделение</button><button data-all>Весь раздел</button><button data-reset>Снять выделения</button>
        </div>
      </div>
      <div class="editor-main">
        <div class="charter-editor-workspace">
          <div class="charter-editor-canvas" contenteditable="true" role="textbox" aria-label="Содержимое раздела" aria-multiline="true" spellcheck="true"></div>
          <textarea class="charter-editor-source" aria-label="HTML раздела" spellcheck="false" hidden></textarea>
        </div>
        <aside class="editor-style-panel">
          <span class="charter-editor-kicker">СТИЛИ УСТАВА</span><h2>Готовое оформление</h2>
          <p>Применяйте к выбранным фрагментам или меняйте все использования стиля.</p>
          <label>Стиль<select data-preset aria-label="Стиль устава"></select></label>
          <div class="editor-style-preview"><span data-preview>Пример текста</span></div>
          <button data-preset-apply class="editor-primary">Применить к выделению</button>
          <details><summary>Изменить стиль во всём уставе</summary>
            <p>Изменятся все фрагменты с этим классом, включая другие разделы. Результат увидят все после сохранения.</p>
            <label>Цвет текста<input type="color" data-preset-color aria-label="Цвет текста стиля"></label>
            <label>Цвет фона<input type="color" data-preset-background aria-label="Цвет фона стиля"></label>
            <label class="editor-checkbox"><input type="checkbox" data-preset-transparent>Прозрачный фон</label>
            <label>Жирность<select data-preset-weight aria-label="Жирность стиля"><option>400</option><option>500</option><option>600</option><option>700</option><option>900</option></select></label>
            <button data-preset-update>Обновить стиль везде</button>
          </details>
          <p class="editor-tip">Ctrl + Z — отмена<br>Ctrl + Shift + Z — повтор<br>Ctrl + S — сохранить<br>Фрагменты сохраняются при смене раздела.</p>
        </aside>
      </div>
      <footer class="charter-editor-footer">
        <div><strong class="charter-editor-status" role="status"></strong><span class="charter-editor-time"></span></div>
        <div class="charter-editor-actions"><button data-reload>Обновить из базы</button><button class="charter-editor-save" data-save disabled>Сохранить всё</button></div>
      </footer>
    </div>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const canvas=$('.charter-editor-canvas'), source=$('.charter-editor-source');
  const tabs=$('.charter-editor-tabs'), status=$('.charter-editor-status'), saveButton=$('[data-save]');
  const theme = () => {try {return JSON.parse(state.content.__styles || '{}');} catch {return {};}};
  function canonicalContent(content) {
    return Object.fromEntries(Object.entries(content).map(([key,value])=>{
      if(key==='__styles')return [key,value];
      const holder=document.createElement('div');holder.innerHTML=value;return [key,holder.innerHTML];
    }));
  }
  const setStatus=(text,kind='')=>{status.textContent=text;status.dataset.kind=kind;};
  const commit=()=>{state.content[state.active]=state.sourceMode?source.value:canvas.innerHTML;};
  const snapshot=()=>({content:structuredClone(state.content),active:state.active});
  // Scope every rule to this dialog; draft styles never leak to the reader.
  function draftTheme() { window.PortiaTheme.apply(state.content.__styles,'.charter-editor-canvas','editor-draft-theme'); }
  function updateDirty() {
    state.dirty=JSON.stringify(state.content)!==saved;
    saveButton.disabled=!state.dirty || state.saving;
    $('[data-undo]').disabled=history.index<=0 || state.saving;
    $('[data-redo]').disabled=history.index>=history.entries.length-1 || state.saving;
    setStatus(state.dirty?'Есть несохранённые изменения':'Все изменения сохранены',state.dirty?'dirty':'saved');
  }
  function checkpoint() { clearTimeout(inputTimer);commit();history.push(snapshot());updateDirty(); }
  function recordChange() {commit();history.push(snapshot());updateDirty();}
  function render() {
    canvas.innerHTML=state.content[state.active] || '';
    source.value=state.content[state.active] || '';
    tabs.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.section===state.active);b.setAttribute('aria-current',b.dataset.section===state.active?'page':'false');});
    draftTheme(); paintSelections();
  }
  function showSection(id) {checkpoint();state.active=id;render();}
  function clearSelections() { state.ranges={}; window.getSelection()?.removeAllRanges(); paintSelections(); }
  function paintSelections() {
    const ranges=state.ranges[state.active] || [];
    if (window.CSS?.highlights && window.Highlight) {
      const domRanges=ranges.map(r=>domRange(canvas,r)).filter(Boolean);
      CSS.highlights.set('portia-selection',new Highlight(...domRanges));
    }
    const count=Object.values(state.ranges).reduce((sum,rs)=>sum+rs.length,0);
    $('[data-selection-count]').textContent=count ? 'Выбрано фрагментов: '+count : 'Выделите текст';
    $('[data-add]').setAttribute('aria-pressed',String(state.addNext));
  }
  function selectionOffsets() {
    const selection=window.getSelection();
    return selection?.rangeCount ? offsetRange(canvas,selection.getRangeAt(0)) : null;
  }
  function capture(add=false) {
    const range=selectionOffsets();
    if (!range) return false;
    if (!add) state.ranges={};
    state.ranges[state.active]=mergeRanges([...(state.ranges[state.active]||[]),range]);
    paintSelections(); return true;
  }
  canvas.addEventListener('pointerdown',event=>{
    if (event.button!==0) return;
    checkpoint();
    const additive=event.ctrlKey || event.metaKey || state.addNext;
    if (additive) capture(true);
    else state.ranges={};
    gesture={additive,x:event.clientX,y:event.clientY};
  });
  document.addEventListener('pointerup',event=>{
    if (!gesture) return;
    const {additive,x,y}=gesture;gesture=null;
    const clicked=Math.hypot(event.clientX-x,event.clientY-y)<5;
    if (additive && clicked && canvas.contains(event.target)) {
      const point=document.caretPositionFromPoint?.(event.clientX,event.clientY);
      const fallback=!point && document.caretRangeFromPoint?.(event.clientX,event.clientY);
      const word=wordAt(canvas,point?.offsetNode || fallback?.startContainer,point?.offset ?? fallback?.startOffset ?? 0);
      if(word) state.ranges[state.active]=mergeRanges([...(state.ranges[state.active]||[]),word]);
    } else capture(additive);
    state.addNext=false; paintSelections();
  });
  canvas.addEventListener('keyup',event=>{if(event.shiftKey && event.key.startsWith('Arrow')) capture(false);});
  canvas.addEventListener('compositionstart',()=>{composing=true;});
  canvas.addEventListener('compositionend',()=>{composing=false;checkpoint();});
  function onInput() { state.ranges={};paintSelections();commit();updateDirty();clearTimeout(inputTimer);if(!composing)inputTimer=setTimeout(checkpoint,450); }
  canvas.addEventListener('input',onInput);source.addEventListener('input',onInput);
  canvas.addEventListener('beforeinput',event=>{
    if(event.inputType==='historyUndo' || event.inputType==='historyRedo'){event.preventDefault();travel(event.inputType==='historyUndo'?'undo':'redo');}
  });
  canvas.addEventListener('click',event=>{if(event.target.closest('a'))event.preventDefault();});
  // Keep native text selection while pressing toolbar buttons.
  dialog.querySelectorAll('button').forEach(button=>button.addEventListener('mousedown',event=>event.preventDefault()));
  $('[data-add]').onclick=()=>{capture(true);state.addNext=true;paintSelections();setStatus('Выделите следующий фрагмент — он добавится к выбранным.');};
  $('[data-reset]').onclick=()=>{clearSelections();state.addNext=false;paintSelections();};
  $('[data-all]').onclick=()=>{state.ranges[state.active]=[{start:0,end:canvas.textContent.length}];paintSelections();};
  function format(style,className='') {
    if(state.sourceMode || state.saving)return;
    checkpoint();
    if(!Object.values(state.ranges).some(rs=>rs.length))capture(false);
    if(!Object.values(state.ranges).some(rs=>rs.length)){setStatus('Сначала выделите текст.','warning');return;}
    for(const [id,ranges] of Object.entries(state.ranges)) {
      const root=id===state.active?canvas:document.createElement('div');
      if(id!==state.active)root.innerHTML=state.content[id];
      formatRanges(root,ranges,style,className);
      state.content[id]=root.innerHTML;
    }
    source.value=canvas.innerHTML;recordChange();paintSelections();
  }
  dialog.querySelectorAll('[data-style]').forEach(button=>button.onclick=()=>format({[button.dataset.style]:button.dataset.value}));
  $('[data-weight]').onchange=event=>format({fontWeight:event.target.value});
  $('[data-apply-color]').onclick=()=>format({color:$('[data-color]').value});
  $('[data-apply-background]').onclick=()=>format({backgroundColor:$('[data-background]').value});
  $('[data-no-background]').onclick=()=>format({backgroundColor:'transparent'});
  $('[data-clear-format]').onclick=()=>format({color:'#1c2422',backgroundColor:'transparent',fontWeight:'400',fontStyle:'normal',textDecoration:'none'});
  function travel(direction) {
    if(state.saving)return;
    checkpoint();const entry=history[direction]();if(!entry)return;
    state.content=entry.content;state.active=entry.active;clearSelections();render();loadPreset();updateDirty();
  }
  $('[data-undo]').onclick=()=>travel('undo');$('[data-redo]').onclick=()=>travel('redo');
  function nativeCommand(command,value) {
    if(state.sourceMode)return;
    checkpoint();
    const ranges=state.ranges[state.active] || [];
    const total=Object.values(state.ranges).reduce((n,r)=>n+r.length,0);
    if(total>1){setStatus('Для списков и ссылок выберите один фрагмент. Цвета и жирность работают сразу для всех.','warning');return;}
    if(ranges[0]){const range=domRange(canvas,ranges[0]);if(range){const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}}
    canvas.focus();document.execCommand(command,false,value);clearSelections();recordChange();
  }
  dialog.querySelectorAll('[data-command]').forEach(button=>button.onclick=()=>nativeCommand(button.dataset.command));
  $('[data-link]').onclick=()=>{const url=prompt('Адрес ссылки (https://…)');if(url && /^https?:\/\//i.test(url))nativeCommand('createLink',url);};
  $('[data-source]').onclick=()=>{
    checkpoint();state.sourceMode=!state.sourceMode;clearSelections();
    canvas.hidden=state.sourceMode;source.hidden=!state.sourceMode;
    $('[data-source]').setAttribute('aria-pressed',String(state.sourceMode));render();
  };
  const preset=$('[data-preset]');
  for(const name of window.PortiaTheme.names){const option=document.createElement('option');option.value=name;option.textContent=name;preset.append(option);}
  function rgbHex(color) {
    if(/^#[\da-f]{6}$/i.test(color))return color;
    const values=color.match(/[\d.]+/g);
    const alpha=values?.length===4 ? Number(values[3]) : 1;
    return values?.length>=3 ? '#'+values.slice(0,3).map((v,i)=>Math.round(Number(v)*alpha+[246,243,234][i]*(1-alpha)).toString(16).padStart(2,'0')).join('') : '#1c2422';
  }
  function presetValues() {
    const probe=document.createElement('span');probe.className=preset.value;probe.textContent='Текст';canvas.append(probe);
    const computed=getComputedStyle(probe);
    const values={color:rgbHex(computed.color),backgroundColor:computed.backgroundColor==='rgba(0, 0, 0, 0)'?'transparent':rgbHex(computed.backgroundColor),fontWeight:computed.fontWeight};
    probe.remove();return {...values,...theme()[preset.value]};
  }
  function loadPreset() {
    const values=presetValues();
    $('[data-preset-color]').value=values.color;
    $('[data-preset-background]').value=values.backgroundColor==='transparent'?'#ffffff':values.backgroundColor;
    $('[data-preset-transparent]').checked=values.backgroundColor==='transparent';
    $('[data-preset-weight]').value=/^[1-9]00$/.test(values.fontWeight)?values.fontWeight:'600';
    previewPreset();
  }
  function controlsPreset(){return {color:$('[data-preset-color]').value,backgroundColor:$('[data-preset-transparent]').checked?'transparent':$('[data-preset-background]').value,fontWeight:$('[data-preset-weight]').value};}
  function previewPreset(){Object.assign($('[data-preview]').style,controlsPreset());}
  preset.onchange=loadPreset;
  ['color','background','transparent','weight'].forEach(key=>$('[data-preset-'+key+']').addEventListener('input',previewPreset));
  $('[data-preset-apply]').onclick=()=>format({},preset.value);
  $('[data-preset-update]').onclick=()=>{
    checkpoint();const styles=theme();styles[preset.value]=controlsPreset();
    state.content.__styles=JSON.stringify(styles);draftTheme();recordChange();
    setStatus('Стиль '+preset.value+' обновлён во всех разделах. Сохраните изменения.','dirty');
  };
  function stamp(value){$('.charter-editor-time').textContent=value?'Версия '+state.revision+' · '+new Date(value).toLocaleString('ru-RU'):'Начальная версия сайта';}
  async function adopt(data) {
    state.content=canonicalContent({...state.content,...data.content});state.revision=data.revision;
    saved=JSON.stringify(state.content);clearSelections();render();history.reset(snapshot());loadPreset();updateDirty();stamp(data.updatedAt);
  }
  async function reload() {
    if(state.saving)return;
    if(state.dirty && !confirm('Заменить несохранённые изменения актуальной версией из базы?'))return;
    try {
      const data=await window.PortiaSupabase.loadCharter();
      if(!data)throw Error('Не удалось загрузить устав. Ваши правки сохранены в редакторе.');
      await adopt(data);await api.applyStoredState(data);
    }catch(error){setStatus(error.message,'error');}
  }
  async function save() {
    checkpoint();if(!state.dirty || state.saving)return;
    const payload=structuredClone(state.content);
    state.saving=true;saveButton.disabled=true;
    canvas.contentEditable='false';source.disabled=true;
    dialog.querySelectorAll('.charter-editor-toolbar button,.charter-editor-toolbar input,.charter-editor-toolbar select,.editor-style-panel button,.editor-style-panel input,.editor-style-panel select').forEach(el=>el.disabled=true);
    setStatus('Сохраняем…');
    try {
      const data=await window.PortiaSupabase.saveCharter(payload,state.revision);
      state.revision=data.revision;saved=JSON.stringify(payload);state.dirty=JSON.stringify(state.content)!==saved;
      await api.applyStoredState(data);stamp(data.updatedAt);setStatus('Сохранено. Изменения доступны всем посетителям.','saved');
    }catch(error){setStatus(error.message,'error');}
    finally {
      state.saving=false;canvas.contentEditable='true';source.disabled=false;
      dialog.querySelectorAll('.charter-editor-toolbar button,.charter-editor-toolbar input,.charter-editor-toolbar select,.editor-style-panel button,.editor-style-panel input,.editor-style-panel select').forEach(el=>el.disabled=false);
      saveButton.disabled=!state.dirty;$('[data-undo]').disabled=history.index<=0;$('[data-redo]').disabled=history.index>=history.entries.length-1;
    }
  }
  $('[data-save]').onclick=save;$('[data-reload]').onclick=reload;
  function close(){checkpoint();dialog.close();CSS.highlights?.delete('portia-selection');}
  $('.charter-editor-close').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>{
    if(!(event.ctrlKey || event.metaKey))return;
    const key=event.key.toLowerCase();
    if(['z','y','s','b'].includes(key)){event.preventDefault();
      if(key==='s')save();else if(key==='b')format({fontWeight:'700'});else travel(key==='y' || event.shiftKey?'redo':'undo');
    }
  });
  window.addEventListener('beforeunload',event=>{if(state.dirty || state.saving){event.preventDefault();event.returnValue='';}});
  window.addEventListener('charter-update',event=>{
    if(event.detail.revision<=state.revision)return;
    if(state.dirty || state.saving){setStatus('В базе появилась новая версия. Ваш черновик сохранён; перед перезагрузкой скопируйте нужные правки.','warning');return;}
    adopt(event.detail);
  });
  try {
    const entries=await Promise.all(api.sections.map(async section=>[section.id,await api.getSection(section.id)]));
    state.content=canonicalContent(Object.fromEntries(entries));
    if(api.getStyles()!=='{}')state.content.__styles=api.getStyles();
    state.revision=api.getRevision();saved=JSON.stringify(state.content);
    api.sections.forEach(section=>{const button=document.createElement('button');button.type='button';button.dataset.section=section.id;button.textContent=section.num+' · '+section.label;button.onclick=()=>showSection(section.id);tabs.append(button);});
    render();history.reset(snapshot());loadPreset();updateDirty();stamp(api.getUpdatedAt());
    const control=document.createElement('div');control.className='owner-control';
    const button=document.createElement('button');button.className='owner-control-button';button.textContent='Редактировать устав';
    button.onclick=()=>{dialog.showModal();paintSelections();};control.append(button);document.body.append(control);
    if(new URLSearchParams(location.search).get('edit')==='1')dialog.showModal();
  }catch(error){dialog.remove();console.error('Editor loading failed',error);}
}
