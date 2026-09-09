const SECTIONS = [
  { id: 'page1', num: '01', label: 'О отделе' },
  { id: 'page2', num: '02', label: 'Правила' },
  { id: 'page3', num: '03', label: 'Норма отдела' },
  { id: 'page4', num: '04', label: 'Повышения' },
  { id: 'page5', num: '05', label: 'Логи' },
  { id: 'page6', num: '06', label: 'Информация' },
];

const sectionCache = {};
let currentIndex = -1;
let isFlipping = false;

const prefersReducedMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

async function loadSection(targetId) {
  if (sectionCache[targetId]) {
    return sectionCache[targetId];
  }
  const res = await fetch(`sections/${targetId}.html`);
  const html = await res.text();
  sectionCache[targetId] = html;
  return html;
}

function waitForTransitionEnd(el, property, fallbackMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener('transitionend', onEnd);
      resolve();
    };
    const onEnd = (e) => {
      if (e.target === el && (!property || e.propertyName === property)) {
        finish();
      }
    };
    el.addEventListener('transitionend', onEnd)
    setTimeout(finish, fallbackMs);
  });
}

async function switchPage(targetId) {
  if (isFlipping) return;

  const targetIndex = SECTIONS.findIndex(s => s.id === targetId);
  if (targetIndex === -1 || targetIndex === currentIndex) return;

  const goingForward = targetIndex > currentIndex;
  isFlipping = true;

  const meta = SECTIONS[targetIndex];
  const container = document.getElementById('right-page-content');

  document.querySelectorAll('.nav-item, .mobile-pill').forEach(el => {
    const isActive = el.getAttribute('data-target') === targetId;
    el.classList.toggle('active', isActive);

    if (isActive && el.classList.contains('mobile-pill')) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });

  const eyebrow = document.getElementById('paperEyebrow');
  if (eyebrow && meta) {
    eyebrow.textContent = `Раздел ${meta.num} из ${String(SECTIONS.length).padStart(2, '0')} — ${meta.label}`;
  }

  const html = await loadSection(targetId);

  if (prefersReducedMotion) {
    container.innerHTML = html;
    currentIndex = targetIndex;
    isFlipping = false;
    return;
  }

  container.classList.remove('flip-in-up-start', 'flip-in-down-start');
  container.classList.add(goingForward ? 'flip-out-up' : 'flip-out-down');

  await waitForTransitionEnd(container, 'transform', 360);

  container.innerHTML = html;
  currentIndex = targetIndex;

  container.classList.remove('flip-out-up', 'flip-out-down');
  container.classList.add(goingForward ? 'flip-in-up-start' : 'flip-in-down-start');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      container.classList.remove('flip-in-up-start', 'flip-in-down-start');
    });
  });

  await waitForTransitionEnd(container, 'transform', 400);
  isFlipping = false;
}

function initNavigation() {
  document.querySelectorAll('.nav-item, .mobile-pill').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.getAttribute('data-target')));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  switchPage('page1');
});
