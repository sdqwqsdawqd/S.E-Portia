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


class PawWalker {
  constructor(container, itemSelector) {
    this.container = container;
    this.itemSelector = itemSelector;
    this.currentTarget = null;

    this.idleDots = this._createDotPool(5, 'idle-dot');
    this.trailDots = this._createDotPool(8, 'trail-dot');
    this._trailPoolIndex = 0;

    this.idleRAF = null;
    this.transitionRAF = null;


  _createDotPool(count, extraClass) {
    const dots = [];
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('span');
      dot.className = `paw-dot ${extraClass}`;
      dot.setAttribute('aria-hidden', 'true');
      this.container.appendChild(dot);
      dots.push(dot);
    }
    return dots;
  }

  _items() {
    return Array.from(this.container.querySelectorAll(this.itemSelector));
  }

  _findIndex(items, targetId) {
    return items.findIndex(el => el.getAttribute('data-target') === targetId);
  }

  
  _perimeterPoints(item, n) {
    const cRect = this.container.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    const pad = 3;
    const x0 = r.left - cRect.left + this.container.scrollLeft + pad;
    const y0 = r.top - cRect.top + this.container.scrollTop + pad;
    const w = Math.max(r.width - pad * 2, 1);
    const h = Math.max(r.height - pad * 2, 1);
    const perimeter = 2 * (w + h);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const d = (perimeter * i) / n;
      let x, y;
      if (d < w) {
        x = x0 + d; y = y0;
      } else if (d < w + h) {
        x = x0 + w; y = y0 + (d - w);
      } else if (d < w + w + h) {
        x = x0 + w - (d - w - h); y = y0 + h;
      } else {
        x = x0; y = y0 + h - (d - w - h - w);
      }
      pts.push({ x, y });
    }
    return pts;
  }

  _stopIdle() {
    if (this.idleRAF) cancelAnimationFrame(this.idleRAF);
    this.idleRAF = null;
    this.idleDots.forEach(dot => { dot.style.opacity = '0'; });
  }

  _stopTransition() {
    if (this.transitionRAF) cancelAnimationFrame(this.transitionRAF);
    this.transitionRAF = null;
  }

  // Спокойный бесконечный обход следами контура активной кнопки
  _startIdle(item) {
    this._stopIdle();
    const dotCount = this.idleDots.length;
    const pointsPerLap = 32;
    const msPerLap = 4200; // нормальный, неторопливый темп
    let start = null;

    const step = (ts) => {
      if (!start) start = ts;
      const elapsed = ts - start;
      const pts = this._perimeterPoints(item, pointsPerLap);
      const phase = (elapsed % msPerLap) / msPerLap;

      for (let k = 0; k < dotCount; k++) {
        const localPhase = (phase + k / dotCount) % 1;
        const idx = Math.floor(localPhase * pts.length) % pts.length;
        const pt = pts[idx];
        const dot = this.idleDots[k];
        dot.style.opacity = String(0.85 - (k / dotCount) * 0.6);
        dot.style.transform = `translate(${pt.x}px, ${pt.y}px)`;
      }

      this.idleRAF = requestAnimationFrame(step);
    };

    this.idleRAF = requestAnimationFrame(step);
  }

  _nextTrailDot() {
    const dot = this.trailDots[this._trailPoolIndex];
    this._trailPoolIndex = (this._trailPoolIndex + 1) % this.trailDots.length;
    return dot;
  }

  _dropFootprint(x, y) {
    const dot = this._nextTrailDot();
    dot.style.transition = 'none';
    dot.style.opacity = '0.9';
    dot.style.transform = `translate(${x}px, ${y}px)`;
    // форсируем перерасчёт стилей, чтобы transition сработал заново
    // eslint-disable-next-line no-unused-expressions
    dot.offsetHeight;
    dot.style.transition = 'opacity 0.55s ease';
    dot.style.opacity = '0';
  }

  async goTo(targetId) {
    const items = this._items();
    const targetIdx = this._findIndex(items, targetId);
    if (targetIdx === -1) return;

    this._stopIdle();
    this._stopTransition();

    if (!this.currentTarget) {
      this.currentTarget = targetId;
      this._startIdle(items[targetIdx]);
      return;
    }

    const currentIdx = this._findIndex(items, this.currentTarget);
    if (currentIdx === -1 || currentIdx === targetIdx) {
      this.currentTarget = targetId;
      this._startIdle(items[targetIdx]);
      return;
    }

    // Собираем центры всех кнопок между текущей и целевой (включительно) —
    // паук пройдёт через каждую из них по очереди, сколько бы рядов ни было.
    // Как и в _perimeterPoints, прибавляем scroll контейнера, так как
    // точки-следы позиционируются в координатах содержимого.
    const cRect = this.container.getBoundingClientRect();
    const scrollLeft = this.container.scrollLeft;
    const scrollTop = this.container.scrollTop;
    const step = currentIdx < targetIdx ? 1 : -1;
    const centers = [];
    for (let i = currentIdx; ; i += step) {
      const r = items[i].getBoundingClientRect();
      centers.push({
        x: r.left - cRect.left + scrollLeft + r.width / 2,
        y: r.top - cRect.top + scrollTop + r.height / 2,
      });
      if (i === targetIdx) break;
    }

    const totalSegments = centers.length - 1;
    const msPerSegment = 260; // нормальная скорость, без спешки
    const totalMs = totalSegments * msPerSegment;
    const spawnEveryMs = 55;

    await new Promise(resolve => {
      let start = null;
      let lastSpawn = -Infinity;

      const frame = (ts) => {
        if (!start) start = ts;
        const elapsed = ts - start;
        const t = Math.min(elapsed / totalMs, 1);
        const segFloat = t * totalSegments;
        const segIdx = Math.min(Math.floor(segFloat), totalSegments - 1);
        const segT = segFloat - segIdx;
        const a = centers[segIdx];
        const b = centers[segIdx + 1] || a;
        const x = a.x + (b.x - a.x) * segT;
        const y = a.y + (b.y - a.y) * segT;

        if (elapsed - lastSpawn >= spawnEveryMs) {
          lastSpawn = elapsed;
          this._dropFootprint(x, y);
        }

        if (t < 1) {
          this.transitionRAF = requestAnimationFrame(frame);
        } else {
          resolve();
        }
      };

      this.transitionRAF = requestAnimationFrame(frame);
    });

    this.currentTarget = targetId;
    this._startIdle(items[targetIdx]);
  }
}

const pawWalkers = [];

function initPawWalkers() {
  const desktopNav = document.querySelector('.nav-list');
  const mobileNav = document.querySelector('.mobile-tabs');

  if (desktopNav) pawWalkers.push(new PawWalker(desktopNav, '.nav-item'));
  if (mobileNav) pawWalkers.push(new PawWalker(mobileNav, '.mobile-pill'));
}

/* ============ ПЕРЕКЛЮЧЕНИЕ РАЗДЕЛОВ ============ */

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

  // Следы паука переползают к новой активной кнопке независимо от
  // загрузки контента
  pawWalkers.forEach(walker => walker.goTo(targetId));

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
  initPawWalkers();
  switchPage('page1');
});
