const SECTIONS = [
  { id: 'page1', num: '01', label: 'О отделе' },
  { id: 'page2', num: '02', label: 'Правила' },
  { id: 'page3', num: '03', label: 'Норма отдела' },
  { id: 'page4', num: '04', label: 'Повышения' },
  { id: 'page5', num: '05', label: 'Информация' },
  { id: 'page6', num: '06', label: 'Логи' },
];

const sectionCache = {};
let currentIndex = -1;
async function loadSection(targetId) {
  if (typeof SECTION_HTML !== 'undefined' && SECTION_HTML[targetId] !== undefined) {
    return SECTION_HTML[targetId];
  }
  
  if (sectionCache[targetId]) {
    return sectionCache[targetId];
  }
  const res = await fetch(`sections/${targetId}.html`);
  const html = await res.text();
  sectionCache[targetId] = html;
  return html;
}

async function switchPage(targetId) {
  const targetIndex = SECTIONS.findIndex(s => s.id === targetId);
  if (targetIndex === -1 || targetIndex === currentIndex) return;

  const meta = SECTIONS[targetIndex];
  const container = document.getElementById('right-page-content');

  document.querySelectorAll('.nav-item, .mobile-pill').forEach(el => {
    const isActive = el.getAttribute('data-target') === targetId;
    el.classList.toggle('active', isActive);

    if (isActive && el.classList.contains('mobile-pill')) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  });

  const activeItem = document.querySelector(
    `.nav-item[data-target="${targetId}"]`
  );

  updateSpiderTrail(activeItem);

  const eyebrow = document.getElementById('paperEyebrow');
  const sectionNumber = document.getElementById('paperSectionNumber');
  if (sectionNumber && meta) {
    sectionNumber.textContent = meta.num;
  }
  if (eyebrow && meta) {
    eyebrow.textContent = `Раздел ${meta.num} из ${String(SECTIONS.length).padStart(2, '0')} — ${meta.label}`;
  }

  try {
    const html = await loadSection(targetId);
    container.innerHTML = html;
    currentIndex = targetIndex;
  } catch (err) {
    console.error('Не удалось загрузить раздел', targetId, err);
  }
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


function updateSpiderTrail(activeItem) {
  // Удаляем старого паука
  document.querySelectorAll('.spider-trail').forEach(spider => {
    spider.remove();
  });

  // Если активного пункта нет — ничего не делаем
  if (!activeItem) return;

  // Контейнер паука
  const spider = document.createElement('span');
  spider.className = 'spider-trail';
  spider.setAttribute('aria-hidden', 'true');

  spider.innerHTML = `
    <svg viewBox="0 0 30 30">

      <!-- левая верхняя лапа -->
      <path
        class="spider-leg"
        d="M13 12 L7 7 L2 8"
      />

      <!-- левая средняя верхняя -->
      <path
        class="spider-leg"
        d="M12 14 L6 12 L1 13"
      />

      <!-- левая средняя нижняя -->
      <path
        class="spider-leg"
        d="M12 17 L6 18 L2 21"
      />

      <!-- левая нижняя лапа -->
      <path
        class="spider-leg"
        d="M14 19 L9 23 L5 27"
      />

      <!-- правая верхняя лапа -->
      <path
        class="spider-leg"
        d="M17 12 L23 7 L28 8"
      />

      <!-- правая средняя верхняя -->
      <path
        class="spider-leg"
        d="M18 14 L24 12 L29 13"
      />

      <!-- правая средняя нижняя -->
      <path
        class="spider-leg"
        d="M18 17 L24 18 L28 21"
      />

      <!-- правая нижняя лапа -->
      <path
        class="spider-leg"
        d="M16 19 L21 23 L25 27"
      />

      <!-- тело -->
      <ellipse
        class="spider-body"
        cx="15"
        cy="15"
        rx="4"
        ry="5"
      />

      <!-- глаза -->
      <circle
        class="spider-eye"
        cx="13.5"
        cy="13"
        r="0.8"
      />

      <circle
        class="spider-eye"
        cx="16.5"
        cy="13"
        r="0.8"
      />

    </svg>
  `;

  activeItem.appendChild(spider);
}