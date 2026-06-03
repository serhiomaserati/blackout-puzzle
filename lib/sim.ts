// ───────────────────────────────────────────────────────────────────────────
// Чистая ДЕТЕРМИНИРОВАННАЯ симуляция Base Blast.
//
// Не зависит от canvas/DOM — один и тот же код крутят:
//   • клиент (lib/arena.ts рендерит состояние и пишет инпуты по тикам);
//   • сервер-верификатор (/api/score пересимулирует ран и сверяет счёт).
//
// Для воспроизводимости:
//   • фиксированный шаг времени FIXED_DT (логика не зависит от FPS);
//   • фиксированное виртуальное поле VW×VH (одинаковое на всех устройствах);
//   • вся игровая случайность идёт через seeded-RNG (mulberry32).
//
// Косметика (частицы, тряска, звук) живёт в arena.ts и управляется событиями,
// которые возвращает stepSim — она на счёт не влияет и в симуляции не нужна.
// ───────────────────────────────────────────────────────────────────────────

export const FIXED_DT = 1 / 60; // шаг симуляции (сек)
export const VW = 540; // ширина виртуального поля
export const VH = 960; // высота виртуального поля

export const PLAYER_R = 14;
export const PLAYER_SPEED = 235;
export const BULLET_R = 4;
export const BULLET_SPEED = 540;
export const FIRE_INTERVAL = 0.24;
export const MAX_HEALTH = 100;
const CONTACT_DMG = 18;
const IFRAME = 0.7;
const COMBO_WINDOW = 2.2;
const COMBO_MAX_MULT = 8;
export const RAPID_TIME = 6;
export const TRIPLE_TIME = 8;
const POWERUP_TTL = 8;
export const POWERUP_R = 11;
const POWERUP_CHANCE = 0.12;
const HEAL_AMOUNT = 25;

export type EnemyType = "grunt" | "tank" | "dart" | "splitter";
export type PowerKind = "heal" | "rapid" | "triple";

export interface Enemy {
  x: number;
  y: number;
  r: number;
  speed: number;
  hp: number;
  type: EnemyType;
  spin: number; // косметический угол (детерминированный)
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Powerup {
  x: number;
  y: number;
  kind: PowerKind;
  life: number;
}

/** Снимок ввода за один тик. Записывается клиентом, повторяется сервером. */
export interface SimInput {
  moveX: number; // -1..1 (уже нормировано по величине)
  moveY: number;
  aim: number; // радианы — куда смотрит нос
  firing: boolean;
}

/** События тика для косметики на клиенте (не влияют на счёт). */
export interface SimEvent {
  type: "shoot" | "kill" | "hit" | "power" | "split";
  x?: number;
  y?: number;
  kind?: PowerKind;
}

export interface SimState {
  seed: number;
  rngState: number;
  tick: number;
  px: number;
  py: number;
  health: number;
  enemies: Enemy[];
  bullets: Bullet[];
  powerups: Powerup[];
  score: number;
  wave: number;
  combo: number;
  comboTimer: number;
  mult: number;
  fireTimer: number;
  spawnTimer: number;
  invuln: number;
  rapidTimer: number;
  tripleTimer: number;
  aim: number;
  gameOver: boolean;
}

// mulberry32 — быстрый детерминированный PRNG, возвращает [0,1).
function rng(s: SimState): number {
  s.rngState = (s.rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rngState ^ (s.rngState >>> 15), 1 | s.rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createSim(seed: number): SimState {
  return {
    seed: seed | 0,
    rngState: seed | 0,
    tick: 0,
    px: VW / 2,
    py: VH / 2,
    health: MAX_HEALTH,
    enemies: [],
    bullets: [],
    powerups: [],
    score: 0,
    wave: 1,
    combo: 0,
    comboTimer: 0,
    mult: 1,
    fireTimer: 0,
    spawnTimer: 0,
    invuln: 0,
    rapidTimer: 0,
    tripleTimer: 0,
    aim: -Math.PI / 2,
    gameOver: false,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function spawnEnemy(s: SimState): void {
  const side = Math.floor(rng(s) * 4);
  let x = 0;
  let y = 0;
  if (side === 0) {
    x = rng(s) * VW;
    y = -20;
  } else if (side === 1) {
    x = VW + 20;
    y = rng(s) * VH;
  } else if (side === 2) {
    x = rng(s) * VW;
    y = VH + 20;
  } else {
    x = -20;
    y = rng(s) * VH;
  }

  const roll = rng(s);
  let type: EnemyType = "grunt";
  if (s.wave >= 4 && roll < 0.18) type = "tank";
  else if (s.wave >= 3 && roll < 0.32) type = "splitter";
  else if (s.wave >= 2 && roll < 0.28) type = "dart";

  const base = Math.min(48 + s.wave * 8, 190);
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

  s.enemies.push({
    x,
    y,
    r,
    speed: speed + rng(s) * 18,
    hp,
    type,
    spin: rng(s) * Math.PI,
  });
}

function shoot(s: SimState): void {
  const spread = s.tripleTimer > 0 ? [-0.18, 0, 0.18] : [0];
  for (const off of spread) {
    const a = s.aim + off;
    s.bullets.push({
      x: s.px + Math.cos(a) * PLAYER_R,
      y: s.py + Math.sin(a) * PLAYER_R,
      vx: Math.cos(a) * BULLET_SPEED,
      vy: Math.sin(a) * BULLET_SPEED,
    });
  }
}

function onKill(s: SimState, e: Enemy, events: SimEvent[]): void {
  s.combo += 1;
  s.comboTimer = COMBO_WINDOW;
  s.mult = Math.min(1 + Math.floor(s.combo / 4), COMBO_MAX_MULT);
  s.score += (10 + s.wave) * s.mult;
  events.push({ type: "kill", x: e.x, y: e.y });

  if (e.type === "splitter") {
    for (let i = 0; i < 2; i++) {
      const a = rng(s) * Math.PI * 2;
      s.enemies.push({
        x: e.x + Math.cos(a) * 6,
        y: e.y + Math.sin(a) * 6,
        r: 9,
        speed: 150 + rng(s) * 40,
        hp: 1,
        type: "dart",
        spin: rng(s) * Math.PI,
      });
    }
    events.push({ type: "split", x: e.x, y: e.y });
  }

  if (rng(s) < POWERUP_CHANCE) {
    const kinds: PowerKind[] = ["heal", "rapid", "triple"];
    const kind = kinds[Math.floor(rng(s) * kinds.length)];
    s.powerups.push({ x: e.x, y: e.y, kind, life: POWERUP_TTL });
  }
}

function applyPower(s: SimState, kind: PowerKind): void {
  if (kind === "heal") s.health = Math.min(MAX_HEALTH, s.health + HEAL_AMOUNT);
  else if (kind === "rapid") s.rapidTimer = RAPID_TIME;
  else if (kind === "triple") s.tripleTimer = TRIPLE_TIME;
}

/** Один фиксированный тик симуляции. Мутирует state, возвращает события. */
export function stepSim(s: SimState, input: SimInput): SimEvent[] {
  const events: SimEvent[] = [];
  if (s.gameOver) return events;
  const dt = FIXED_DT;

  s.tick += 1;
  s.wave = 1 + Math.floor((s.tick * dt) / 12);
  if (s.invuln > 0) s.invuln -= dt;
  if (s.rapidTimer > 0) s.rapidTimer -= dt;
  if (s.tripleTimer > 0) s.tripleTimer -= dt;
  if (s.comboTimer > 0) {
    s.comboTimer -= dt;
    if (s.comboTimer <= 0) {
      s.combo = 0;
      s.mult = 1;
    }
  }

  // Движение игрока (величина уже нормирована клиентом).
  s.px = clamp(s.px + input.moveX * PLAYER_SPEED * dt, PLAYER_R, VW - PLAYER_R);
  s.py = clamp(s.py + input.moveY * PLAYER_SPEED * dt, PLAYER_R, VH - PLAYER_R);
  s.aim = input.aim;

  // Спавн.
  const spawnEvery = Math.max(0.4, 1.4 - s.wave * 0.12);
  s.spawnTimer += dt;
  if (s.spawnTimer >= spawnEvery) {
    s.spawnTimer = 0;
    spawnEnemy(s);
  }

  // Огонь.
  const interval = s.rapidTimer > 0 ? FIRE_INTERVAL * 0.5 : FIRE_INTERVAL;
  s.fireTimer += dt;
  if (input.firing) {
    if (s.fireTimer >= interval) {
      s.fireTimer = 0;
      shoot(s);
      events.push({ type: "shoot" });
    }
  } else {
    s.fireTimer = interval;
  }

  // Пули.
  for (const b of s.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  s.bullets = s.bullets.filter(
    (b) => b.x > -10 && b.x < VW + 10 && b.y > -10 && b.y < VH + 10,
  );

  // Враги к игроку.
  for (const e of s.enemies) {
    const a = Math.atan2(s.py - e.y, s.px - e.x);
    e.x += Math.cos(a) * e.speed * dt;
    e.y += Math.sin(a) * e.speed * dt;
    e.spin += dt * (e.type === "tank" ? 0.8 : 2.2);
  }

  // Пуля↔враг.
  for (const e of s.enemies) {
    for (const b of s.bullets) {
      const dx = e.x - b.x;
      const dy = e.y - b.y;
      if (dx * dx + dy * dy <= (e.r + BULLET_R) * (e.r + BULLET_R)) {
        e.hp -= 1;
        b.x = -9999;
        break;
      }
    }
  }
  s.bullets = s.bullets.filter((b) => b.x > -9000);
  for (const e of s.enemies) {
    if (e.hp <= 0) onKill(s, e, events);
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);

  // Пауэр-апы.
  for (const p of s.powerups) {
    p.life -= dt;
    const dx = p.x - s.px;
    const dy = p.y - s.py;
    if (dx * dx + dy * dy <= (POWERUP_R + PLAYER_R) * (POWERUP_R + PLAYER_R)) {
      applyPower(s, p.kind);
      events.push({ type: "power", x: p.x, y: p.y, kind: p.kind });
      p.life = -1;
    }
  }
  s.powerups = s.powerups.filter((p) => p.life > 0);

  // Враг↔игрок.
  for (const e of s.enemies) {
    const dx = e.x - s.px;
    const dy = e.y - s.py;
    if (dx * dx + dy * dy <= (e.r + PLAYER_R) * (e.r + PLAYER_R)) {
      if (s.invuln <= 0) {
        s.health -= CONTACT_DMG;
        s.invuln = IFRAME;
        s.combo = 0;
        s.mult = 1;
        s.comboTimer = 0;
        events.push({ type: "hit", x: s.px, y: s.py });
      }
      e.hp = 0;
    }
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);

  if (s.health <= 0) {
    s.health = 0;
    s.gameOver = true;
  }
  return events;
}

/** Серверная проверка: прогнать ран целиком и вернуть итог. */
export function simulateRun(
  seed: number,
  inputs: SimInput[],
): { score: number; wave: number; ticks: number } {
  const s = createSim(seed);
  for (const inp of inputs) {
    if (s.gameOver) break;
    stepSim(s, inp);
  }
  return { score: Math.floor(s.score), wave: s.wave, ticks: s.tick };
}
