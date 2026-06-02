// ───────────────────────────────────────────────────────────────────────────
// Текст результата для шэринга (в стиле Wordle).
// Emoji-сетка строится из попыток игрока: 🟩 на месте, 🟨 есть, ⬛ нет.
// ───────────────────────────────────────────────────────────────────────────

import { MAX_GUESSES, scoreGuess, type LetterState } from "./game";

export const APP_NAME = "Word Daily";

const EMOJI: Record<LetterState, string> = {
  correct: "🟩",
  present: "🟨",
  absent: "⬛",
};

/** Одна строка результата → эмодзи. */
export function rowToEmoji(states: LetterState[]): string {
  return states.map((s) => EMOJI[s]).join("");
}

export interface ShareInput {
  number: number; // Word #N
  answer: string;
  guesses: string[];
  won: boolean;
  streak: number;
}

/** Готовый текст каста: заголовок, попытки, streak и emoji-сетка. */
export function buildShareText({
  number,
  answer,
  guesses,
  won,
  streak,
}: ShareInput): string {
  const tries = won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const grid = guesses
    .map((g) => rowToEmoji(scoreGuess(g, answer)))
    .join("\n");
  return [`${APP_NAME} #${number} ${tries}`, `🔥 Streak: ${streak}`, "", grid].join(
    "\n",
  );
}
