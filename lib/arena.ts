// ───────────────────────────────────────────────────────────────────────────
// Base Blast — оболочка движка: ввод + рендер + запись рана.
//
// Вся ИГРОВАЯ логика живёт в детерминированной симуляции lib/sim.ts. Здесь:
//   • фиксированный таймстеп (накапливаем реальное время, гоним тики по FIXED_DT);
//   • снимок ввода на каждый тик пишется в this.inputs (для серверной проверки);
//   • рендер виртуального поля VW×VH с масштабом/леттербоксом под любой canvas;
//   • косметика (частицы, тряска, звук) по событиям из stepSim — на счёт не влияет.
// ───────────────────────────────────────────────────────────────────────────

import {
  createSim,
  stepSim,
  FIXED_DT,
  VW,
  VH,
  PLAYER_R,
  BULLET_R,
  MAX_HEALTH,
  POWERUP_R,
  RAPID_TIME,
  TRIPLE_TIME,
  type SimState,
  type SimInput,
  type SimEvent,
  type PowerKind,
} from "./sim";

export interface ArenaCallbacks {
  onGameOver: (score: number, wave: number) => void;
}

/** Записанный ран для отправки на верификацию. */
export interface Run {
  seed: number;
  inputs: SimInput[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: string;
}

interface Stick {
  id: number;
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

const STICK_MAX = 70; // радиус тач-стика (виртуальные единицы)
const STICK_DEAD = 8;

// ── Фоновая музыка (процедурный synthwave-луп, без аудиофайлов) ───────────────
// Прогрессия Am – F – C – G (i–VI–III–VII в ля-миноре): бас на 1-й и 3-й доле +
// арпеджио аккордовыми тонами 8-ми нотами. Планируется через AudioContext-часы
// с lookahead, так что не дёргается под нагрузкой игрового rAF.
const MUSIC_VOL = 0.18; // общий уровень музыкальной шины
const MUSIC_BPM = 96;
const MUSIC_STEPS_PER_BAR = 16; // 16-е ноты в такте
const MUSIC_BARS = 4;
const MUSIC_STEP = 60 / MUSIC_BPM / 4; // длительность 16-й ноты, сек
const MUSIC_PROG: ReadonlyArray<{ bass: number; notes: readonly number[] }> = [
  { bass: 110.0, notes: [220.0, 261.63, 329.63] }, // Am: A2 / A3 C4 E4
  { bass: 87.31, notes: [174.61, 220.0, 261.63] }, // F:  F2 / F3 A3 C4
  { bass: 130.81, notes: [261.63, 329.63, 392.0] }, // C:  C3 / C4 E4 G4
  { bass: 98.0, notes: [196.0, 246.94, 293.66] }, // G:  G2 / G3 B3 D4
];

export class ArenaGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: ArenaCallbacks;

  private w = 0; // размеры canvas (CSS px)
  private h = 0;
  private dpr = 1;
  private scale = 1; // виртуал → canvas
  private ox = 0; // леттербокс-офсет
  private oy = 0;

  private raf = 0;
  private lastTs = 0;
  private acc = 0; // накопитель времени для фикс-шага
  private running = false;

  // Симуляция + запись рана
  private sim: SimState = createSim(1);
  private seed = 1;
  private inputs: SimInput[] = [];

  // Косметика (не влияет на счёт)
  private particles: Particle[] = [];
  private shake = 0;

  // Ввод (координаты — в виртуальных единицах поля)
  private keys = new Set<string>();
  private hasMouse = false;
  private mouseX = 0;
  private mouseY = 0;
  private mouseFiring = false;
  private moveStick: Stick = newStick();
  private aimStick: Stick = newStick();

  // Звук
  private audio?: AudioContext;
  private muted = false;

  // Фоновая музыка
  private musicGain?: GainNode;
  private musicTimer?: number;
  private musicStep = 0;
  private musicNextTime = 0;

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
  }

  // ── Жизненный цикл ────────────────────────────────────────────────────────

  reset(): void {
    this.seed = (Math.random() * 0x7fffffff) | 0;
    this.sim = createSim(this.seed);
    this.inputs = [];
    this.particles = [];
    this.shake = 0;
    this.acc = 0;
    this.moveStick = newStick();
    this.aimStick = newStick();
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
    this.startMusic();
    this.running = true;
    this.lastTs = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stopMusic();
  }

  destroy(): void {
    this.stop();
    this.resizeObs?.disconnect();
    this.unbindInput();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.musicGain && this.audio) {
      this.musicGain.gain.setTargetAtTime(
        muted ? 0 : MUSIC_VOL,
        this.audio.currentTime,
        0.02,
      );
    }
  }

  /** Записанный ран (seed + инпуты по тикам) для серверной проверки. */
  getRun(): Run {
    return { seed: this.seed, inputs: this.inputs };
  }

  // ── Размеры / координаты ──────────────────────────────────────────────────

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.computeView();
    this.render();
  }

  private computeView(): void {
    this.scale = Math.min(this.w / VW, this.h / VH);
    this.ox = (this.w - VW * this.scale) / 2;
    this.oy = (this.h - VH * this.scale) / 2;
  }

  /** canvas px → виртуальные координаты поля. */
  private toVirtual(cx: number, cy: number): { x: number; y: number } {
    return { x: (cx - this.ox) / this.scale, y: (cy - this.oy) / this.scale };
  }

  // ── Игровой цикл ──────────────────────────────────────────────────────────

  private loop(ts: number): void {
    if (!this.running) return;
    let frame = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (frame > 0.25) frame = 0.25; // защита от скачков (вкладка была свёрнута)

    this.acc += frame;
    while (this.acc >= FIXED_DT) {
      const input = this.sampleInput();
      const events = stepSim(this.sim, input);
      this.inputs.push(input);
      this.handleEvents(events);
      this.acc -= FIXED_DT;
      if (this.sim.gameOver) break;
    }

    this.updateCosmetic(frame);
    this.render();

    if (this.sim.gameOver) {
      this.stop();
      this.cb.onGameOver(Math.floor(this.sim.score), this.sim.wave);
      return;
    }
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  /** Снимок ввода для одного тика: движение, прицел, огонь. */
  private sampleInput(): SimInput {
    const move = this.moveDir();
    const af = this.aimAndFire(move);
    return { moveX: move.x, moveY: move.y, aim: af.aim, firing: af.firing };
  }

  private moveDir(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    if (x !== 0 || y !== 0) {
      const m = Math.hypot(x, y);
      return { x: x / m, y: y / m };
    }
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

  private aimAndFire(dir: { x: number; y: number }): {
    aim: number;
    firing: boolean;
  } {
    let aim = this.sim.aim;
    let firing = false;
    if (this.aimStick.active) {
      const ax = this.aimStick.kx - this.aimStick.ox;
      const ay = this.aimStick.ky - this.aimStick.oy;
      if (Math.hypot(ax, ay) > STICK_DEAD) aim = Math.atan2(ay, ax);
      firing = true;
    } else if (this.hasMouse) {
      aim = Math.atan2(this.mouseY - this.sim.py, this.mouseX - this.sim.px);
      firing = this.mouseFiring;
    } else if (dir.x !== 0 || dir.y !== 0) {
      aim = Math.atan2(dir.y, dir.x);
    }
    return { aim, firing };
  }

  private handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      if (e.type === "shoot") {
        this.sfx("shoot");
      } else if (e.type === "kill") {
        this.burst(e.x ?? 0, e.y ?? 0, "52,211,153");
        this.shake = Math.min(this.shake + 3, 9);
        this.sfx("kill");
      } else if (e.type === "split") {
        this.burst(e.x ?? 0, e.y ?? 0, "45,212,191");
      } else if (e.type === "hit") {
        this.burst(e.x ?? 0, e.y ?? 0, "248,113,113");
        this.shake = 9;
        this.sfx("hit");
      } else if (e.type === "power") {
        this.shake = Math.min(this.shake + 2, 9);
        this.sfx("power");
      }
    }
  }

  private updateCosmetic(dt: number): void {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 18);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
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

  // ── Фоновая музыка ────────────────────────────────────────────────────────

  private startMusic(): void {
    const ac = this.audio;
    if (!ac || this.musicTimer != null) return;
    if (!this.musicGain) {
      this.musicGain = ac.createGain();
      this.musicGain.gain.value = this.muted ? 0 : MUSIC_VOL;
      this.musicGain.connect(ac.destination);
    }
    this.musicStep = 0;
    this.musicNextTime = ac.currentTime + 0.1;
    // Lookahead-планировщик: тикаем чаще, чем длится шаг, и ставим ноты в очередь
    // по часам AudioContext — устойчиво к джиттеру setInterval.
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 25);
  }

  private stopMusic(): void {
    if (this.musicTimer != null) {
      clearInterval(this.musicTimer);
      this.musicTimer = undefined;
    }
  }

  private scheduleMusic(): void {
    const ac = this.audio;
    const out = this.musicGain;
    if (!ac || !out) return;
    const totalSteps = MUSIC_STEPS_PER_BAR * MUSIC_BARS;
    while (this.musicNextTime < ac.currentTime + 0.12) {
      this.playMusicStep(this.musicStep, this.musicNextTime, out);
      this.musicStep = (this.musicStep + 1) % totalSteps;
      this.musicNextTime += MUSIC_STEP;
    }
  }

  private playMusicStep(step: number, t: number, out: GainNode): void {
    const bar = Math.floor(step / MUSIC_STEPS_PER_BAR) % MUSIC_PROG.length;
    const s = step % MUSIC_STEPS_PER_BAR;
    const chord = MUSIC_PROG[bar];
    // Бас на 1-й и 3-й доле такта (тёплый, через ФНЧ) — бонус для наушников.
    if (s === 0 || s === 8) {
      this.musicNote(chord.bass, t, 0.42, "sawtooth", 0.6, out, 700);
    }
    // Арпеджио 8-ми нотами, на октаву выше (350–800 Гц) — пробивает на любых
    // динамиках, включая телефонные. Яркая «пила» = ведущий голос.
    if (s % 2 === 0) {
      const tone = chord.notes[(s / 2) % chord.notes.length] * 2;
      this.musicNote(tone, t, 0.18, "sawtooth", 0.5, out, 2600);
    }
  }

  private musicNote(
    freq: number,
    t: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    out: GainNode,
    lowpassHz?: number,
  ): void {
    const ac = this.audio;
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(g);
    if (lowpassHz) {
      const f = ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(lowpassHz, t);
      g.connect(f);
      f.connect(out);
    } else {
      g.connect(out);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  // ── Отрисовка ─────────────────────────────────────────────────────────────

  private render(): void {
    const ctx = this.ctx;
    this.computeView();
    ctx.clearRect(0, 0, this.w, this.h);
    // леттербокс-фон вокруг поля
    ctx.fillStyle = "#02040a";
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() * 2 - 1) * this.shake;
      sy = (Math.random() * 2 - 1) * this.shake;
    }
    ctx.translate(this.ox + sx, this.oy + sy);
    ctx.scale(this.scale, this.scale);
    ctx.beginPath();
    ctx.rect(0, 0, VW, VH);
    ctx.clip();

    // поле + сетка
    ctx.fillStyle = "#05080f";
    ctx.fillRect(0, 0, VW, VH);
    this.drawGrid();

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

    // пули
    ctx.shadowBlur = 12;
    ctx.shadowColor = "rgba(34,211,238,0.9)";
    ctx.strokeStyle = "rgba(103,232,249,0.85)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const b of this.sim.bullets) {
      const len = 14;
      const m = Math.hypot(b.vx, b.vy) || 1;
      ctx.beginPath();
      ctx.moveTo(b.x - (b.vx / m) * len, b.y - (b.vy / m) * len);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.fillStyle = "#cffafe";
    for (const b of this.sim.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_R - 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // враги
    for (const e of this.sim.enemies) {
      const angleToPlayer = Math.atan2(this.sim.py - e.y, this.sim.px - e.x);
      if (e.type === "grunt") {
        ctx.shadowColor = "rgba(244,63,94,0.9)";
        this.drawPolygon(e.x, e.y, e.r, 3, angleToPlayer, "#f43f5e");
      } else if (e.type === "dart") {
        ctx.shadowColor = "rgba(245,158,11,0.9)";
        this.drawPolygon(e.x, e.y, e.r, 4, angleToPlayer, "#f59e0b");
      } else if (e.type === "splitter") {
        ctx.shadowColor = "rgba(45,212,191,0.9)";
        this.drawPolygon(e.x, e.y, e.r, 5, e.spin, "#2dd4bf");
      } else {
        ctx.shadowColor = "rgba(168,85,247,0.9)";
        this.drawPolygon(e.x, e.y, e.r, 6, e.spin, "#a855f7");
      }
    }

    // игрок (мигает в i-frames)
    const blink =
      this.sim.invuln > 0 && Math.floor(this.sim.invuln * 20) % 2 === 0;
    if (!blink) this.drawShip();
    ctx.shadowBlur = 0;

    // тач-стики
    this.drawStick(this.moveStick, "148,163,184");
    this.drawStick(this.aimStick, "34,211,238");

    // ретикль мыши (десктоп)
    if (this.hasMouse && !this.aimStick.active) {
      ctx.strokeStyle = "rgba(34,211,238,0.55)";
      ctx.lineWidth = 1.5;
      const mx = this.mouseX;
      const my = this.mouseY;
      ctx.beginPath();
      ctx.arc(mx, my, 9, 0, Math.PI * 2);
      ctx.moveTo(mx - 15, my);
      ctx.lineTo(mx - 5, my);
      ctx.moveTo(mx + 5, my);
      ctx.lineTo(mx + 15, my);
      ctx.moveTo(mx, my - 15);
      ctx.lineTo(mx, my - 5);
      ctx.moveTo(mx, my + 5);
      ctx.lineTo(mx, my + 15);
      ctx.stroke();
    }

    ctx.restore();

    this.drawHud();
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(148,163,184,0.06)";
    ctx.lineWidth = 1;
    const step = 40;
    ctx.beginPath();
    for (let x = 0; x <= VW; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, VH);
    }
    for (let y = 0; y <= VH; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(VW, y);
    }
    ctx.stroke();
  }

  private drawPowerups(): void {
    const ctx = this.ctx;
    const palette: Record<PowerKind, [string, string]> = {
      heal: ["#34d399", "H"],
      rapid: ["#22d3ee", "R"],
      triple: ["#f59e0b", "3"],
    };
    for (const p of this.sim.powerups) {
      if (p.life < 2 && Math.floor(p.life * 8) % 2 === 0) continue;
      const [color, letter] = palette[p.kind];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.shadowBlur = 14;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.fillRect(
        -POWERUP_R * 0.7,
        -POWERUP_R * 0.7,
        POWERUP_R * 1.4,
        POWERUP_R * 1.4,
      );
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
    ctx.arc(s.ox + (dx / dist) * cl, s.oy + (dy / dist) * cl, 28, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawHud(): void {
    const ctx = this.ctx;
    const s = this.sim;
    // счёт
    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(Math.floor(s.score)), this.w / 2, 34);
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText("SCORE", this.w / 2, 48);

    if (s.mult > 1) {
      ctx.fillStyle = "#f59e0b";
      ctx.font = "800 16px system-ui, sans-serif";
      ctx.fillText(`×${s.mult}`, this.w / 2, 66);
    }

    // волна
    ctx.textAlign = "right";
    ctx.fillStyle = "#a78bfa";
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.fillText(`WAVE ${s.wave}`, this.w - 12, 26);

    // активные баффы
    const buffs: Array<[string, string, number, number]> = [];
    if (s.rapidTimer > 0)
      buffs.push(["RAPID", "#22d3ee", s.rapidTimer, RAPID_TIME]);
    if (s.tripleTimer > 0)
      buffs.push(["TRIPLE", "#f59e0b", s.tripleTimer, TRIPLE_TIME]);
    let by = 40;
    ctx.font = "700 10px system-ui, sans-serif";
    for (const [label, color, left, full] of buffs) {
      ctx.fillStyle = color;
      ctx.fillText(label, this.w - 12, by);
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
    const hp = Math.max(0, s.health) / MAX_HEALTH;
    ctx.fillStyle = hp > 0.4 ? "#34d399" : "#f43f5e";
    ctx.fillRect(x, y, barW * hp, barH);
    ctx.textAlign = "left";
  }

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

  private drawShip(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.sim.px, this.sim.py);
    ctx.rotate(this.sim.aim);
    ctx.shadowBlur = 22;
    ctx.shadowColor = "rgba(52,211,153,0.95)";
    ctx.fillStyle = "#34d399";
    ctx.beginPath();
    ctx.moveTo(PLAYER_R, 0);
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

  private onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const rect = this.canvas.getBoundingClientRect();
    const p = this.toVirtual(e.clientX - rect.left, e.clientY - rect.top);

    if (e.pointerType === "mouse") {
      this.hasMouse = true;
      this.mouseX = p.x;
      this.mouseY = p.y;
      if (e.button === 0) this.mouseFiring = true;
      return;
    }

    const stick = p.x < VW / 2 ? this.moveStick : this.aimStick;
    if (stick.active) return;
    stick.id = e.pointerId;
    stick.ox = stick.kx = p.x;
    stick.oy = stick.ky = p.y;
    stick.active = true;
  };
  private onPointerMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const p = this.toVirtual(e.clientX - rect.left, e.clientY - rect.top);
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
