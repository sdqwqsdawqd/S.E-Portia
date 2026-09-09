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

  if (sectionCache[targetId]) return sectionCache[targetId];

  const response = await fetch(`sections/${targetId}.html`);
  if (!response.ok) throw new Error(`Не удалось загрузить ${targetId}`);

  const html = await response.text();
  sectionCache[targetId] = html;
  return html;
}

/* Паук живёт в самом списке: код одинаков для ПК и мобильной панели. */
class SpiderWalker {
  constructor(container, itemSelector) {
    this.container = container;
    this.itemSelector = itemSelector;
    this.currentTarget = null;
    this.animationFrame = null;
    this.runId = 0;
    this.lastPrintAt = -Infinity;
    this.printIndex = 0;
    this.legStep = 0;
    this.lastPoint = null;
    this.legOrder = [0, 5, 2, 7, 4, 1, 6, 3];
    this.legDelays = [120, 90, 145, 105, 130, 85, 155, 100];

    this.layer = document.createElement('span');
    this.layer.className = 'spider-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.layer);

    this.prints = Array.from({ length: 32 }, () => {
      const print = document.createElement('span');
      print.className = 'spider-print';
      print.innerHTML = '<i></i>';
      this.layer.appendChild(print);
      return print;
    });

    this.resizeLayer();
    window.addEventListener('resize', () => this.resizeLayer());
  }

  resizeLayer() {
    this.layer.style.width = `${Math.max(this.container.scrollWidth, this.container.clientWidth)}px`;
  }

  items() {
    return Array.from(this.container.querySelectorAll(this.itemSelector));
  }

  itemIndex(targetId) {
    return this.items().findIndex((item) => item.dataset.target === targetId);
  }

  wanderPoint(item, progress) {
    const containerRect = this.container.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    const left = rect.left - containerRect.left + this.container.scrollLeft;
    const top = rect.top - containerRect.top + this.container.scrollTop;
    const width = rect.width;
    const height = rect.height;
    const phase = progress * Math.PI * 2;
    const xRatio = 0.5 + Math.sin(phase * 1.07 + 0.8) * 0.25 + Math.sin(phase * 2.41 + 2.2) * 0.1;
    const yRatio = 0.5 + Math.cos(phase * 1.43 + 1.6) * 0.2 + Math.sin(phase * 3.17 + 0.5) * 0.08;
    const x = left + Math.max(12, width * 0.12) + Math.min(Math.max(xRatio, 0.08), 0.92) * Math.max(width - Math.max(24, width * 0.24), 1);
    const y = top + Math.max(7, height * 0.2) + Math.min(Math.max(yRatio, 0.1), 0.9) * Math.max(height - Math.max(14, height * 0.4), 1);
    return { x, y };
  }

  legPoint(point, leg) {
    const footprints = [
      { forward: 6, sideways: -10 }, { forward: 6, sideways: 10 },
      { forward: 2, sideways: -7 }, { forward: 2, sideways: 7 },
      { forward: -2, sideways: -7 }, { forward: -2, sideways: 7 },
      { forward: -6, sideways: -10 }, { forward: -6, sideways: 10 },
    ];
    const offset = footprints[leg];
    const heading = ((point.angle || 0) - 90) * (Math.PI / 180);
    const forwardX = Math.cos(heading);
    const forwardY = Math.sin(heading);
    const sideX = -forwardY;
    const sideY = forwardX;
    return {
      x: point.x + forwardX * offset.forward + sideX * offset.sideways,
      y: point.y + forwardY * offset.forward + sideY * offset.sideways,
      angle: point.angle,
    };
  }

  dropPrint(point, now) {
    // Лапы касаются поверхности по одной, в диагональной последовательности.
    const stepDelay = this.legDelays[this.legStep];
    if (now - this.lastPrintAt < stepDelay) return;
    this.lastPrintAt = now;
    const leg = this.legOrder[this.legStep];
    this.legStep = (this.legStep + 1) % this.legOrder.length;
    const print = this.prints[this.printIndex];
    this.printIndex = (this.printIndex + 1) % this.prints.length;
    const foot = this.legPoint(point, leg);

    print.classList.remove('is-visible');
    print.style.transition = 'none';
    print.style.transform = `translate(${foot.x}px, ${foot.y}px) rotate(${foot.angle || 0}deg)`;
    void print.offsetWidth;
    print.style.transition = '';
    print.classList.add('is-visible');
  }

  stop() {
    this.runId += 1;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
  }

  startPatrol(targetId) {
    const item = this.items().find((entry) => entry.dataset.target === targetId);
    if (!item) return;

    const runId = this.runId;
    const startedAt = performance.now();
    const patrol = (now) => {
      if (runId !== this.runId) return;
      const point = this.wanderPoint(item, (now - startedAt) / 7800);
      const next = this.wanderPoint(item, (now - startedAt + 40) / 7800);
      point.angle = Math.atan2(next.y - point.y, next.x - point.x) * (180 / Math.PI) + 90;
      this.lastPoint = point;
      this.dropPrint(point, now);
      this.animationFrame = requestAnimationFrame(patrol);
    };
    this.animationFrame = requestAnimationFrame(patrol);
  }

  walkTo(targetId) {
    const items = this.items();
    const destination = items.findIndex((item) => item.dataset.target === targetId);
    if (destination === -1) return;

    this.stop();
    this.resizeLayer();

    if (this.currentTarget === null || this.currentTarget === targetId) {
      this.currentTarget = targetId;
      this.lastPoint = this.wanderPoint(items[destination], 0.05);
      this.startPatrol(targetId);
      return;
    }

    const origin = this.itemIndex(this.currentTarget);
    if (origin === -1) {
      this.currentTarget = targetId;
      this.startPatrol(targetId);
      return;
    }

    // Маршрут проходит через каждую кнопку, но не через их геометрический центр.
    // Так путь получается похожим на блуждание, а не на движение по линейке.
    const direction = destination > origin ? 1 : -1;
    const route = [this.lastPoint || this.wanderPoint(items[origin], 0.23)];
    let order = 1;
    for (let index = origin + direction; ; index += direction) {
      route.push(this.wanderPoint(items[index], 0.17 + order * 0.19));
      if (index === destination) break;
      order += 1;
    }

    const runId = this.runId;
    const startedAt = performance.now();
    const duration = Math.max(620, (route.length - 1) * 470);
    const move = (now) => {
      if (runId !== this.runId) return;

      const rawProgress = Math.min((now - startedAt) / duration, 1);
      const progress = rawProgress * rawProgress * (3 - 2 * rawProgress);
      const scaled = progress * (route.length - 1);
      const segment = Math.min(Math.floor(scaled), route.length - 2);
      const localProgress = scaled - segment;
      const from = route[segment];
      const to = route[segment + 1] || from;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy) || 1;
      const curveDirection = (segment % 2 === 0 ? 1 : -1) * (destination > origin ? 1 : -1);
      const curveSize = Math.min(24, Math.max(8, distance * 0.16)) * curveDirection;
      const normalX = -dy / distance;
      const normalY = dx / distance;
      const arc = 4 * localProgress * (1 - localProgress);
      const x = from.x + dx * localProgress + normalX * curveSize * arc;
      const y = from.y + dy * localProgress + normalY * curveSize * arc;
      const tangentX = dx + normalX * curveSize * 4 * (1 - 2 * localProgress);
      const tangentY = dy + normalY * curveSize * 4 * (1 - 2 * localProgress);
      const angle = Math.atan2(tangentY, tangentX) * (180 / Math.PI) + 90;
      const point = { x, y, angle };

      this.lastPoint = point;
      this.dropPrint(point, now);

      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(move);
        return;
      }

      this.currentTarget = targetId;
      this.startPatrol(targetId);
    };
    this.animationFrame = requestAnimationFrame(move);
  }
}

const spiderWalkers = [];

function initSpiderWalkers() {
  const desktopNavigation = document.querySelector('.nav-list');
  const mobileNavigation = document.querySelector('.mobile-tabs');
  if (desktopNavigation) spiderWalkers.push(new SpiderWalker(desktopNavigation, '.nav-item'));
  if (mobileNavigation) spiderWalkers.push(new SpiderWalker(mobileNavigation, '.mobile-pill'));
}

async function switchPage(targetId) {
  const targetIndex = SECTIONS.findIndex((section) => section.id === targetId);
  if (targetIndex === -1 || targetIndex === currentIndex) return;

  const meta = SECTIONS[targetIndex];
  const content = document.getElementById('right-page-content');
  document.querySelectorAll('.nav-item, .mobile-pill').forEach((button) => {
    const active = button.dataset.target === targetId;
    button.classList.toggle('active', active);
    if (active && button.classList.contains('mobile-pill')) {
      button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });

  spiderWalkers.forEach((walker) => walker.walkTo(targetId));
  document.getElementById('paperSectionNumber').textContent = meta.num;
  document.getElementById('paperEyebrow').textContent = `Раздел ${meta.num} из ${String(SECTIONS.length).padStart(2, '0')} — ${meta.label}`;

  try {
    content.innerHTML = await loadSection(targetId);
    currentIndex = targetIndex;
  } catch (error) {
    console.error('Не удалось загрузить раздел', error);
    content.innerHTML = '<p class="block-text">Не удалось загрузить этот раздел.</p>';
  }
}

function initNavigation() {
  document.querySelectorAll('.nav-item, .mobile-pill').forEach((button) => {
    button.addEventListener('click', () => switchPage(button.dataset.target));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSpiderWalkers();
  switchPage('page1');
});
