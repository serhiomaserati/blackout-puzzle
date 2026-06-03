// Личный рекорд (all-time best score) в localStorage.

const STORAGE_KEY = "neonarena.best.v1";

export function loadBest(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Сохранить, если новый счёт больше. Вернуть актуальный рекорд. */
export function saveBest(score: number): number {
  const best = Math.max(loadBest(), score);
  try {
    localStorage.setItem(STORAGE_KEY, String(best));
  } catch {
    /* недоступно — игнорируем */
  }
  return best;
}
