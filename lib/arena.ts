// ───────────────────────────────────────────────────────────────────────────
// Движок игры «Neon Arena» — top-down шутер-выживалка на canvas.
//
//  • Движение: WASD/стрелки или левый тач-стик.
//  • Прицел и огонь: мышь + зажатая ЛКМ (десктоп) или правый тач-стик (телефон).
//  • Враги волнами идут к игроку; пули их убивают, контакт — урон игроку.
//  • Сложность растёт со временем (скорость врагов и частота спавна).
//  • При здоровье 0 — game over, вызывается колбэк onGameOver(score, wave).
//
// Класс не зависит от React: весь игровой цикл и отрисовка живут здесь,
// чтобы не перерисовывать React-дерево по 60 раз в секунду.
// ───────────────────────────────────────────────────────────────────────────

export interface ArenaCallbacks {
  onGameOver: (score: number, wave: number) => void;
}

type EnemyType = "grunt" | "tank" | "dart" | "splitter";

interface Enemy {
  x: number;
  y: number;
  r: number;
  speed: number;
  hp: number;
  type: EnemyType;
  spin: number; // текущий угол для вращения формы
}

// Подбираемые усиления, выпадающие с убитых врагов.
type PowerKind = "heal" | "rapid" | "triple";

interface Powerup {
  x: number;
  y: number;
  kind: PowerKind;
  life: number; // оставшееся время до исчезновения (сек)
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // оставшееся время (сек)
  max: number;
  hue: string;
}

// Плавающий тач-стик: origin (ox,oy) — точка касания, knob (kx,ky) — текущий палец.
interface Stick {
  id: number; // pointerId владеющего пальца (-1 = свободен)
  ox: number;
  oy: number;
  kx: number;
  ky: number;
  active: boolean;
}

const newStick = (): Stick => ({
  id: -1,
  ox: 0,
  oy: 0,
  kx: 0,
  ky: 0,
  active: false,
});

const PLAYER_R = 14;
const PLAYER_SPEED = 235; // px/сек
const BULLET_R = 4;
const BULLET_SPEED = 540;
const FIRE_INTERVAL = 0.24; // сек между выстрелами
const MAX_HEALTH = 100;
const CONTACT_DMG = 18;
const IFRAME = 0.7; // неуязвимость после удара (сек)
const STICK_MAX = 55; // радиус тач-стика (px)
const STICK_DEAD = 6; // мёртвая зона стика (px)
const COMBO_WINDOW = 2.2; // сек на продолжение серии убийств
const COMBO_MAX_MULT = 8; // потолок множителя
const RAPID_TIME = 6; // длительность скорострельности (сек)
const TRIPLE_TIME = 8; // длительность тройного выстрела (сек)
const POWERUP_TTL = 8; // сколько живёт дроп на поле (сек)
const POWERUP_R = 11;
const POWERUP_CHANCE = 0.12; // шанс дропа с убитого врага
const HEAL_AMOUNT = 25;

export class ArenaGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: ArenaCallbacks;

  private w = 0; // логическая ширина (CSS px)
  private h = 0;
  private dpr = 1;

  private raf = 0;
  private lastTs = 0;
  private running = false;

  // Сущности
  private px = 0;
  private py = 0;
  private health = MAX_HEALTH;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];

  private elapsed = 0; // прошло секунд с начала
  private score = 0;
  private wave = 1;
  private fireTimer = 0;
  private spawnTimer = 0;
  private invuln = 0;
  private aim = -Math.PI / 2; // направление носа корабля

  // Сок: комбо, тряска, дропы, активные усиления
  private combo = 0;
  private comboTimer = 0;
  private mult = 1;
  private shake = 0; // текущая амплитуда тряски (px)
  private powerups: Powerup[] = [];
  private rapidTimer = 0;
  private tripleTimer = 0;

  // Звук (WebAudio): создаётся по жесту пользователя в start().
  private audio?: AudioContext;
  private muted = false;

  // Ввод
  private keys = new Set<string>();

  // Десктоп: мышь целится, зажатая ЛКМ — огонь.
  private hasMouse = false;
  private mouseX = 0;
  private mouseY = 0;
  private mouseFiring = false;

  // Тач: левая половина экрана двигает, правая целится и стреляет.
  private moveStick: Stick = newStick();
  private aimStick: Stick = newStick();

  private resizeObs?: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, cb: ArenaCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    this.cb = cb;

    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);

    this.bindInput();
    this.reset();
    this.render(); // показать начальный кадр под меню

    // Перемеряем размер на следующем кадре — на случай, если на момент
    // создания вёрстка ещё не устаканила высоту контейнера.
    requestAnimationFrame(() => {
      this.resize();
      this.px = this.w / 2;
      this.py = this.h / 2;
      this.render();
    });
  }

  // ── Жизненный цикл ────────────────────────────────────────────────────────

  reset(): void {
    this.px = this.w / 2;
    this.py = this.h / 2;
    this.health = MAX_HEALTH;
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.elapsed = 0;
    this.score = 0;
    this.wave = 1;
    this.fireTimer = 0;
    this.spawnTimer = 0;
    this.invuln = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.mult = 1;
    this.shake = 0;
    this.powerups = [];
    this.rapidTimer = 0;
    this.tripleTimer = 0;
    this.moveStick.active = false;
    this.moveStick.id = -1;
    this.aimStick.active = false;
    this.aimStick.id = -1;
    this.mouseFiring = false;
    this.render();
  }

  start(): void {
    if (this.running) return;
    // AudioContext можно создавать только из пользовательского жеста (клик Start).
    if (!this.audio) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) this.audio = new Ctor();
    }
    void this.audio?.resume?.();
    this.running = true;
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.stop();
    this.resizeObs?.disconnect();
    this.unbindInput();
  }

  // ── Размеры ───────────────────────────────────────────────────────────────

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // держим игрока в границах
    this.px = Math.min(Math.max(this.px, PLAYER_R), this.w - PLAYER_R);
    this.py = Math.min(Math.max(this.py, PLAYER_R), this.h - PLAYER_R);
  }

  // ── Игровой цикл ──────────────────────────────────────────────────────────

  private loop(ts: number): void {
    if (!this.running) return;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (dt > 0.05) dt = 0.05; // защита от скачков (вкладка была свёрнута)

    this.update(dt);
    this.render();

    if (this.health <= 0) {
      this.stop();
      this.cb.onGameOver(Math.floor(this.score), this.wave);
      return;
    }
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number): void {
    this.elapsed += dt;
    this.wave = 1 + Math.floor(this.elapsed / 12);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.rapidTimer > 0) this.rapidTimer -= dt;
    if (this.tripleTimer > 0) this.tripleTimer -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 18);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.mult = 1;
      }
    }

    // Движение игрока
    const dir = this.moveDir();
    this.px += dir.x * PLAYER_SPEED * dt;
    this.py += dir.y * PLAYER_SPEED * dt;
    this.px = Math.min(Math.max(this.px, PLAYER_R), this.w - PLAYER_R);
    this.py = Math.min(Math.max(this.py, PLAYER_R), this.h - PLAYER_R);

    // Спавн врагов — мягкий старт (волна 1 ~1.3с), затем заметное ускорение.
    const spawnEvery = Math.max(0.4, 1.4 - this.wave * 0.12);
    this.spawnTimer += dt;
    if (this.spawnTimer >= spawnEvery) {
      this.spawnTimer = 0;
      this.spawnEnemy();
    }

    // Прицел и ручной огонь.
    //  • Тач: правый стик задаёт направление носа и ведёт непрерывный огонь.
    //  • Десктоп: нос смотрит на мышь, стреляем пока зажата ЛКМ.
    //  • Иначе нос смотрит по направлению движения (огня нет).
    let firing = false;
    if (this.aimStick.active) {
      const ax = this.aimStick.kx - this.aimStick.ox;
      const ay = this.aimStick.ky - this.aimStick.oy;
      if (Math.hypot(ax, ay) > STICK_DEAD) this.aim = Math.atan2(ay, ax);
      firing = true;
    } else if (this.hasMouse) {
      this.aim = Math.atan2(this.mouseY - this.py, this.mouseX - this.px);
      firing = this.mouseFiring;
    } else if (dir.x !== 0 || dir.y !== 0) {
      this.aim = Math.atan2(dir.y, dir.x);
    }

    const interval = this.rapidTimer > 0 ? FIRE_INTERVAL * 0.5 : FIRE_INTERVAL;
    this.fireTimer += dt;
    if (firing) {
      if (this.fireTimer >= interval) {
        this.fireTimer = 0;
        this.shoot();
        this.sfx("shoot");
      }
    } else {
      this.fireTimer = interval; // готов выстрелить мгновенно при нажатии
    }

    // Пули
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.bullets = this.bullets.filter(
      (b) => b.x > -10 && b.x < this.w + 10 && b.y > -10 && b.y < this.h + 10,
    );

    // Враги движутся к игроку (и медленно вращаются для «живости»)
    for (const e of this.enemies) {
      const a = Math.atan2(this.py - e.y, this.px - e.x);
      e.x += Math.cos(a) * e.speed * dt;
      e.y += Math.sin(a) * e.speed * dt;
      e.spin += dt * (e.type === "tank" ? 0.8 : 2.2);
    }

    // Столкновения пуля↔враг
    for (const e of this.enemies) {
      for (const b of this.bullets) {
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        if (dx * dx + dy * dy <= (e.r + BULLET_R) * (e.r + BULLET_R)) {
          e.hp -= 1;
          b.x = -9999; // помечаем пулю на удаление
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.x > -9000);
    // Убитые пулями дают очки/комбо/дроп (контактные смерти ниже — без награды).
    for (const e of this.enemies) {
      if (e.hp <= 0) this.onEnemyKilled(e);
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);

    // Подбор пауэр-апов + истечение срока
    for (const p of this.powerups) {
      p.life -= dt;
      const dx = p.x - this.px;
      const dy = p.y - this.py;
      if (dx * dx + dy * dy <= (POWERUP_R + PLAYER_R) * (POWERUP_R + PLAYER_R)) {
        this.applyPower(p.kind);
        p.life = -1;
      }
    }
    this.powerups = this.powerups.filter((p) => p.life > 0);

    // Столкновения враг↔игрок
    for (const e of this.enemies) {
      const dx = e.x - this.px;
      const dy = e.y - this.py;
      if (dx * dx + dy * dy <= (e.r + PLAYER_R) * (e.r + PLAYER_R)) {
        if (this.invuln <= 0) {
          this.health -= CONTACT_DMG;
          this.invuln = IFRAME;
          this.burst(this.px, this.py, "248,113,113");
          this.shake = 9;
          this.combo = 0; // удар сбивает серию
          this.mult = 1;
          this.comboTimer = 0;
          this.sfx("hit");
        }
        e.hp = 0; // враг гибнет при контакте
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);

    // Частицы
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // ── Хелперы геймплея ──────────────────────────────────────────────────────

  private moveDir(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    // Клавиатура (десктоп)
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    if (x !== 0 || y !== 0) {
      const m = Math.hypot(x, y);
      return { x: x / m, y: y / m };
    }
    // Левый тач-стик
    if (this.moveStick.active) {
      const dx = this.moveStick.kx - this.moveStick.ox;
      const dy = this.moveStick.ky - this.moveStick.oy;
      const dist = Math.hypot(dx, dy);
      if (dist > STICK_DEAD) {
        const mag = Math.min(dist, STICK_MAX) / STICK_MAX;
        return { x: (dx / dist) * mag, y: (dy / dist) * mag };
      }
    }
    return { x: 0, y: 0 };
  }

  private spawnEnemy(): void {
    // случайная точка на краю
    const side = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    if (side === 0) {
      x = Math.random() * this.w;
      y = -20;
    } else if (side === 1) {
      x = this.w + 20;
      y = Math.random() * this.h;
    } else if (side === 2) {
      x = Math.random() * this.w;
      y = this.h + 20;
    } else {
      x = -20;
      y = Math.random() * this.h;
    }
    // Выбор типа врага по волне. Волна 1 — только грунты (учебка),
    // дротики со 2-й, делящиеся сплиттеры с 3-й, бронированные танки — с 4-й.
    const roll = Math.random();
    let type: EnemyType = "grunt";
    if (this.wave >= 4 && roll < 0.18) type = "tank";
    else if (this.wave >= 3 && roll < 0.32) type = "splitter";
    else if (this.wave >= 2 && roll < 0.28) type = "dart";

    // Скорость растёт плавнее и стартует ниже, чтобы освоить прицел.
    const base = Math.min(48 + this.wave * 8, 190);
    let r = 13;
    let speed = base;
    let hp = 1;
    if (type === "tank") {
      r = 19;
      speed = base * 0.72;
      hp = 3;
    } else if (type === "dart") {
      r = 10;
      speed = base * 1.45;
      hp = 1;
    } else if (type === "splitter") {
      r = 16;
      speed = base * 0.85;
      hp = 2;
    }
    this.enemies.push({
      x,
      y,
      r,
      speed: speed + Math.random() * 18,
      hp,
      type,
      spin: Math.random() * Math.PI,
    });
  }

  private burst(x: number, y: number, hue: string): void {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random();
      const sp = 60 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.4,
        max: 0.4,
        hue,
      });
    }
  }

  /** Выстрел из носа корабля; с тройным усилением — веер из трёх пуль. */
  private shoot(): void {
    const spread = this.tripleTimer > 0 ? [-0.18, 0, 0.18] : [0];
    for (const off of spread) {
      const a = this.aim + off;
      this.bullets.push({
        x: this.px + Math.cos(a) * PLAYER_R,
        y: this.py + Math.sin(a) * PLAYER_R,
        vx: Math.cos(a) * BULLET_SPEED,
        vy: Math.sin(a) * BULLET_SPEED,
      });
    }
  }

  /** Враг убит пулей: серия, множитель, очки, частицы, дроп, дробление. */
  private onEnemyKilled(e: Enemy): void {
    this.combo += 1;
    this.comboTimer = COMBO_WINDOW;
    this.mult = Math.min(1 + Math.floor(this.combo / 4), COMBO_MAX_MULT);
    this.score += (10 + this.wave) * this.mult;
    this.burst(e.x, e.y, "52,211,153");
    this.shake = Math.min(this.shake + 3, 9);
    this.sfx("kill");

    // Сплиттер распадается на два быстрых осколка.
    if (e.type === "splitter") {
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        this.enemies.push({
          x: e.x + Math.cos(a) * 6,
          y: e.y + Math.sin(a) * 6,
          r: 9,
          speed: 150 + Math.random() * 40,
          hp: 1,
          type: "dart",
          spin: Math.random() * Math.PI,
        });
      }
    }

    // Шанс выронить пауэр-ап.
    if (Math.random() < POWERUP_CHANCE) {
      const kinds: PowerKind[] = ["heal", "rapid", "triple"];
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      this.powerups.push({ x: e.x, y: e.y, kind, life: POWERUP_TTL });
    }
  }

  private applyPower(kind: PowerKind): void {
    if (kind === "heal")
      this.health = Math.min(MAX_HEALTH, this.health + HEAL_AMOUNT);
    else if (kind === "rapid") this.rapidTimer = RAPID_TIME;
    else if (kind === "triple") this.tripleTimer = TRIPLE_TIME;
    this.shake = Math.min(this.shake + 2, 9);
    this.sfx("power");
  }

  /** Короткие синтезированные звуки через WebAudio (ассеты не нужны). */
  private sfx(kind: "shoot" | "kill" | "hit" | "power"): void {
    const ac = this.audio;
    if (this.muted || !ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);

    let freq = 440;
    let dur = 0.08;
    let vol = 0.04;
    o.type = "square";
    if (kind === "shoot") {
      freq = 660;
      dur = 0.05;
      vol = 0.02;
    } else if (kind === "kill") {
      freq = 320;
      dur = 0.1;
      vol = 0.05;
      o.type = "triangle";
      o.frequency.exponentialRampToValueAtTime(freq * 1.6, t + dur);
    } else if (kind === "hit") {
      freq = 130;
      dur = 0.18;
      vol = 0.07;
      o.type = "sawtooth";
      o.frequency.exponentialRampToValueAtTime(45, t + dur);
    } else if (kind === "power") {
      freq = 740;
      dur = 0.16;
      vol = 0.06;
      o.type = "sine";
      o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    }
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ── Отрисовка ─────────────────────────────────────────────────────────────

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // фон
    ctx.fillStyle = "#05080f";
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawGrid();

    // Тряску применяем к игровому миру, но не к фону/сетке/HUD.
    ctx.save();
    if (this.shake > 0) {
      ctx.translate(
        (Math.random() * 2 - 1) * this.shake,
        (Math.random() * 2 - 1) * this.shake,
      );
    }

    // пауэр-апы (под частицами/врагами)
    this.drawPowerups();

    // частицы
    for (const p of this.particles) {
      const alpha = p.life / p.max;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgba(${p.hue},${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // пули — светящийся трейл + яркий кончик
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(34,211,238,0.9)";
    ctx.strokeStyle = "rgba(103,232,249,0.85)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const b of this.bullets) {
      const len = 14;
      const m = Math.hypot(b.vx, b.vy) || 1;
      ctx.beginPath();
      ctx.moveTo(b.x - (b.vx / m) * len, b.y - (b.vy / m) * len);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.fillStyle = "#cffafe";
    for (const b of this.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_R - 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // враги — форма и цвет по типу
    for (const e of this.enemies) {
      const angleToPlayer = Math.atan2(this.py - e.y, this.px - e.x);
      if (e.type === "grunt") {
        ctx.shadowColor = "rgba(244,63,94,0.9)";
        this.drawPolygon(e.x, e.y, e.r, 3, angleToPlayer, "#f43f5e");
      } else if (e.type === "dart") {
        ctx.shadowColor = "rgba(245,158,11,0.9)";
        this.drawPolygon(e.x, e.y, e.r, 4, angleToPlayer, "#f59e0b");
      } else if (e.type === "splitter") {
        // splitter — пятиугольник, делится на осколки при гибели
        ctx.shadowColor = "rgba(45,212,191,0.9)";
        this.drawPolygon(e.x, e.y, e.r, 5, e.spin, "#2dd4bf");
      } else {
        // tank — шестиугольник, медленно крутится, обводка показывает «броню»
        ctx.shadowColor = "rgba(168,85,247,0.9)";
        this.drawPolygon(e.x, e.y, e.r, 6, e.spin, "#a855f7");
      }
    }

    // игрок — корабль-треугольник, нос по направлению (мигает при неуязвимости)
    const blink = this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0;
    if (!blink) this.drawShip();
    ctx.shadowBlur = 0;

    ctx.restore(); // конец тряски игрового мира

    // Тач-стики: левый (движение) серый, правый (прицел/огонь) циан.
    this.drawStick(this.moveStick, "148,163,184");
    this.drawStick(this.aimStick, "34,211,238");

    // Десктоп: ретикль-перекрестие у курсора (когда не используется тач-стик).
    if (this.hasMouse && !this.aimStick.active) {
      ctx.strokeStyle = "rgba(34,211,238,0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.mouseX, this.mouseY, 9, 0, Math.PI * 2);
      ctx.moveTo(this.mouseX - 15, this.mouseY);
      ctx.lineTo(this.mouseX - 5, this.mouseY);
      ctx.moveTo(this.mouseX + 5, this.mouseY);
      ctx.lineTo(this.mouseX + 15, this.mouseY);
      ctx.moveTo(this.mouseX, this.mouseY - 15);
      ctx.lineTo(this.mouseX, this.mouseY - 5);
      ctx.moveTo(this.mouseX, this.mouseY + 5);
      ctx.lineTo(this.mouseX, this.mouseY + 15);
      ctx.stroke();
    }

    this.drawHud();
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(148,163,184,0.06)";
    ctx.lineWidth = 1;
    const step = 40;
    ctx.beginPath();
    for (let x = 0; x <= this.w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.h);
    }
    for (let y = 0; y <= this.h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.w, y);
    }
    ctx.stroke();
  }

  /** Плавающий тач-стик: кольцо-основание + подвижный «грибок». */
  private drawStick(s: Stick, rgb: string): void {
    if (!s.active) return;
    const ctx = this.ctx;
    ctx.strokeStyle = `rgba(${rgb},0.35)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, STICK_MAX, 0, Math.PI * 2);
    ctx.stroke();
    const dx = s.kx - s.ox;
    const dy = s.ky - s.oy;
    const dist = Math.hypot(dx, dy) || 1;
    const cl = Math.min(dist, STICK_MAX);
    ctx.fillStyle = `rgba(${rgb},0.5)`;
    ctx.beginPath();
    ctx.arc(s.ox + (dx / dist) * cl, s.oy + (dy / dist) * cl, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Дропы: светящийся ромб с буквой типа (H/R/3); мигает к концу жизни. */
  private drawPowerups(): void {
    const ctx = this.ctx;
    const palette: Record<PowerKind, [string, string]> = {
      heal: ["#34d399", "H"],
      rapid: ["#22d3ee", "R"],
      triple: ["#f59e0b", "3"],
    };
    for (const p of this.powerups) {
      // мигание в последние 2с
      if (p.life < 2 && Math.floor(p.life * 8) % 2 === 0) continue;
      const [color, letter] = palette[p.kind];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.shadowBlur = 14;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.fillRect(-POWERUP_R * 0.7, -POWERUP_R * 0.7, POWERUP_R * 1.4, POWERUP_R * 1.4);
      ctx.restore();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#05080f";
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(letter, p.x, p.y + 1);
      ctx.textBaseline = "alphabetic";
    }
  }

  private drawHud(): void {
    const ctx = this.ctx;
    // счёт
    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(Math.floor(this.score)), this.w / 2, 34);
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText("SCORE", this.w / 2, 48);

    // множитель серии (показываем только когда >1)
    if (this.mult > 1) {
      ctx.fillStyle = "#f59e0b";
      ctx.font = "800 16px system-ui, sans-serif";
      ctx.fillText(`×${this.mult}`, this.w / 2, 66);
    }

    // волна
    ctx.textAlign = "right";
    ctx.fillStyle = "#a78bfa";
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.fillText(`WAVE ${this.wave}`, this.w - 12, 26);

    // активные баффы (под волной)
    const buffs: Array<[string, string, number, number]> = [];
    if (this.rapidTimer > 0)
      buffs.push(["RAPID", "#22d3ee", this.rapidTimer, RAPID_TIME]);
    if (this.tripleTimer > 0)
      buffs.push(["TRIPLE", "#f59e0b", this.tripleTimer, TRIPLE_TIME]);
    let by = 40;
    ctx.font = "700 10px system-ui, sans-serif";
    for (const [label, color, left, full] of buffs) {
      ctx.fillStyle = color;
      ctx.fillText(label, this.w - 12, by);
      // тонкий таймер-бар под лейблом
      const bw = 46;
      ctx.fillStyle = "rgba(148,163,184,0.25)";
      ctx.fillRect(this.w - 12 - bw, by + 3, bw, 3);
      ctx.fillStyle = color;
      ctx.fillRect(this.w - 12 - bw, by + 3, bw * (left / full), 3);
      by += 16;
    }

    // здоровье
    const barW = 120;
    const barH = 8;
    const x = 12;
    const y = 18;
    ctx.fillStyle = "rgba(148,163,184,0.25)";
    ctx.fillRect(x, y, barW, barH);
    const hp = Math.max(0, this.health) / MAX_HEALTH;
    ctx.fillStyle = hp > 0.4 ? "#34d399" : "#f43f5e";
    ctx.fillRect(x, y, barW * hp, barH);
    ctx.textAlign = "left";
  }

  /** Правильный многоугольник со свечением (shadowColor задаёт вызывающий). */
  private drawPolygon(
    cx: number,
    cy: number,
    r: number,
    sides: number,
    rot: number,
    fill: string,
  ): void {
    const ctx = this.ctx;
    ctx.shadowBlur = 16;
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (Math.PI * 2 * i) / sides;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** Корабль игрока — треугольник носом по this.aim, со светящимся ядром. */
  private drawShip(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.px, this.py);
    ctx.rotate(this.aim);
    ctx.shadowBlur = 22;
    ctx.shadowColor = "rgba(52,211,153,0.95)";
    ctx.fillStyle = "#34d399";
    ctx.beginPath();
    ctx.moveTo(PLAYER_R, 0); // нос
    ctx.lineTo(-PLAYER_R * 0.8, PLAYER_R * 0.7);
    ctx.lineTo(-PLAYER_R * 0.35, 0);
    ctx.lineTo(-PLAYER_R * 0.8, -PLAYER_R * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#d1fae5";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Ввод ──────────────────────────────────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
      e.preventDefault();
    }
    this.keys.add(k);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private pointerPos(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  private onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.pointerPos(e);

    if (e.pointerType === "mouse") {
      this.hasMouse = true;
      this.mouseX = p.x;
      this.mouseY = p.y;
      if (e.button === 0) this.mouseFiring = true;
      return;
    }

    // Тач/перо: левая половина — стик движения, правая — стик прицела+огня.
    const stick = p.x < this.w / 2 ? this.moveStick : this.aimStick;
    if (stick.active) return; // этот стик уже держит другой палец
    stick.id = e.pointerId;
    stick.ox = stick.kx = p.x;
    stick.oy = stick.ky = p.y;
    stick.active = true;
  };
  private onPointerMove = (e: PointerEvent) => {
    const p = this.pointerPos(e);
    if (e.pointerType === "mouse") {
      this.hasMouse = true;
      this.mouseX = p.x;
      this.mouseY = p.y;
      return;
    }
    if (this.moveStick.active && e.pointerId === this.moveStick.id) {
      this.moveStick.kx = p.x;
      this.moveStick.ky = p.y;
    } else if (this.aimStick.active && e.pointerId === this.aimStick.id) {
      this.aimStick.kx = p.x;
      this.aimStick.ky = p.y;
    }
  };
  private onPointerUp = (e: PointerEvent) => {
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (e.pointerType === "mouse") {
      this.mouseFiring = false;
      return;
    }
    if (e.pointerId === this.moveStick.id) {
      this.moveStick.active = false;
      this.moveStick.id = -1;
    } else if (e.pointerId === this.aimStick.id) {
      this.aimStick.active = false;
      this.aimStick.id = -1;
    }
  };

  private bindInput(): void {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
  }
  private unbindInput(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
  }
}
