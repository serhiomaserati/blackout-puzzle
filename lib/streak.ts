// ───────────────────────────────────────────────────────────────────────────
// Streak — серия дней подряд, хранится в localStorage.
// Считаем по ключам дат UTC ("YYYY-MM-DD"). Идемпотентно: повторная победа
// в тот же день не накручивает серию.
// ───────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "lightsout.progress.v1";

export interface Progress {
  streak: number; // текущая серия
  bestStreak: number; // лучший рекорд
  lastWonKey: string | null; // дата последней победы (UTC)
}

const EMPTY: Progress = { streak: 0, bestStreak: 0, lastWonKey: null };

export function loadProgress(): Progress {
  if (typeof window === "undefined") return EMPTY; // защита от SSR
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<Progress>;
    return {
      streak: p.streak ?? 0,
      bestStreak: p.bestStreak ?? 0,
      lastWonKey: p.lastWonKey ?? null,
    };
  } catch {
    return EMPTY;
  }
}

function save(p: Progress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* localStorage недоступен (приватный режим) — молча игнорируем */
  }
}

/** Предыдущий календарный день для ключа "YYYY-MM-DD" (в UTC). */
function previousKey(key: string): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Зафиксировать победу за день `todayKey` и вернуть обновлённый прогресс.
 *  • если уже выигран сегодня — ничего не меняем (идемпотентно);
 *  • если последняя победа была вчера — серия +1;
 *  • иначе (первый день или пропуск) — серия = 1.
 */
export function recordWin(todayKey: string): Progress {
  const cur = loadProgress();
  if (cur.lastWonKey === todayKey) return cur;

  const streak = cur.lastWonKey === previousKey(todayKey) ? cur.streak + 1 : 1;

  const next: Progress = {
    streak,
    bestStreak: Math.max(cur.bestStreak, streak),
    lastWonKey: todayKey,
  };
  save(next);
  return next;
}
