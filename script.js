const SECTIONS = [
  { id: 'page1', num: '01', label: 'О отделе' },
  { id: 'page2', num: '02', label: 'Правила' },
  { id: 'page3', num: '03', label: 'Норма отдела' },
  { id: 'page4', num: '04', label: 'Повышения' },
  { id: 'page5', num: '05', label: 'Логи' },
  { id: 'page6', num: '06', label: 'Информация' },
];

const sectionCache = {};
let currentIndex = 0;
let isFlipping = false;

const prefersReducedMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

async function loadSection(targetId) {
  if (typeof SECTION_HTML !== 'undefined' && SECTION_HTML[targetId] !== undefined) {
    return SECTION_HTML[targetId];
  }
  if (sectionCache[targetId]) return sectionCache[targetId];

  const res = await fetch(`sections/${targetId}.html`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  sectionCache[targetId] = html;
  return html;
}

function updateNavigation(targetId) {
  document.querySelectorAll('.nav-item, .mobile-pill').forEach(el => {
    const active = el.dataset.target === targetId;
    el.classList.toggle('active', active);

    if (active && el.classList.contains('mobile-pill')) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  });
}

function updateEyebrow(meta) {
  const eyebrow = document.getElementById('paperEyebrow');
  if (eyebrow) {
    eyebrow.textContent =
      `Раздел ${meta.num} из ${String(SECTIONS.length).padStart(2, '0')} — ${meta.label}`;
  }
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function switchPage(targetId, directionOverride = null) {
  if (isFlipping) return;

  const targetIndex = SECTIONS.findIndex(s => s.id === targetId);
  if (targetIndex < 0 || targetIndex === currentIndex) return;

  const direction = directionOverride || (targetIndex > currentIndex ? 'up' : 'down');
  const container = document.getElementById('right-page-content');
  const meta = SECTIONS[targetIndex];

  if (!container) return;

  isFlipping = true;

  try {
    const html = await loadSection(targetId);

    updateNavigation(targetId);
    updateEyebrow(meta);

    if (prefersReducedMotion) {
      container.innerHTML = html;
      currentIndex = targetIndex;
      return;
    }

    // 1. Старый лист уходит вверх при переходе вперёд
    //    и вниз при переходе назад.
    container.classList.remove(
      'flip-in-up-start',
      'flip-in-down-start',
      'flip-out-up',
      'flip-out-down'
    );

    // Принудительно применяем исходное состояние перед новой анимацией.
    void container.offsetHeight;

    container.classList.add(
      direction === 'up' ? 'flip-out-up' : 'flip-out-down'
    );

    await nextFrame();
    await new Promise(resolve => {
      const onEnd = event => {
        if (event.target !== container || event.propertyName !== 'transform') return;
        container.removeEventListener('transitionend', onEnd);
        resolve();
      };

      container.addEventListener('transitionend', onEnd);
      setTimeout(() => {
        container.removeEventListener('transitionend', onEnd);
        resolve();
      }, 500);
    });

    // 2. Меняем содержимое, пока лист находится за пределами видимой области.
    container.innerHTML = html;
    currentIndex = targetIndex;

    container.classList.remove('flip-out-up', 'flip-out-down');

    // Принудительный reflow — критично для Safari/iOS и некоторых Android-браузеров.
    void container.offsetHeight;

    // Новый лист приходит с противоположной стороны.
    container.classList.add(
      direction === 'up' ? 'flip-in-up-start' : 'flip-in-down-start'
    );

    void container.offsetHeight;

    await nextFrame();

    container.classList.remove(
      'flip-in-up-start',
      'flip-in-down-start'
    );

    await new Promise(resolve => {
      const onEnd = event => {
        if (event.target !== container || event.propertyName !== 'transform') return;
        container.removeEventListener('transitionend', onEnd);
        resolve();
      };

      container.addEventListener('transitionend', onEnd);
      setTimeout(() => {
        container.removeEventListener('transitionend', onEnd);
        resolve();
      }, 500);
    });

  } catch (error) {
    console.error('Не удалось переключить раздел:', error);
    // Если анимация/загрузка сломалась, всё равно показываем страницу.
    try {
      const html = await loadSection(targetId);
      container.innerHTML = html;
      currentIndex = targetIndex;
      updateNavigation(targetId);
      updateEyebrow(meta);
    } catch (fallbackError) {
      console.error('Не удалось показать раздел:', fallbackError);
    }
  } finally {
    container.classList.remove(
      'flip-out-up',
      'flip-out-down',
      'flip-in-up-start',
      'flip-in-down-start'
    );
    isFlipping = false;
  }
}

function goRelative(step) {
  const targetIndex = currentIndex + step;
  if (targetIndex < 0 || targetIndex >= SECTIONS.length) return;

  switchPage(SECTIONS[targetIndex].id, step > 0 ? 'up' : 'down');
}

function initNavigation() {
  document.querySelectorAll('.nav-item, .mobile-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      switchPage(btn.dataset.target);
    });
  });
}

function initSwipeNavigation() {
  const area = document.querySelector('.content-area');
  if (!area) return;

  let startX = 0;
  let startY = 0;
  let startTime = 0;

  area.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
  }, { passive: true });

  area.addEventListener('touchend', event => {
    if (isFlipping || !event.changedTouches.length) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const duration = Date.now() - startTime;

    // Только быстрый вертикальный свайп.
    // Это не мешает обычной прокрутке длинных страниц.
    const isVertical = Math.abs(dy) > Math.abs(dx) * 1.35;
    const isSwipe = Math.abs(dy) >= 60 && duration <= 700;

    if (!isVertical || !isSwipe) return;

    if (dy < 0) {
      // Свайп вверх -> следующий лист.
      goRelative(1);
    } else {
      // Свайп вниз -> предыдущий лист.
      goRelative(-1);
    }
  }, { passive: true });
}

document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initSwipeNavigation();

  const first = SECTIONS[0];
  const container = document.getElementById('right-page-content');

  try {
    container.innerHTML = await loadSection(first.id);
  } catch (error) {
    console.error('Не удалось загрузить первый раздел:', error);
  }

  currentIndex = 0;
  updateNavigation(first.id);
  updateEyebrow(first);
});
