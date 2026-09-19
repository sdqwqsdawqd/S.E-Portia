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
let navigationRevision = 0;
let idleWebTimer = null;
let secretGame = null;
let secretGameReturnPage = 'page7';
let secretPlayerName = '';

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
    if (!item || !this.container.getClientRects().length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
let paperTurn = null;

function captureCurrentSheet() {
  const paper = document.querySelector('.paper');
  if (!paper) return null;

  const sheet = document.createElement('div');
  sheet.className = 'paper-turn-sheet';
  Array.from(paper.children)
    .filter((child) => !child.classList.contains('paper-turn-sheet'))
    .forEach((child) => sheet.appendChild(child.cloneNode(true)));

  sheet.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  sheet.setAttribute('aria-hidden', 'true');
  sheet.inert = true;
  return { sheet, height: paper.offsetHeight };
}

function turnPaper(snapshot, direction) {
  paperTurn?.cancel();
  document.querySelectorAll('.paper-turn-sheet').forEach((sheet) => sheet.remove());
  if (!snapshot) return;

  const paper = document.querySelector('.paper');
  const { sheet, height } = snapshot;
  const lockedHeight = Math.max(height, paper.offsetHeight);

  sheet.style.height = `${height}px`;
  paper.style.minHeight = `${lockedHeight}px`;
  paper.classList.add('is-turning');
  paper.appendChild(sheet);

  let fallbackTimer;
  const animation = { cancel: () => finish() };
  const finish = () => {
    window.clearTimeout(fallbackTimer);
    sheet.removeEventListener('animationend', onAnimationEnd);
    sheet.remove();
    if (paperTurn !== animation) return;
    paper.classList.remove('is-turning');
    paper.style.minHeight = '';
    paperTurn = null;
  };
  const onAnimationEnd = (event) => {
    if (event.target === sheet) finish();
  };
  paperTurn = animation;
  sheet.addEventListener('animationend', onAnimationEnd);
  sheet.classList.add(direction > 0 ? 'paper-turn-up' : 'paper-turn-down');
  fallbackTimer = window.setTimeout(finish, 850);
}

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
  if (secretGame) closeSecretGame(false);
  const targetIndex = SECTIONS.findIndex((section) => section.id === targetId);
  if (targetIndex === -1 || targetIndex === currentIndex) return;

  const revision = ++navigationRevision;
  const direction = targetIndex > currentIndex ? 1 : -1;
  const previousSheet = currentIndex >= 0
    ? captureCurrentSheet() : null;
  const meta = SECTIONS[targetIndex];
  const content = document.getElementById('right-page-content');
  document.querySelectorAll('.nav-item, .mobile-pill').forEach((button) => {
    const active = button.dataset.target === targetId;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    if (active && button.classList.contains('mobile-pill')) {
      button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });

  spiderWalkers.forEach((walker) => walker.walkTo(targetId));
  scheduleIdleWeb(targetId);

  try {
    const html = await loadSection(targetId);
    if (revision !== navigationRevision || secretGame) return;
    document.getElementById('paperSectionNumber').textContent = meta.num;
    document.getElementById('paperEyebrow').textContent = `Раздел ${meta.num} из ${String(SECTIONS.length).padStart(2, '0')} — ${meta.label}`;
    content.innerHTML = html;
    turnPaper(previousSheet, direction);
    currentIndex = targetIndex;
  } catch (error) {
    if (revision !== navigationRevision || secretGame) return;
    console.error('Не удалось загрузить раздел', error);
    content.innerHTML = '<p class="block-text">Не удалось загрузить этот раздел.</p>';
  }
}

// Decode once; firing never seeks or restarts an HTML media element.
const gameAudio = {
  context: null, buffers: [], loading: null,
  unlock() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      this.context ||= new Audio({ latencyHint: 'interactive' });
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      if (!this.loading) this.loading = Promise.all(
        ['assets/Laser-shot1.mp3', 'assets/laser-shot2.mp3'].map(async (url) => {
          const response = await fetch(url);
          if (!response.ok) return;
          const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
          this.buffers.push(buffer);
        })
      ).catch(() => {});
    } catch { /* Audio is optional; gameplay remains available. */ }
  },
  play() {
    if (this.context?.state !== 'running' || !this.buffers.length) return;
    try {
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      gain.gain.value = 0.28;
      source.buffer = this.buffers[Math.floor(Math.random() * this.buffers.length)];
      source.connect(gain).connect(this.context.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start();
    } catch { /* Never interrupt a frame for unavailable audio. */ }
  },
};

class SecretShooter {
  constructor(canvas, scoreElement, bestElement, statusElement, playerName) {
    Object.assign(this, { canvas, scoreElement, bestElement, statusElement, playerName });
    this.context = canvas.getContext('2d');
    this.events = new AbortController();
    this.keys = new Set();
    this.pointers = new Map();
    this.bullets = [];
    this.enemies = [];
    this.particles = [];
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.stars = Array.from({ length: 36 }, () => ({ x: Math.random(), y: Math.random(), speed: 0.18 + Math.random() * 0.48 }));
    this.score = 0;
    this.best = 0;
    try { this.best = Number(localStorage.getItem('portia-secret-shooter-best')) || 0; } catch {}
    this.elapsed = 0;
    this.lastShot = -340;
    this.shotRequested = false;
    this.spawnClock = 0;
    this.flash = 0;
    this.lastFrame = performance.now();
    this.running = true;
    this.player = { x: 0.5, y: 0.84, width: 0.1 };
    this.weapon = new Image();
    this.enemyImage = new Image();
    this.weapon.src = 'assets/pistol-minigame.png';
    this.enemyImage.src = 'assets/uru-minigame.png';
    this.frame = this.frame.bind(this);
    const action = (event) => {
      if (event.code === 'KeyA' || ['a', 'ф', 'arrowleft'].includes(event.key.toLowerCase())) return 'left';
      if (event.code === 'KeyD' || ['d', 'в', 'arrowright'].includes(event.key.toLowerCase())) return 'right';
      if (event.code === 'Space' || event.key === ' ') return 'fire';
    };
    this.listen(window, 'keydown', (event) => {
      if (event.target.closest?.('input, textarea, select, button, [contenteditable="true"]')) return;
      const key = action(event);
      if (!key) return;
      event.preventDefault();
      this.keys.add(key);
      if (!event.repeat) gameAudio.unlock();
      if (key === 'fire' && !event.repeat) this.requestShot();
    });
    this.listen(window, 'keyup', (event) => { const key = action(event); if (key) this.keys.delete(key); });
    const reset = () => { this.keys.clear(); this.pointers.clear(); this.shotRequested = false; this.lastFrame = performance.now(); };
    this.listen(window, 'blur', reset);
    this.listen(document, 'visibilitychange', reset);
    this.attachControls();
    this.resize();
    this.listen(window, 'resize', () => this.resize());
    this.bestElement.textContent = this.best;
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  listen(target, event, handler) { target.addEventListener(event, handler, { signal: this.events.signal }); }

  attachControls() {
    document.querySelectorAll('[data-game-control]').forEach((control) => {
      const key = { ArrowLeft: 'left', ArrowRight: 'right', fire: 'fire' }[control.dataset.gameControl];
      this.listen(control, 'pointerdown', (event) => {
        event.preventDefault();
        if (!this.running) return;
        control.setPointerCapture?.(event.pointerId);
        this.pointers.set(event.pointerId, key);
        gameAudio.unlock();
        if (key === 'fire') this.requestShot();
      });
      const release = (event) => this.pointers.delete(event.pointerId);
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((event) => this.listen(control, event, release));
      this.listen(control, 'click', (event) => {
        if (event.detail === 0 && key === 'fire') { gameAudio.unlock(); this.requestShot(); }
      });
      this.listen(control, 'contextmenu', (event) => event.preventDefault());
    });
  }

  requestShot() {
    if (!this.running || this.shotRequested || this.elapsed - this.lastShot < 280) return;
    this.shotRequested = true;
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
    this.canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = bounds.width;
    this.height = bounds.height;
    this.background = this.context.createLinearGradient(0, 0, 0, this.height);
    this.background.addColorStop(0, '#061311');
    this.background.addColorStop(1, '#102624');
  }

  frame(now) {
    if (!this.running) return;
    const delta = document.hidden ? 0 : Math.max(0, Math.min(now - this.lastFrame, 40));
    this.lastFrame = now;
    this.elapsed += delta;
    // Smooth ramp over two minutes, capped so late runs stay playable.
    const difficulty = 1 - Math.exp(-this.elapsed / 65000);
    const held = (key) => this.keys.has(key) || [...this.pointers.values()].includes(key);
    this.player.x += ((held('right') ? 1 : 0) - (held('left') ? 1 : 0)) * delta * 0.00062;
    this.player.x = Math.max(0.07, Math.min(0.93, this.player.x));
    if (this.shotRequested && delta > 0) {
      this.bullets.push({ x: this.player.x, y: this.player.y - 0.07 });
      this.lastShot = this.elapsed;
      this.shotRequested = false;
      this.flash = 90;
      gameAudio.play();
    }
    this.flash = Math.max(0, this.flash - delta);
    this.spawnClock += delta;
    const rest = this.elapsed % 24000 > 20500;
    const spawnInterval = (1050 - difficulty * 590) * (rest ? 1.65 : 1);
    if (this.spawnClock >= spawnInterval && this.enemies.length < 12) {
      // Nearby lanes limit impossible cross-screen trips, especially on phones.
      const anchor = this.enemies.at(-1)?.x ?? this.player.x;
      const x = Math.max(0.1, Math.min(0.9, anchor + (Math.random() - 0.5) * 0.65));
      this.enemies.push({ x, y: -0.1, speed: 0.00019 + difficulty * 0.00011, size: 0.10 });
      this.spawnClock = 0;
    }
    this.bullets.forEach((bullet) => { bullet.y -= delta * 0.001; });
    this.bullets = this.bullets.filter((bullet) => bullet.y > -0.08);
    this.enemies.forEach((enemy) => { enemy.y += enemy.speed * delta; });
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      const hit = this.bullets.findIndex((bullet) => Math.abs(bullet.x - enemy.x) < enemy.size * 0.58 && Math.abs(bullet.y - enemy.y) < enemy.size * this.width / this.height * 0.58 + 0.015);
      if (hit !== -1) {
        this.bullets.splice(hit, 1);
        this.enemies.splice(index, 1);
        if (!this.reducedMotion) for (let i = 0; i < 8 && this.particles.length < 64; i++) {
          const angle = Math.PI * 2 * i / 8;
          this.particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 0.00012, vy: Math.sin(angle) * 0.00012, life: 400 });
        }
        this.score += 10;
        this.scoreElement.textContent = this.score;
        if (this.score > this.best) { this.best = this.score; this.bestElement.textContent = this.best; }
        continue;
      }
      if (enemy.y > 1.08 || (Math.abs(enemy.x - this.player.x) < enemy.size * 0.62 && Math.abs(enemy.y - this.player.y) < enemy.size * 0.68)) {
        this.end();
        break;
      }
    }
    this.particles.forEach((p) => { p.life -= delta; p.x += p.vx * delta; p.y += p.vy * delta; });
    this.particles = this.particles.filter((p) => p.life > 0);
    this.draw(difficulty, delta);
    if (this.running) this.animationFrame = requestAnimationFrame(this.frame);
  }
  draw(difficulty, delta) {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = 'rgba(108, 230, 205, .52)';
    this.stars.forEach((star) => {
      star.y += star.speed * (1 + difficulty * 0.25) * delta * 0.00018;
      if (star.y > 1) { star.y = 0; star.x = Math.random(); }
      ctx.fillRect(star.x * this.width, star.y * this.height, 1.5, 1.5);
    });
    ctx.fillStyle = '#64ead0';
    this.bullets.forEach((bullet) => {
      ctx.fillRect(bullet.x * this.width - 2, bullet.y * this.height - 9, 4, 13);
    });
    this.enemies.forEach((enemy) => {
      const size = enemy.size * this.width;
      if (this.enemyImage.complete && this.enemyImage.naturalWidth) ctx.drawImage(this.enemyImage, enemy.x * this.width - size / 2, enemy.y * this.height - size / 2, size, size);
    });
    this.particles.forEach((p) => {
      ctx.globalAlpha = p.life / 400;
      ctx.fillStyle = '#a1ffe9';
      ctx.fillRect(p.x * this.width, p.y * this.height, 3, 3);
    });
    ctx.globalAlpha = 1;
    if (this.flash > 0 && !this.reducedMotion) {
      ctx.fillStyle = `rgba(195,255,231,${this.flash / 110})`;
      ctx.beginPath();
      ctx.arc(this.player.x * this.width, (this.player.y - 0.07) * this.height, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    const gunWidth = this.width * 0.11;
    const gunHeight = gunWidth * 1.9;
    if (this.weapon.complete && this.weapon.naturalWidth) ctx.drawImage(this.weapon, this.player.x * this.width - gunWidth / 2, this.player.y * this.height - gunHeight / 2, gunWidth, gunHeight);
  }

  persistBest() { try { localStorage.setItem('portia-secret-shooter-best', String(this.best)); } catch {} }

  end() {
    if (!this.running) return;
    this.running = false;
    this.persistBest();
    this.statusElement.hidden = false;
    this.statusElement.querySelector('[data-final-score]').textContent = this.score;
    if (this.score > 0 && window.PortiaRanking) {
      window.PortiaRanking.saveScore(this.playerName, this.score)
        .then(() => renderLeaderboard(this.statusElement.closest('.secret-game')))
        .catch((error) => console.warn('Не удалось обновить рейтинг', error));
    }
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
    this.events.abort();
    this.pointers.clear();
    this.keys.clear();
    this.persistBest();
  }
}

function renderLeaderboard(game) {
  const list = game?.querySelector('[data-ranking-list]');
  if (!list) return;
  if (!window.PortiaRanking) {
    list.innerHTML = '<li>Подключение к рейтингу…</li>';
    return;
  }
  window.PortiaRanking.getTopScores().then((scores) => {
    list.replaceChildren();
    if (!scores.length) {
      list.innerHTML = '<li>Пока нет результатов.</li>';
      return;
    }
    scores.forEach((entry, index) => {
      const item = document.createElement('li');
      const player = document.createElement('span');
      const score = document.createElement('b');
      player.textContent = `${index + 1}. ${entry.nickname}`;
      score.textContent = String(entry.score);
      item.append(player, score);
      list.appendChild(item);
    });
  }).catch(() => { list.innerHTML = '<li>Рейтинг временно недоступен.</li>'; });
}

function openSecretGame(restart = false) {
  if (secretGame) return;
  const currentName = window.PortiaRanking?.getName() || localStorage.getItem('portia-secret-shooter-name') || '';
  if (!restart) {
    if (document.querySelector('.game-name-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'game-name-dialog';
    dialog.innerHTML = '<form><h2>PORTIA DEFENSE</h2><label for="game-player-name">Ник для общего рейтинга</label><input id="game-player-name" name="nickname" maxlength="16" required autocomplete="nickname"><div><button type="button" data-cancel>Отмена</button><button type="submit">Играть</button></div></form>';
    const input = dialog.querySelector('input');
    input.value = currentName;
    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const name = input.value.replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().slice(0, 16);
      if (!name) { input.setCustomValidity('Введите буквы или цифры'); input.reportValidity(); return; }
      secretPlayerName = name;
      dialog.close();
      openSecretGame(true);
    });
    input.addEventListener('input', () => input.setCustomValidity(''));
    document.body.appendChild(dialog);
    dialog.showModal();
    input.focus();
    return;
  }
  const requestedName = secretPlayerName;
  const playerName = String(requestedName || '').replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().slice(0, 16);
  if (!playerName) return;
  gameAudio.unlock();
  spiderWalkers.forEach((walker) => walker.stop());
  secretPlayerName = playerName;
  localStorage.setItem('portia-secret-shooter-name', playerName);
  window.PortiaRanking?.setName(playerName);
  secretGameReturnPage = SECTIONS[currentIndex]?.id || 'page7';
  const content = document.getElementById('right-page-content');
  document.getElementById('paperSectionNumber').textContent = '??';
  document.getElementById('paperEyebrow').textContent = 'Мини игра — PORTIA DEFENSE';
  content.innerHTML = `<section class="secret-game" aria-label="Секретная игра">
    <div class="game-heading"><div><span class="game-kicker">CLASSIFIED // MINI-GAME</span><h2>PORTIA DEFENSE</h2></div><button type="button" class="game-exit" data-close-secret-game>Выйти ×</button></div>
    <div class="game-scoreboard"><span>ИГРОК <b>${secretPlayerName}</b></span><span>ОЧКИ <b data-game-score>0</b></span><span>РЕКОРД <b data-game-best>0</b></span></div>
    <div class="game-stage"><canvas data-game-canvas aria-label="Игровое поле"></canvas><div class="game-over" data-game-over hidden><p>ПОРТИИ БОЛЬШЕ НЕТ</p><span>Очки: <b data-final-score>0</b></span><button type="button" data-restart-secret-game>Ещё попытка</button></div></div>
    <div class="game-controls"><button type="button" data-game-control="ArrowLeft" aria-label="Влево">←</button><button type="button" data-game-control="fire" aria-label="Огонь">ОГОНЬ</button><button type="button" data-game-control="ArrowRight" aria-label="Вправо">→</button></div>
    <p class="game-hint">← / → · A / D · Ф / В — движение · ПРОБЕЛ — огонь · держитесь хлопчики! U.R.U наступает!</p>
    <section class="game-ranking" aria-label="Общий рейтинг"><h3>ОБЩИЙ РЕЙТИНГ // TOP 10</h3><ol data-ranking-list><li>Загрузка рейтинга…</li></ol></section>
  </section>`;
  secretGame = new SecretShooter(content.querySelector('[data-game-canvas]'), content.querySelector('[data-game-score]'), content.querySelector('[data-game-best]'), content.querySelector('[data-game-over]'), secretPlayerName);
  const gameCanvas = content.querySelector('[data-game-canvas]');
  gameCanvas.tabIndex = 0;
  gameCanvas.focus({ preventScroll: true });
  renderLeaderboard(content.querySelector('.secret-game'));
}

function closeSecretGame(restorePage = true) {
  if (!secretGame) return;
  secretGame.destroy();
  secretGame = null;
  currentIndex = -1;
  if (restorePage) switchPage(secretGameReturnPage);
}

function initNavigation() {
  document.querySelectorAll('.nav-item, .mobile-pill').forEach((button) => {
    button.addEventListener('click', () => switchPage(button.dataset.target));
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-open-secret-game]')) openSecretGame();
    if (event.target.closest('[data-close-secret-game]')) closeSecretGame();
    if (event.target.closest('[data-restart-secret-game]')) {
      secretGame?.destroy();
      secretGame = null;
      openSecretGame(true);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && secretGame) closeSecretGame();
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-open-secret-game]')) openSecretGame();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  addButtonWebs();
  initSpiderWalkers();
  switchPage('page1');
});
