const SECTIONS = [
  { id: 'page1', num: '01', label: 'О отделе' },
  { id: 'page2', num: '02', label: 'Правила' },
  { id: 'page3', num: '03', label: 'Норма отдела' },
  { id: 'page4', num: '04', label: 'Повышения' },
  { id: 'page5', num: '05', label: 'Логи' },
  { id: 'page6', num: '06', label: 'Информация' },
];

let currentIndex = 0;
let isFlipping = false;
let touchStartY = null;
let touchStartX = null;

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const TRANSITION_MS = 560;

function getHtml(targetId) {
  if (typeof SECTION_HTML !== 'undefined' && SECTION_HTML[targetId] !== undefined) return SECTION_HTML[targetId];
  return fetch(`sections/${targetId}.html`).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });
}

function updateNavigation(targetId) {
  document.querySelectorAll('.nav-item, .mobile-pill').forEach(el => {
    const active = el.dataset.target === targetId;
    el.classList.toggle('active', active);
    if (active && el.classList.contains('mobile-pill')) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
}

function setMeta(targetIndex) {
  const meta = SECTIONS[targetIndex];
  document.getElementById('paperEyebrow').textContent =
    `Раздел ${meta.num} из ${String(SECTIONS.length).padStart(2, '0')} — ${meta.label}`;
}

function forceReflow(el) {
  void el.offsetWidth;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function switchPage(targetId) {
  if (isFlipping) return;
  const targetIndex = SECTIONS.findIndex(s => s.id === targetId);
  if (targetIndex < 0 || targetIndex === currentIndex) return;

  const stage = document.getElementById('paper-stage');
  const oldPaper = document.getElementById('paper');
  if (!stage || !oldPaper) return;

  isFlipping = true;
  const forward = targetIndex > currentIndex;
  updateNavigation(targetId);

  try {
    const html = await getHtml(targetId);
    const newMeta = SECTIONS[targetIndex];

    if (reduceMotion) {
      oldPaper.querySelector('.paper-body').innerHTML = html;
      setMeta(targetIndex);
      currentIndex = targetIndex;
      return;
    }

    // Запоминаем размеры текущего листа, чтобы новая страница не прыгала по высоте.
    const oldHeight = oldPaper.getBoundingClientRect().height;

    // Делаем новый физический лист. Старый и новый существуют одновременно.
    const newPaper = oldPaper.cloneNode(true);
    newPaper.id = 'paper';
    newPaper.querySelector('.paper-eyebrow').textContent =
      `Раздел ${newMeta.num} из ${String(SECTIONS.length).padStart(2, '0')} — ${newMeta.label}`;
    newPaper.querySelector('.paper-body').innerHTML = html;
    newPaper.classList.add('paper-incoming');

    oldPaper.classList.add('paper-outgoing', forward ? 'paper-out-up' : 'paper-out-down');
    stage.appendChild(newPaper);

    // Ставим новый лист на противоположную сторону и только после reflow включаем transition.
    newPaper.classList.add(forward ? 'paper-in-from-down' : 'paper-in-from-up');
    stage.style.minHeight = `${Math.max(oldHeight, newPaper.offsetHeight)}px`;
    forceReflow(stage);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        oldPaper.classList.add('paper-out-active');
        newPaper.classList.remove('paper-in-from-down', 'paper-in-from-up');
        newPaper.classList.add('paper-in-active');
      });
    });

    await wait(TRANSITION_MS + 60);

    // Новый лист становится обычным листом, старый удаляем.
    oldPaper.remove();
    newPaper.classList.remove('paper-incoming', 'paper-in-active');
    stage.style.minHeight = '';
    currentIndex = targetIndex;
  } catch (error) {
    console.error('Ошибка перелистывания:', error);
    // В случае ошибки всё равно показываем страницу.
    oldPaper.querySelector('.paper-body').innerHTML = await getHtml(targetId);
    setMeta(targetIndex);
    currentIndex = targetIndex;
  } finally {
    isFlipping = false;
  }
}

function goNext() {
  if (currentIndex < SECTIONS.length - 1) switchPage(SECTIONS[currentIndex + 1].id);
}

function goPrev() {
  if (currentIndex > 0) switchPage(SECTIONS[currentIndex - 1].id);
}

function initTouch() {
  const stage = document.getElementById('paper-stage');
  if (!stage) return;

  stage.addEventListener('touchstart', e => {
    if (isFlipping || e.touches.length !== 1) return;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  stage.addEventListener('touchend', e => {
    if (isFlipping || touchStartY === null || e.changedTouches.length !== 1) return;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartY = touchStartX = null;

    // Горизонтальные жесты и маленькие движения оставляем браузеру.
    if (Math.abs(dy) < 55 || Math.abs(dy) < Math.abs(dx) * 1.15) return;
    if (dy < 0) goNext();
    else goPrev();
  }, { passive: true });
}

function initNavigation() {
  document.querySelectorAll('.nav-item, .mobile-pill').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.target));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); goNext(); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); goPrev(); }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initTouch();
  try {
    document.querySelector('#right-page-content').innerHTML = await getHtml('page1');
    updateNavigation('page1');
  } catch (e) {
    console.error('Не удалось загрузить page1:', e);
  }
});
