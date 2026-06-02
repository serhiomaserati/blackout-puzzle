// ───────────────────────────────────────────────────────────────────────────
// Сохранение прогресса ТЕКУЩЕГО дня в localStorage:
// чтобы перезагрузка не сбрасывала доску и нельзя было переиграть тот же день.
// ───────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "worddaily.day.v1";

export type DayStatus = "playing" | "won" | "lost";

export interface DayState {
  dateKey: string;
  guesses: string[];
  status: DayStatus;
}

/** Вернуть сохранённое состояние, только если оно за этот же день. */
export function loadDay(dateKey: string): DayState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DayState;
    if (d.dateKey !== dateKey || !Array.isArray(d.guesses)) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveDay(state: DayState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* localStorage недоступен — игнорируем */
  }
}
