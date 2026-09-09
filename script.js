const SECTIONS = [
  { id: 'page1', num: '01', label: 'О отделе' },
  { id: 'page2', num: '02', label: 'Правила' },
  { id: 'page3', num: '03', label: 'Норма отдела' },
  { id: 'page4', num: '04', label: 'Повышения и иерархия' },
  { id: 'page5', num: '05', label: 'Квалиф. проверки' },
  { id: 'page6', num: '06', label: 'Информация' },
  { id: 'page7', num: '07', label: 'Логи' },
  { id: 'page8', num: '08', label: 'История руководства' },
];

// Идентификатор листа всегда равен его номеру; ниже указан файл с его содержимым.
const SECTION_FILES = {
  page5: 'page7',
  page6: 'page5',
  page7: 'page6',
};

const sectionCache = {};
let currentIndex = -1;
let idleWebTimer = null;

const SVG_NS = 'http://www.w3.org/2000/svg';
const IDLE_WEB_DELAY = 16000;

function makeSvgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function addButtonWebs() {
  document.querySelectorAll('.nav-item, .mobile-pill').forEach((button) => {
    const web = makeSvgElement('svg', {
      class: 'button-web', viewBox: '0 0 220 58', preserveAspectRatio: 'none', 'aria-hidden': 'true',
    });
    // Угловые фрагменты сети оставляют подпись кнопки читаемой.
    [
      'M4 55 C12 37 18 20 29 4 M4 55 C21 47 38 40 57 37 M4 55 C24 55 43 54 64 50',
      'M12 39 C26 34 39 33 51 35 M8 48 C26 45 42 45 60 48',
      'M216 3 C208 21 202 38 191 54 M216 3 C199 11 182 18 163 21 M216 3 C196 3 177 4 156 8',
      'M208 19 C194 24 181 25 169 23 M212 10 C194 13 178 13 160 10',
    ].forEach((d) => web.appendChild(makeSvgElement('path', { d })));
    [[4, 55], [29, 4], [216, 3], [191, 54]].forEach(([cx, cy]) => {
      web.appendChild(makeSvgElement('circle', { cx, cy, r: 1.45 }));
    });
    button.appendChild(web);
  });
}

function addNavigationWeb(container, itemSelector) {
  const web = makeSvgElement('svg', { class: 'nav-web', 'aria-hidden': 'true' });
  container.prepend(web);

  const redraw = () => {
    const items = Array.from(container.querySelectorAll(itemSelector));
    const horizontal = container.classList.contains('mobile-tabs');
    const span = horizontal ? Math.max(container.scrollWidth, container.clientWidth) : container.clientWidth;
    const length = horizontal ? container.clientHeight : container.scrollHeight;
    web.setAttribute('width', span);
    web.setAttribute('height', length);
    web.setAttribute('viewBox', `0 0 ${span} ${length}`);
    web.replaceChildren();

    for (let index = 0; index < items.length - 1; index += 1) {
      const from = items[index];
      const to = items[index + 1];
      const start = horizontal
        ? { x: from.offsetLeft + from.offsetWidth * 0.72, y: from.offsetTop + from.offsetHeight * 0.38 }
        : { x: from.offsetLeft + 22, y: from.offsetTop + from.offsetHeight * 0.68 };
      const end = horizontal
        ? { x: to.offsetLeft + to.offsetWidth * 0.28, y: to.offsetTop + to.offsetHeight * 0.62 }
        : { x: to.offsetLeft + 22, y: to.offsetTop + to.offsetHeight * 0.32 };
      const middle = horizontal
        ? { x: (start.x + end.x) / 2, y: start.y + (index % 2 ? -13 : 13) }
        : { x: start.x + (index % 2 ? -14 : 14), y: (start.y + end.y) / 2 };
      const path = horizontal
        ? `M ${start.x} ${start.y} Q ${middle.x} ${middle.y} ${end.x} ${end.y}`
        : `M ${start.x} ${start.y} Q ${middle.x} ${middle.y} ${end.x} ${end.y}`;
      web.appendChild(makeSvgElement('path', { d: path }));
      web.appendChild(makeSvgElement('path', {
        d: horizontal
          ? `M ${start.x} ${start.y} L ${middle.x} ${middle.y} L ${end.x} ${end.y}`
          : `M ${start.x - 9} ${start.y} L ${middle.x} ${middle.y} L ${end.x + 9} ${end.y}`,
      }));
      web.appendChild(makeSvgElement('circle', {
        class: 'web-knot', cx: middle.x, cy: middle.y, r: 1.35,
      }));
    }
  };

  redraw();
  window.addEventListener('resize', redraw);
}

function scheduleIdleWeb(targetId) {
  window.clearTimeout(idleWebTimer);
  document.querySelectorAll('.nav-item, .mobile-pill').forEach((button) => {
    if (button.classList.contains('web-covered')) {
      button.classList.remove('web-covered');
      button.classList.add('web-dissolving');
      window.setTimeout(() => button.classList.remove('web-dissolving'), 760);
    }
  });

  idleWebTimer = window.setTimeout(() => {
    document.querySelectorAll('.nav-item, .mobile-pill').forEach((button) => {
      if (button.dataset.target === targetId) {
        button.classList.remove('web-dissolving');
        button.classList.add('web-covered');
      }
    });
  }, IDLE_WEB_DELAY);
}

async function loadSection(targetId) {
  if (typeof SECTION_HTML !== 'undefined' && SECTION_HTML[targetId] !== undefined) {
    return SECTION_HTML[targetId];
  }

  if (sectionCache[targetId]) return sectionCache[targetId];

  const fileId = SECTION_FILES[targetId] || targetId;
  const response = await fetch(`sections/${fileId}.html`);
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
  if (desktopNavigation) {
    addNavigationWeb(desktopNavigation, '.nav-item');
    spiderWalkers.push(new SpiderWalker(desktopNavigation, '.nav-item'));
  }
  if (mobileNavigation) {
    addNavigationWeb(mobileNavigation, '.mobile-pill');
    spiderWalkers.push(new SpiderWalker(mobileNavigation, '.mobile-pill'));
  }
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
  scheduleIdleWeb(targetId);
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
  addButtonWebs();
  initSpiderWalkers();
  switchPage('page1');
});
