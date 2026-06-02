// ───────────────────────────────────────────────────────────────────────────
// Ядро игры «Word Guess» (Wordle-style).
//
// Правила:
//  • Загадано слово из 5 букв, у игрока 6 попыток.
//  • После каждой догадки каждая буква подсвечивается:
//      correct  (🟩) — буква на своём месте,
//      present  (🟨) — буква есть в слове, но не на этом месте,
//      absent   (⬛) — буквы нет.
//  • Ежедневная головоломка детерминирована: сид = дата (UTC) → слово из списка.
// ───────────────────────────────────────────────────────────────────────────

import { WORDS, WORD_SET } from "./words";

export const WORD_LEN = 5;
export const MAX_GUESSES = 6;

// «Нулевой день» для нумерации головоломок (Word #N).
const EPOCH_KEY = "2025-01-01";

export type LetterState = "correct" | "present" | "absent";

/**
 * Детерминированный ГПСЧ mulberry32: из одного числа-сида даёт
 * воспроизводимую последовательность чисел [0,1). Один сид → одно слово у всех.
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

/** Ключ дня в UTC, например "2026-06-02". Одинаков во всех часовых поясах. */
export function utcDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Хэш строки (FNV-1a) → 32-битный сид для ГПСЧ. */
export function seedFromKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Порядковый номер головоломки (дней с EPOCH_KEY, начиная с 1). */
export function puzzleNumber(dateKey: string): number {
  const day = Date.parse(`${dateKey}T00:00:00.000Z`);
  const epoch = Date.parse(`${EPOCH_KEY}T00:00:00.000Z`);
  return Math.floor((day - epoch) / 86_400_000) + 1;
}

export interface DailyWord {
  dateKey: string; // "2026-06-02"
  answer: string; // загаданное слово (5 букв)
  number: number; // Word #N
}

/** Слово дня по дате (детерминированно). */
export function getDailyWord(dateKey: string = utcDateKey()): DailyWord {
  const rng = mulberry32(seedFromKey(dateKey));
  const answer = WORDS[Math.floor(rng() * WORDS.length)];
  return { dateKey, answer, number: puzzleNumber(dateKey) };
}

/** Есть ли слово в словаре (для проверки догадки игрока). */
export function isValidWord(word: string): boolean {
  return WORD_SET.has(word.toLowerCase());
}

/**
 * Оценка догадки относительно ответа с правильной обработкой повторов:
 *  1) сначала помечаем точные совпадения (correct) и «расходуем» эти буквы ответа;
 *  2) затем для остальных ищем букву среди ещё не израсходованных (present).
 */
export function scoreGuess(guess: string, answer: string): LetterState[] {
  const g = guess.toLowerCase();
  const a = answer.toLowerCase();
  const result: LetterState[] = new Array(WORD_LEN).fill("absent");
  const remaining: (string | null)[] = a.split("");

  // Проход 1 — точные попадания.
  for (let i = 0; i < WORD_LEN; i++) {
    if (g[i] === remaining[i]) {
      result[i] = "correct";
      remaining[i] = null;
    }
  }
  // Проход 2 — буква есть, но не на месте.
  for (let i = 0; i < WORD_LEN; i++) {
    if (result[i] === "correct") continue;
    const idx = remaining.indexOf(g[i]);
    if (idx !== -1) {
      result[i] = "present";
      remaining[idx] = null;
    }
  }
  return result;
}
