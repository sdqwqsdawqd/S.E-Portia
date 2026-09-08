const SECTIONS = [
  { id: 'page1', num: '01', label: 'О отделе' },
  { id: 'page2', num: '02', label: 'Правила' },
  { id: 'page3', num: '03', label: 'Норма отдела' },
  { id: 'page4', num: '04', label: 'Повышения' },
  { id: 'page5', num: '05', label: 'Логи' },
  { id: 'page6', num: '06', label: 'Информация' },
];

const sectionCache = {};

async function loadSection(targetId) {
  if (sectionCache[targetId]) {
    return sectionCache[targetId];
  }
  const res = await fetch(`sections/${targetId}.html`);
  const html = await res.text();
  sectionCache[targetId] = html;
  return html;
}

function closeMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const toggle = document.getElementById('mobileToggle');
  if (menu) menu.classList.remove('open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

async function switchPage(targetId) {
  const meta = SECTIONS.find(s => s.id === targetId);

  document.querySelectorAll('.nav-item, .mobile-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-target') === targetId);
  });

  const eyebrow = document.getElementById('paperEyebrow');
  if (eyebrow && meta) {
    eyebrow.textContent = `Раздел ${meta.num} из ${String(SECTIONS.length).padStart(2, '0')} — ${meta.label}`;
  }

  const mobileCurrent = document.getElementById('mobileCurrent');
  if (mobileCurrent && meta) {
    mobileCurrent.textContent = meta.label;
  }

  const container = document.getElementById('right-page-content');
  const html = await loadSection(targetId);
  container.innerHTML = html;

  // перезапуск анимации появления
  container.classList.remove('fade-in');
  void container.offsetWidth;
  container.classList.add('fade-in');

  closeMobileMenu();
}

function initNavigation() {
  document.querySelectorAll('.nav-item, .mobile-item').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.getAttribute('data-target')));
  });

  const toggle = document.getElementById('mobileToggle');
  const menu = document.getElementById('mobileMenu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  switchPage('page1');
});
