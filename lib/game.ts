// ───────────────────────────────────────────────────────────────────────────
// Чистая логика игры «Lights Out» (без React и DOM — легко тестировать).
//
// Правила:
//  • Поле 5×5. Каждый тайл вкл (true) или выкл (false).
//  • Нажатие инвертирует сам тайл и 4 ортогональных соседа (без диагоналей).
//  • Цель — погасить всё (все false).
//  • Ежедневная головоломка детерминирована: сид = текущая дата (UTC).
//    Доска ВСЕГДА решаема, т.к. строится из решённого поля обратным ходом:
//    берём «всё выкл» и применяем N валидных нажатий (N = 6..10 по сиду).
//    Это N сохраняем как "par" (эталонное число ходов).
// ───────────────────────────────────────────────────────────────────────────

export const SIZE = 5;
export const CELLS = SIZE * SIZE; // 25

/**
 * Детерминированный ГПСЧ mulberry32: из одного числа-сида даёт
 * воспроизводимую последовательность чисел в диапазоне [0, 1).
 * Один и тот же сид → одна и та же доска у всех игроков.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ключ дня в UTC, например "2026-06-02". Одинаков для всех часовых поясов. */
export function utcDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Хэш строки (FNV-1a) → 32-битное число-сид для ГПСЧ. */
export function seedFromKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Индексы тайла i и его ортогональных соседей (сам тайл всегда включён). */
export function neighbors(i: number): number[] {
  const row = Math.floor(i / SIZE);
  const col = i % SIZE;
  const out = [i];
  if (row > 0) out.push(i - SIZE); // сверху
  if (row < SIZE - 1) out.push(i + SIZE); // снизу
  if (col > 0) out.push(i - 1); // слева
  if (col < SIZE - 1) out.push(i + 1); // справа
  return out;
}

/** Нажатие по тайлу i: возвращает НОВЫЙ массив (иммутабельно, удобно для React). */
export function applyPress(board: boolean[], i: number): boolean[] {
  const next = board.slice();
  for (const n of neighbors(i)) next[n] = !next[n];
  return next;
}

/** Доска решена, когда все тайлы выключены. */
export function isSolved(board: boolean[]): boolean {
  return board.every((cell) => !cell);
}

export interface DailyPuzzle {
  dateKey: string; // "2026-06-02"
  seed: number;
  board: boolean[]; // стартовая расстановка (length = 25)
  par: number; // эталонное число ходов (N применённых нажатий)
}

/**
 * Строит решаемую головоломку дня.
 * Идём от решённого поля «всё выкл» и применяем N различных валидных нажатий.
 * Поскольку нажатие — само себе обратное и порядок не важен, ровно эти же
 * N нажатий и есть решение → par = N.
 */
export function generateDaily(dateKey: string = utcDateKey()): DailyPuzzle {
  const seed = seedFromKey(dateKey);
  const rng = mulberry32(seed);

  const par = 6 + Math.floor(rng() * 5); // 6..10 включительно

  let board: boolean[] = new Array(CELLS).fill(false);
  const used = new Set<number>();

  // Применяем par РАЗЛИЧНЫХ нажатий (без повторов, чтобы они не гасили друг друга).
  let guard = 0;
  while (used.size < par && guard < 1000) {
    guard++;
    const idx = Math.floor(rng() * CELLS);
    if (used.has(idx)) continue;
    used.add(idx);
    board = applyPress(board, idx);
  }

  // Подстраховка: крайне маловероятно, но если доска вышла уже решённой —
  // делаем ещё одно нажатие, чтобы дать игроку реальную задачу.
  if (isSolved(board)) {
    board = applyPress(board, 12);
  }

  return { dateKey, seed, board, par };
}
