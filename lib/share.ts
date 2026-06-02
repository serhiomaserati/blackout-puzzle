// ───────────────────────────────────────────────────────────────────────────
// Формирование текста результата для шэринга (в стиле Wordle).
// Emoji-сетка показывает СТАРТОВУЮ доску дня: горящий тайл = 🟩, погашенный = ⬛,
// чтобы друзья увидели сегодняшнюю головоломку.
// ───────────────────────────────────────────────────────────────────────────

import { SIZE, type DailyPuzzle } from "./game";

/** Доска → 5 строк эмодзи. */
export function emojiGrid(board: boolean[]): string {
  const rows: string[] = [];
  for (let r = 0; r < SIZE; r++) {
    let line = "";
    for (let c = 0; c < SIZE; c++) {
      line += board[r * SIZE + c] ? "🟩" : "⬛";
    }
    rows.push(line);
  }
  return rows.join("\n");
}

export interface ShareInput {
  puzzle: DailyPuzzle;
  moves: number;
  streak: number;
}

/** Готовый текст каста: заголовок, счёт vs par, streak и emoji-сетка. */
export function buildShareText({ puzzle, moves, streak }: ShareInput): string {
  const trophy = moves <= puzzle.par ? " 🏆" : "";
  return [
    `Lights Out · ${puzzle.dateKey}`,
    `Solved in ${moves} / par ${puzzle.par}${trophy}`,
    `🔥 Streak: ${streak}`,
    "",
    emojiGrid(puzzle.board),
  ].join("\n");
}
