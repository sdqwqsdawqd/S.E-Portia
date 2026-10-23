import {mergeRanges,offsetRange,domRange,formatRanges,History,BlockSelection,normalizeMediaUrl,sanitizeHtml,normalizeSections,readDraft,sourceSnapshot} from './editor-core.mjs';
import {mountColorPicker} from './editor-color-picker.mjs';

const COLOR_SWATCHES = ['#1c2422','#ffffff','#28c98b','#54b89a','#79d7be','#f3cf68','#f28c45','#df5757','#a879d7','#3979a8','#111713','#e9e4d9'];
const STYLE_LABELS = {
  'brand-green':'Portia · бирюзовый', 'green-title':'Зелёный заголовок',
  'highlight-brand':'Выделение Portia', 'highlight-green':'Зелёное выделение',
  'highlight-orange':'Оранжевое выделение', 'highlight-purple':'Фиолетовое выделение',
  'highlight-red':'Красное выделение', 'rank-lrs':'Ранг LRS', 'rank-jmrs':'Ранг JMRS',
  'rank-mrs':'Ранг MRS', 'rank-jhrs':'Ранг JHRS', 'rank-hrs':'Ранг HRS',
  'rank-prfs':'Ранг PRFS', 'rank-ldrs':'Ранг LDRS', 'tooltip':'Подсказка',
  'tooltip-box':'Окно подсказки', 'tooltip-box-large':'Большая подсказка',
  'doc-link':'Ссылка на документ', 'qualification-list':'Список проверок',
  'content-block':'Блок раздела', 'content-list':'Основной список', 'sub-list':'Вложенный список',
  'block-title':'Заголовок блока', 'block-text':'Текст блока',
  'leadership-grid':'Сетка руководства', 'leadership-card':'Карточка руководителя'
};

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

export async function compressImage(file, maxDimension = 1920, quality = 0.82) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d', { alpha: true }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось сжать изображение.')), 'image/webp', quality));
  if (blob.size >= file.size && scale === 1) return file;
  const name = String(file.name || 'image').replace(/\.[^.]+$/, '') + '.webp';
  return new File([blob], name, { type: 'image/webp', lastModified: Date.now() });
}

export async function mountEditor(api) {
  if (!api) return;
  const history = new History();
  const blockSelection = new BlockSelection();
  const state = {content:{}, revision:0, active:'page1', dirty:false, saving:false, uploading:0, sourceMode:false, ranges:{}, addNext:false};
  let saved = '', inputTimer, gesture = null, composing = false, selectedMedia = null, nextBlockId = 1;
  const blockIds = new WeakMap();
  const originals=api.originalSections || api.sections.filter(s=>/^page[1-8]$/.test(s.id));
  const draftKey='portia-owner-draft-v1';
  let lastDraftWritten='', selectedLeader=null;
  const sections=()=>normalizeSections(state.content.__sections,originals);
  const dialog = document.createElement('dialog');
  dialog.className='charter-editor-dialog';
  dialog.setAttribute('aria-labelledby','editor-title');
  dialog.innerHTML=`
    <div class="charter-editor-shell">
      <header class="charter-editor-header">
        <div><h1 id="editor-title">Редактор устава</h1></div>
        <button type="button" class="charter-editor-close" aria-label="Закрыть">×</button>
      </header>
      <nav class="charter-editor-tabs" aria-label="Разделы редактора"></nav>
      <div class="charter-editor-toolbar" aria-label="Основные действия">
        <div class="editor-tools-row">
          <button data-undo title="Ctrl+Z" aria-label="Отменить действие">↶ Отменить</button>
          <button data-redo title="Ctrl+Shift+Z / Ctrl+Y" aria-label="Повторить действие">↷ Повторить</button>
          <button data-source aria-pressed="false">HTML-код</button>
        </div>
        <div class="editor-selection-row">
          <strong data-selection-count aria-live="polite">Выделите текст или нажмите Ctrl + ЛКМ</strong>
          <button data-add aria-pressed="false">Добавить ещё</button><button data-all>Выбрать весь раздел</button><button data-reset>Снять выбор</button>
        </div>
      </div>
      <div class="editor-main">
        <div class="charter-editor-workspace">
          <div class="charter-editor-canvas" contenteditable="true" role="textbox" aria-label="Содержимое раздела" aria-multiline="true" spellcheck="true"></div>
          <textarea class="charter-editor-source" aria-label="HTML раздела" spellcheck="false" hidden></textarea>
        </div>
        <aside class="editor-style-panel" aria-label="Инструменты редактора">
          <nav class="editor-tool-tabs" aria-label="Группы инструментов">
            <button class="active" data-tool-tab="text">Текст</button>
            <button data-tool-tab="styles">Стили</button>
            <button data-tool-tab="blocks">Блоки</button>
            <button data-tool-tab="media">Медиа</button>
            <button data-tool-tab="sections">Разделы</button>
          </nav>

          <section class="editor-tool-panel active" data-tool-panel="text">
            <h2>Оформление текста</h2>
            <div class="editor-button-grid">
              <button data-style="fontWeight" data-value="700" title="Ctrl+B"><b>Жирный</b></button>
              <button data-style="fontStyle" data-value="italic"><i>Курсив</i></button>
              <button data-style="textDecoration" data-value="underline"><u>Подчёркнутый</u></button>
              <button data-clear-format>Сбросить</button>
            </div>
            <label>Жирность<select data-weight aria-label="Жирность текста"><option value="400">Обычная</option><option value="500">Средняя</option><option value="600">Полужирная</option><option value="700">Жирная</option><option value="900">Максимальная</option></select></label>
            <label>Размер текста<select data-font-size><option value="">Выбрать размер</option>${[12,14,16,18,20,24,28,32,40,48].map(n=>`<option value="${n}">${n} px</option>`).join('')}</select></label>
            <div class="editor-color-card">
              <strong>Цвет текста</strong>
              <div class="editor-color-line"><input type="color" data-color value="#1c2422" aria-label="Цвет текста HEX"></div>
              <button data-apply-color class="editor-primary">Применить цвет</button>
            </div>
            <div class="editor-color-card">
              <strong>Цвет фона</strong>
              <div class="editor-color-line"><input type="color" data-background value="#fff0a6" aria-label="Цвет фона текста HEX"></div>
              <button data-apply-background class="editor-primary">Применить фон</button><button data-no-background>Убрать фон</button>
            </div>
            <div class="editor-button-grid"><button data-command="insertUnorderedList">Маркированный список</button><button data-command="insertOrderedList">Нумерованный список</button><button data-link>Добавить ссылку</button></div>
          </section>

          <section class="editor-tool-panel" data-tool-panel="styles" hidden>
            <h2>Стили Portia</h2>
            <p>Ctrl + Alt + K — открыть стили для всех выбранных фрагментов.</p>
            <label>Готовый стиль<select data-preset aria-label="Стиль устава"></select></label>
            <div class="editor-style-preview"><span data-preview>Пример текста</span></div>
            <button data-preset-apply class="editor-primary">Применить к выделению</button>
            <details><summary>Изменить этот стиль во всём уставе</summary>
              <p>Новые цвета применятся ко всем фрагментам с выбранным классом после сохранения.</p>
              <label>Цвет текста<input type="color" data-preset-color aria-label="Цвет текста стиля"></label>
              <label>Цвет фона<input type="color" data-preset-background aria-label="Цвет фона стиля"></label>
              <label class="editor-checkbox"><input type="checkbox" data-preset-transparent>Прозрачный фон</label>
              <label>Жирность<select data-preset-weight aria-label="Жирность стиля"><option>400</option><option>500</option><option>600</option><option>700</option><option>900</option></select></label>
              <button data-preset-update>Обновить стиль везде</button>
            </details>
          </section>

          <section class="editor-tool-panel" data-tool-panel="blocks" hidden>
            <h2>Добавить блок</h2>
            <p>Новый блок появится в конце открытого раздела. После этого текст можно изменить прямо на странице.</p>
            <div class="editor-block-list">
              <button data-insert-block="title"><strong>Заголовок</strong><span>Как «Что такое проверки»</span></button>
              <button data-insert-block="paragraph"><strong>Обычный текст</strong><span>Абзац в стиле устава</span></button>
              <button data-insert-block="bullets"><strong>Список</strong><span>Маркированные пункты</span></button>
              <button data-insert-block="numbered"><strong>Нумерованный список</strong><span>Последовательность действий</span></button>
              <button data-insert-block="notice"><strong>Важное примечание</strong><span>Выделенный цветом блок</span></button>
              <button data-insert-block="divider"><strong>Разделитель</strong><span>Отделяет смысловые части</span></button>
            </div>
          </section>

          <section class="editor-tool-panel" data-tool-panel="media" hidden>
            <h2>Фото и видео</h2>
            <p>Фото автоматически уменьшается и сохраняется в WebP. Ссылки YouTube, Vimeo и Rutube превращаются в видео.</p>
            <div class="editor-media-card">
              <strong>Добавить изображение</strong>
              <label>Файл<input type="file" data-image-file accept="image/jpeg,image/png,image/webp,image/gif"></label>
              <label>Описание<input type="text" data-image-alt placeholder="Что изображено на фото"></label>
              <label>Подпись<input type="text" data-image-caption placeholder="Необязательно"></label>
              <button data-add-image class="editor-primary">Добавить изображение</button>
            </div>
            <div class="editor-media-card">
              <strong>Добавить видео или ссылку</strong>
              <label>Ссылка<input type="url" data-media-url placeholder="https://youtube.com/watch?v=…"></label>
              <label>Подпись<input type="text" data-media-caption placeholder="Необязательно"></label>
              <button data-add-media class="editor-primary">Добавить видео или ссылку</button>
            </div>
            <div class="editor-media-card">
              <strong>Загрузить видеофайл</strong>
              <label>MP4 или WebM<input type="file" data-video-file accept="video/mp4,video/webm"></label>
              <label>Подпись<input type="text" data-video-caption placeholder="Необязательно"></label>
              <button data-add-video class="editor-primary">Загрузить видео</button>
            </div>
            <div class="editor-media-card">
              <strong>Изменить выбранное медиа</strong>
              <p data-selected-media>Нажмите на фото или видео в тексте.</p>
              <label>Ширина<select data-media-width><option value="100">100%</option><option value="75">75%</option><option value="50">50%</option></select></label>
              <label>Выравнивание<select data-media-align><option value="center">По центру</option><option value="left">Слева</option><option value="right">Справа</option></select></label>
              <div class="editor-button-grid"><button data-apply-media>Применить размер</button><button data-replace-media>Заменить ссылкой выше</button><button data-replace-file>Заменить файлом выше</button><button data-remove-media>Удалить</button></div>
            </div>
            <details class="editor-leadership"><summary>Карточки руководства</summary>
              <label>Карточка<select data-leader-select><option value="">Новая карточка</option></select></label>
              <label>Группа<select data-leader-group></select></label>
              <label>Имя<input data-leader-name maxlength="120"></label>
              <label>Описание<textarea data-leader-description rows="4"></textarea></label>
              <p>Для фото выберите карточку, нажмите её изображение и используйте замену медиа.</p>
              <button data-leader-save>Добавить карточку</button><button data-leader-remove>Удалить карточку</button>
            </details>
            <p class="editor-upload-status" data-upload-status role="status"></p>
          </section>

          <section class="editor-tool-panel" data-tool-panel="sections" hidden>
            <h2>Разделы устава</h2>
            <label>Название открытого раздела<input data-section-name maxlength="80"></label>
            <button data-section-rename>Переименовать</button>
            <div class="editor-button-grid"><button data-section-up>Выше</button><button data-section-down>Ниже</button></div>
            <button data-section-add>Добавить новый раздел</button><button data-section-remove>Удалить этот раздел</button>
            <p>Исходные восемь разделов защищены от удаления.</p>
            <h2>Резервная копия</h2>
            <button data-export>Скачать копию JSON</button>
            <button data-source-backup>Записать копию в исходники</button>
            <label>Восстановить копию<input data-import type="file" accept="application/json,.json"></label>
            <p>Черновик сохраняется в этом браузере. Копия JSON позволяет перенести его и восстановить после очистки браузера.</p>
            <p>Запись в исходники создаёт charter-snapshot.json в выбранной папке сайта. Для обновления GitHub затем отправьте этот файл в репозиторий. Фото и видео остаются по своим ссылкам.</p>
          </section>

          <p class="editor-tip">Ctrl + Z — отмена<br>Ctrl + Shift + Z — повтор<br>Ctrl + S — сохранить</p>
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
  dialog.querySelectorAll('[data-tool-tab]').forEach(button=>button.addEventListener('click',()=>{
    dialog.querySelectorAll('[data-tool-tab]').forEach(item=>item.classList.toggle('active',item===button));
    dialog.querySelectorAll('[data-tool-panel]').forEach(panel=>{
      const active=panel.dataset.toolPanel===button.dataset.toolTab;
      panel.hidden=!active;panel.classList.toggle('active',active);
    });
  }));
  dialog.querySelectorAll('input[type="color"]').forEach(input=>mountColorPicker(input,COLOR_SWATCHES));
  const theme = () => {try {return JSON.parse(state.content.__styles || '{}');} catch {return {};}};
  function canonicalContent(content) {
    return Object.fromEntries(Object.entries(content).map(([key,value])=>{
      if(key==='__styles' || key==='__sections')return [key,value];
      return [key,sanitizeHtml(value,document)];
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
    if(state.dirty){
      try{lastDraftWritten=JSON.stringify({...snapshot(),revision:state.revision});localStorage.setItem(draftKey,lastDraftWritten);setStatus(navigator.onLine?'Черновик сохранён на устройстве · ещё не опубликован':'Нет сети · черновик сохранён на устройстве','dirty');}
      catch{setStatus('Не удалось сохранить на устройстве. Скачайте копию JSON до закрытия.','error');}
    }else if(lastDraftWritten){try{if(localStorage.getItem(draftKey)===lastDraftWritten)localStorage.removeItem(draftKey);}catch{}}
  }
  function checkpoint() { clearTimeout(inputTimer);commit();history.push(snapshot());updateDirty(); }
  function recordChange() {commit();history.push(snapshot());updateDirty();}
  function render() {
    const safe=sanitizeHtml(state.content[state.active] || '',document);
    state.content[state.active]=safe;
    canvas.innerHTML=safe;
    source.value=safe;
    selectedMedia=null;blockSelection.clear();
    renderTabs();renderLeaders();
    tabs.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.section===state.active);b.setAttribute('aria-current',b.dataset.section===state.active?'page':'false');});
    draftTheme(); paintSelections();
  }
  function renderTabs(){
    tabs.replaceChildren();sections().forEach(section=>{const b=document.createElement('button');b.type='button';b.dataset.section=section.id;b.textContent=section.num+' · '+section.label;b.onclick=()=>showSection(section.id);tabs.append(b);});
    $('[data-section-name]').value=sections().find(s=>s.id===state.active)?.label||'';
    $('[data-section-remove]').disabled=!state.active.startsWith('custom-');
  }
  function showSection(id) {checkpoint();state.active=id;render();}
  function clearSelections() { state.ranges={};blockSelection.clear();window.getSelection()?.removeAllRanges();paintSelections(); }
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
  const blockElements=new Map();
  const blockSelector='li, .block-title, .block-text, .leader-details, .leader-photo, .portia-media, p';
  function blockId(element) {
    if(!blockIds.has(element))blockIds.set(element,`block-${nextBlockId++}`);
    const id=blockIds.get(element);blockElements.set(id,element);return id;
  }
  function captureBlock(element) {
    const range=document.createRange();range.selectNodeContents(element);
    return offsetRange(canvas,range);
  }
  function toggleBlock(element) {
    blockSelection.toggle(blockId(element),true);
    state.ranges[state.active]=mergeRanges(blockSelection.values().map(id=>captureBlock(blockElements.get(id))).filter(Boolean));
    paintSelections();
  }
  canvas.addEventListener('pointerdown',event=>{
    if (event.button!==0) return;
    checkpoint();
    const additive=event.ctrlKey || event.metaKey || state.addNext;
    if (additive && !window.getSelection()?.isCollapsed) capture(true);
    else if(!additive){state.ranges={};blockSelection.clear();}
    gesture={additive,x:event.clientX,y:event.clientY};
  });
  document.addEventListener('pointerup',event=>{
    if (!gesture) return;
    const {additive,x,y}=gesture;gesture=null;
    const clicked=Math.hypot(event.clientX-x,event.clientY-y)<5;
    if (additive && clicked && canvas.contains(event.target)) {
      const block=event.target.closest?.(blockSelector);
      if(block && canvas.contains(block))toggleBlock(block);
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
  canvas.addEventListener('click',event=>{
    if(event.target.closest('a'))event.preventDefault();
    const media=event.target.closest('.portia-media') || event.target.closest('img, video, iframe') || event.target.closest('.leader-photo');
    if(media && canvas.contains(media)){
      selectedMedia=media;
      $('[data-tool-tab="media"]').click();
      $('[data-selected-media]').textContent='Выбрано: '+(media.querySelector?.('figcaption')?.textContent || media.getAttribute?.('alt') || media.tagName.toLowerCase());
      setStatus('Медиа выбрано. Размер, выравнивание, замену и удаление можно изменить справа.');
    }
    const card=event.target.closest('.leadership-card');if(card){selectedLeader=card;renderLeaders(card);}
  });
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
  $('[data-font-size]').onchange=event=>{if(event.target.value)format({fontSize:event.target.value+'px'});};
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
    if(state.uploading){setStatus('Дождитесь завершения загрузки файла.','warning');return;}
    checkpoint();state.sourceMode=!state.sourceMode;clearSelections();
    canvas.hidden=state.sourceMode;source.hidden=!state.sourceMode;
    $('[data-source]').setAttribute('aria-pressed',String(state.sourceMode));render();
  };
  function appendBlock(html,message,targetId=state.active) {
    if(state.saving)return false;
    checkpoint();
    const safe=sanitizeHtml(html,document);
    if(targetId===state.active && !state.sourceMode){
      canvas.insertAdjacentHTML('beforeend',safe);source.value=canvas.innerHTML;
      canvas.lastElementChild?.scrollIntoView({behavior:'smooth',block:'center'});
    }else{
      const root=document.createElement('div');root.innerHTML=sanitizeHtml(state.content[targetId]||'',document);root.insertAdjacentHTML('beforeend',safe);state.content[targetId]=root.innerHTML;
      if(targetId===state.active)source.value=state.content[targetId];
    }
    recordChange();
    setStatus(message,'dirty');
    return true;
  }
  const blockTemplates={
    title:'<div class="content-block"><h2 class="block-title">Новый заголовок</h2><div class="block-text">Введите текст блока…</div></div>',
    paragraph:'<div class="content-block"><div class="block-text">Новый текст…</div></div>',
    bullets:'<div class="content-block"><ul class="content-list"><li>Первый пункт</li><li>Второй пункт</li></ul></div>',
    numbered:'<div class="content-block"><ol class="content-list"><li>Первый шаг</li><li>Второй шаг</li></ol></div>',
    notice:'<div class="content-block"><div class="block-text"><span class="highlight-brand"><strong>Важно:</strong> напишите примечание…</span></div></div>',
    divider:'<hr class="portia-divider">'
  };
  dialog.querySelectorAll('[data-insert-block]').forEach(button=>button.onclick=()=>appendBlock(blockTemplates[button.dataset.insertBlock],'Блок добавлен. Измените его текст и сохраните устав.'));

  async function addImage() {
    const file=$('[data-image-file]').files?.[0];
    if(!file){setStatus('Выберите изображение.','warning');return;}
    if(file.size>25*1024*1024){setStatus('Исходный файл должен быть меньше 25 МБ.','error');return;}
    const uploadSection=state.active;
    const uploadStatus=$('[data-upload-status]'),button=$('[data-add-image]');button.disabled=true;state.uploading+=1;
    try{
      uploadStatus.textContent='Сжимаем изображение…';
      const optimized=await compressImage(file);
      uploadStatus.textContent=`Загружаем ${Math.max(1,Math.round(optimized.size/1024))} КБ…`;
      const uploaded=await window.PortiaMedia.upload(optimized);
      const alt=escapeHtml($('[data-image-alt]').value||'Изображение Portia');
      const caption=escapeHtml($('[data-image-caption]').value);
      if(!appendBlock(`<figure class="portia-media portia-media--image"><img src="${escapeHtml(uploaded.url)}" alt="${alt}" loading="lazy">${caption?`<figcaption>${caption}</figcaption>`:''}</figure>`,'Изображение добавлено. Нажмите «Сохранить всё».',uploadSection))throw Error('Изображение загружено, но не удалось вставить его в раздел.');
      $('[data-image-file]').value='';$('[data-image-alt]').value='';$('[data-image-caption]').value='';uploadStatus.textContent='Изображение готово.';
    }catch(error){uploadStatus.textContent='';setStatus(error.message||'Не удалось добавить изображение.','error');}
    finally{state.uploading=Math.max(0,state.uploading-1);button.disabled=false;}
  }
  $('[data-add-image]').onclick=addImage;
  function renderLeaders(card=null){
    selectedLeader=card;
    if(card)selectedMedia=card.querySelector('.leader-photo');
    else if(selectedMedia?.closest('.leadership-card'))selectedMedia=null;
    const select=$('[data-leader-select]');select.replaceChildren(new Option('Новая карточка',''));
    [...canvas.querySelectorAll('.leadership-card')].forEach((item,i)=>select.add(new Option(item.querySelector('.leader-details > strong')?.textContent||'Без имени',String(i))));
    if(card)select.value=String([...canvas.querySelectorAll('.leadership-card')].indexOf(card));
    const groups=$('[data-leader-group]');groups.replaceChildren();
    [...canvas.querySelectorAll('.leadership-grid')].forEach((grid,i)=>groups.add(new Option(grid.getAttribute('aria-label')||grid.closest('.content-block')?.querySelector('h2')?.textContent||`Группа ${i+1}`,String(i))));
    if(card)groups.value=String([...canvas.querySelectorAll('.leadership-grid')].indexOf(card.closest('.leadership-grid')));
    $('[data-leader-name]').value=card?.querySelector('.leader-details > strong')?.textContent||'';
    $('[data-leader-description]').value=card?.querySelector('.leader-details > span')?.textContent||'';
    $('[data-leader-save]').textContent=card?'Обновить карточку':'Добавить карточку';
    $('[data-leader-remove]').disabled=!card;
  }
  $('[data-leader-select]').onchange=e=>renderLeaders(e.target.value===''?null:canvas.querySelectorAll('.leadership-card')[Number(e.target.value)]);
  $('[data-leader-save]').onclick=()=>{
    if(state.sourceMode || state.saving)return;
    const name=$('[data-leader-name]').value.trim(),description=$('[data-leader-description]').value;
    if(!name){setStatus('Введите имя руководителя.','warning');return;}
    checkpoint();let grid=canvas.querySelectorAll('.leadership-grid')[Number($('[data-leader-group]').value)];
    if(!grid){grid=document.createElement('div');grid.className='leadership-grid';canvas.append(grid);}
    let card=selectedLeader;
    if(!card){card=document.createElement('article');card.className='leadership-card';card.innerHTML='<div class="leader-photo"></div><div class="leader-details"><strong></strong><span></span></div>';}
    if(card.parentElement!==grid)grid.append(card);
    const nameNode=card.querySelector('.leader-details > strong'),descriptionNode=card.querySelector('.leader-details > span');
    if(nameNode.textContent!==name)nameNode.textContent=name;
    if(descriptionNode.textContent!==description)descriptionNode.textContent=description;
    // An empty photo slot is selectable, so a new card can receive its first photo.
    selectedMedia=card.querySelector('.leader-photo');recordChange();renderLeaders(card);setStatus('Карточка сохранена в черновике. Для фото выберите файл и нажмите «Заменить файлом выше».','dirty');
  };
  $('[data-leader-remove]').onclick=()=>{if(state.sourceMode || !selectedLeader || !confirm('Удалить выбранную карточку?'))return;checkpoint();selectedLeader.remove();selectedMedia=null;recordChange();renderLeaders();};
  function replaceSelectedImage(target,url,alt=''){
    if(!canvas.contains(target))throw Error('Выбранное изображение больше не открыто. Выберите его повторно.');
    checkpoint();
    const photo=target.matches('.leader-photo')?target:target.closest('.leader-photo');
    if(photo){let img=photo.querySelector('img');if(!img){img=document.createElement('img');photo.append(img);}img.src=url;img.alt=alt;selectedMedia=img;}
    else if(target.tagName==='IMG'){target.src=url;target.alt=alt;}
    else {target.innerHTML=`<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy">`;}
    recordChange();
  }
  $('[data-replace-file]').onclick=async()=>{
    const target=selectedMedia,file=$('[data-image-file]').files?.[0];
    if(state.sourceMode || !target || !file){setStatus('Выберите фото в документе и файл изображения выше.','warning');return;}
    if(file.size>25*1024*1024){setStatus('Изображение должно быть меньше 25 МБ.','error');return;}
    state.uploading++;const button=$('[data-replace-file]');button.disabled=true;
    try{const uploaded=await window.PortiaMedia.upload(await compressImage(file));replaceSelectedImage(target,uploaded.url,$('[data-image-alt]').value);setStatus('Фотография заменена в черновике.','dirty');}
    catch(error){setStatus(error.message,'error');}finally{state.uploading--;button.disabled=false;}
  };
  function modifySections(action){
    if(state.saving || state.uploading)return;
    checkpoint();const list=sections();action(list);state.content.__sections=JSON.stringify(list);history.push(snapshot());render();updateDirty();
  }
  $('[data-section-add]').onclick=()=>modifySections(list=>{const id='custom-'+crypto.randomUUID();list.push({id,label:'Новый раздел'});state.content[id]='<div class="content-block"><h2 class="block-title">Новый раздел</h2><div class="block-text">Введите текст…</div></div>';state.active=id;clearSelections();});
  $('[data-section-rename]').onclick=()=>{const label=$('[data-section-name]').value.trim();if(label)modifySections(list=>list.find(s=>s.id===state.active).label=label);};
  function moveSection(delta){modifySections(list=>{const i=list.findIndex(s=>s.id===state.active),j=i+delta;if(j>=0 && j<list.length)[list[i],list[j]]=[list[j],list[i]];});}
  $('[data-section-up]').onclick=()=>moveSection(-1);$('[data-section-down]').onclick=()=>moveSection(1);
  $('[data-section-remove]').onclick=()=>{if(state.active.startsWith('custom-') && confirm('Удалить этот новый раздел? Можно отменить через Ctrl+Z.'))modifySections(list=>{const i=list.findIndex(s=>s.id===state.active);list.splice(i,1);delete state.content[state.active];clearSelections();state.active=list[0].id;});};
  $('[data-export]').onclick=()=>{checkpoint();const url=URL.createObjectURL(new Blob([JSON.stringify({...snapshot(),revision:state.revision},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='portia-charter-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('[data-source-backup]').onclick=async()=>{
    if(!window.showDirectoryPicker){setStatus('Запись в папку доступна в Chrome/Edge на компьютере. Здесь используйте «Скачать копию JSON».','warning');return;}
    if(state.uploading || state.saving){setStatus('Дождитесь завершения сохранения или загрузки.','warning');return;}
    checkpoint();const data=sourceSnapshot(canonicalContent(state.content),state.revision);
    try{
      const folder=await window.showDirectoryPicker({mode:'readwrite'});
      const index=await (await folder.getFileHandle('index.html')).getFile();
      if(!/Portia/i.test(await index.text()))throw Error('Выберите корневую папку сайта Portia с index.html.');
      if(!confirm('Записать текущую копию в charter-snapshot.json в этой папке? Предыдущий снимок, если он есть, будет заменён.'))return;
      const handle=await folder.getFileHandle('charter-snapshot.json',{create:true});const writable=await handle.createWritable();
      try{await writable.write(data);await writable.close();}catch(error){await writable.abort().catch(()=>{});throw error;}
      setStatus('Копия записана в charter-snapshot.json. Отправьте файл в GitHub, чтобы сохранить его в репозитории.','saved');
    }catch(error){if(error.name!=='AbortError')setStatus(error.message||'Не удалось записать копию.','error');}
  };
  $('[data-import]').onchange=async e=>{
    const file=e.target.files?.[0];if(!file || state.saving)return;
    try{if(file.size>10*1024*1024)throw Error('Копия должна быть меньше 10 МБ.');const draft=readDraft(await file.text());if(!draft || !originals.every(s=>typeof draft.content[s.id]==='string'))throw Error('Неверный формат или отсутствуют исходные разделы.');if(!confirm('Загрузить копию в черновик? Опубликованный устав не изменится до сохранения.'))return;checkpoint();state.content=canonicalContent(draft.content);state.active=sections()[0].id;clearSelections();history.push(snapshot());render();updateDirty();}catch(error){setStatus(error.message,'error');}finally{e.target.value='';}
  };

  function mediaFigureHtml(media,caption='') {
    const safeCaption=escapeHtml(caption);
    let body='';
    if(media.kind==='embed')body=`<iframe src="${escapeHtml(media.url)}" title="${safeCaption||'Видео Portia'}" loading="lazy" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    else if(media.kind==='video')body=`<video src="${escapeHtml(media.url)}" controls preload="metadata"></video>`;
    else if(media.kind==='image')body=`<img src="${escapeHtml(media.url)}" alt="${safeCaption||'Изображение Portia'}" loading="lazy">`;
    else body=`<a class="doc-link" href="${escapeHtml(media.url)}" target="_blank" rel="noopener noreferrer">${safeCaption||'Открыть медиаматериал'}</a>`;
    return `<figure class="portia-media portia-media--${media.kind}">${body}${safeCaption&&media.kind!=='link'?`<figcaption>${safeCaption}</figcaption>`:''}</figure>`;
  }

  function addMediaUrl() {
    const value=$('[data-media-url]').value.trim();
    const media=normalizeMediaUrl(value);
    if(!media){setStatus('Введите безопасную ссылку, начинающуюся с https://','error');return;}
    const caption=$('[data-media-caption]').value;
    appendBlock(mediaFigureHtml(media,caption),'Медиаблок добавлен. Нажмите «Сохранить всё».');
    $('[data-media-url]').value='';$('[data-media-caption]').value='';
  }
  $('[data-add-media]').onclick=addMediaUrl;
  async function addVideoFile() {
    const file=$('[data-video-file]').files?.[0];
    if(!file){setStatus('Выберите MP4 или WebM видео.','warning');return;}
    if(!['video/mp4','video/webm'].includes(file.type)){setStatus('Поддерживаются только MP4 и WebM.','error');return;}
    if(file.size>50*1024*1024){setStatus('Видеофайл должен быть меньше 50 МБ.','error');return;}
    const uploadSection=state.active;
    const button=$('[data-add-video]'),uploadStatus=$('[data-upload-status]');button.disabled=true;state.uploading+=1;
    try{
      uploadStatus.textContent=`Загружаем видео ${Math.max(1,Math.round(file.size/1024/1024))} МБ…`;
      const uploaded=await window.PortiaMedia.upload(file);
      if(!appendBlock(mediaFigureHtml({kind:'video',url:uploaded.url},$('[data-video-caption]').value),'Видео добавлено. Нажмите «Сохранить всё».',uploadSection))throw Error('Видео загружено, но не удалось вставить его в раздел.');
      $('[data-video-file]').value='';$('[data-video-caption]').value='';uploadStatus.textContent='Видео готово.';
    }catch(error){uploadStatus.textContent='';setStatus(error.message||'Не удалось загрузить видео.','error');}
    finally{state.uploading=Math.max(0,state.uploading-1);button.disabled=false;}
  }
  $('[data-add-video]').onclick=addVideoFile;
  $('[data-apply-media]').onclick=()=>{
    if(!selectedMedia){setStatus('Сначала нажмите на фото или видео в тексте.','warning');return;}
    checkpoint();
    [...selectedMedia.classList].filter(name=>/^media-(?:width|align)-/.test(name)).forEach(name=>selectedMedia.classList.remove(name));
    selectedMedia.classList.add(`media-width-${$('[data-media-width]').value}`,`media-align-${$('[data-media-align]').value}`);
    recordChange();setStatus('Размер и выравнивание изменены.','dirty');
  };
  $('[data-replace-media]').onclick=()=>{
    if(!selectedMedia){setStatus('Сначала нажмите на фото или видео в тексте.','warning');return;}
    const media=normalizeMediaUrl($('[data-media-url]').value.trim());
    if(!media){setStatus('Для замены укажите безопасную ссылку выше.','error');return;}
    if(selectedMedia.closest('.leader-photo') || selectedMedia.matches('.leader-photo')){
      if(media.kind!=='image'){setStatus('Для карточки нужна прямая ссылка на изображение или загрузка файла.','warning');return;}
      replaceSelectedImage(selectedMedia,media.url,$('[data-image-alt]').value);return;
    }
    checkpoint();selectedMedia.insertAdjacentHTML('beforebegin',sanitizeHtml(mediaFigureHtml(media,$('[data-media-caption]').value),document));selectedMedia.remove();selectedMedia=null;recordChange();
    setStatus('Медиа заменено.','dirty');
  };
  $('[data-remove-media]').onclick=()=>{
    if(!selectedMedia){setStatus('Сначала нажмите на фото или видео в тексте.','warning');return;}
    checkpoint();selectedMedia.remove();selectedMedia=null;recordChange();$('[data-selected-media]').textContent='Нажмите на фото или видео в тексте.';setStatus('Медиа удалено.','dirty');
  };
  const preset=$('[data-preset]');
  const usefulStyles=window.PortiaTheme.names.filter(name=>/^(brand-green|green-title|highlight-|rank-|doc-link)/.test(name));
  for(const name of usefulStyles){const option=document.createElement('option');option.value=name;option.textContent=STYLE_LABELS[name]||name;preset.append(option);}
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
    state.content=canonicalContent(data.content);state.revision=data.revision;
    if(!sections().some(s=>s.id===state.active))state.active=sections()[0].id;
    saved=JSON.stringify(state.content);clearSelections();render();history.reset(snapshot());loadPreset();updateDirty();stamp(data.updatedAt);
  }
  async function reload() {
    if(state.saving)return;
    if(state.dirty && !confirm('Заменить несохранённые изменения актуальной версией из базы?'))return;
    try {
      const data=await window.PortiaSupabase.loadCharter(await api.getBaselineContent());
      if(!data)throw Error('Не удалось загрузить устав. Ваши правки сохранены в редакторе.');
      await adopt(data);await api.applyStoredState(data);
    }catch(error){setStatus(error.message,'error');}
  }
  async function save() {
    if(state.uploading){setStatus('Дождитесь завершения загрузки файла, затем сохраните.','warning');return;}
    checkpoint();if(!state.dirty || state.saving)return;
    const payload=canonicalContent(structuredClone(state.content));
    state.saving=true;saveButton.disabled=true;
    canvas.contentEditable='false';source.disabled=true;
    dialog.querySelectorAll('.charter-editor-toolbar button,.charter-editor-toolbar input,.charter-editor-toolbar select,.editor-style-panel button,.editor-style-panel input,.editor-style-panel select').forEach(el=>el.disabled=true);
    setStatus('Сохраняем…');
    try {
      const data=await window.PortiaSupabase.saveCharter(payload,state.revision);
      state.content=payload;state.revision=data.revision;saved=JSON.stringify(payload);state.dirty=false;
      try{if(localStorage.getItem(draftKey)===lastDraftWritten)localStorage.removeItem(draftKey);}catch{}
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
    if(event.altKey && event.code==='KeyK'){event.preventDefault();$('[data-tool-tab="styles"]').click();preset.focus();return;}
    if(event.target.closest('input,textarea') && event.target!==source && event.code!=='KeyS')return;
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
    if(api.getSectionMetadata?.())state.content.__sections=api.getSectionMetadata();
    state.revision=api.getRevision();saved=JSON.stringify(state.content);
    let draft;try{draft=readDraft(localStorage.getItem(draftKey));}catch{}
    if(draft && JSON.stringify(draft.content)!==saved && confirm('Найден локальный черновик. Восстановить его? Публикация потребует сохранения.')){
      state.content=canonicalContent(draft.content);state.revision=draft.revision;state.active=sections().some(s=>s.id===draft.active)?draft.active:sections()[0].id;
    }
    render();history.reset(snapshot());loadPreset();updateDirty();stamp(api.getUpdatedAt());
    const control=document.createElement('div');control.className='owner-control';
    const button=document.createElement('button');button.className='owner-control-button';button.textContent='Редактировать устав';
    button.onclick=()=>{dialog.showModal();paintSelections();};control.append(button);document.body.append(control);
    if(new URLSearchParams(location.search).get('edit')==='1')dialog.showModal();
  }catch(error){dialog.remove();console.error('Editor loading failed',error);}
}
