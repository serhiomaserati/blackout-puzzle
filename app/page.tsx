"use client";

import { useEffect, useState } from "react";
import { useMiniKit, useComposeCast } from "@coinbase/onchainkit/minikit";
import {
  generateDaily,
  applyPress,
  isSolved,
  SIZE,
  type DailyPuzzle,
} from "@/lib/game";
import { loadProgress, recordWin } from "@/lib/streak";
import { buildShareText } from "@/lib/share";
import { minikitConfig } from "@/minikit.config";

export default function Home() {
  // Сообщаем клиенту мини-аппа, что интерфейс готов к показу.
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [isMiniAppReady, setMiniAppReady]);

  // Нативный шэринг мини-аппа (compose cast в Base App / Farcaster).
  const { composeCastAsync } = useComposeCast();

  // Состояние игры.
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [board, setBoard] = useState<boolean[]>([]);
  const [moves, setMoves] = useState(0);
  const [streak, setStreak] = useState(0);
  const [copied, setCopied] = useState(false);

  // Головоломку дня и текущую серию читаем НА КЛИЕНТЕ (избегаем hydration mismatch).
  useEffect(() => {
    const p = generateDaily();
    setPuzzle(p);
    setBoard(p.board);
    setMoves(0);
    setStreak(loadProgress().streak);
  }, []);

  const ready = puzzle !== null && board.length === SIZE * SIZE;
  const solved = ready && isSolved(board);

  // Нажатие по тайлу. Если этим ходом доска решена — фиксируем победу и streak.
  function press(i: number) {
    if (!ready || solved || !puzzle) return;
    const next = applyPress(board, i);
    setBoard(next);
    setMoves((m) => m + 1);
    if (isSolved(next)) {
      setStreak(recordWin(puzzle.dateKey).streak);
    }
  }

  // Заново сегодняшнюю доску (та же расстановка, счётчик в ноль).
  function restart() {
    if (!puzzle) return;
    setBoard(puzzle.board);
    setMoves(0);
  }

  // Кнопка «Поделиться»: внутри мини-аппа открывает композер каста,
  // вне его (обычный браузер) — системный шэр или копирование в буфер.
  async function share() {
    if (!puzzle) return;
    const text = buildShareText({ puzzle, moves, streak });
    const appUrl = minikitConfig.miniapp.homeUrl;
    try {
      await composeCastAsync({ text, embeds: appUrl ? [appUrl] : [] });
    } catch {
      const full = appUrl ? `${text}\n\n${appUrl}` : text;
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ text: full });
          return;
        } catch {
          /* пользователь отменил — пробуем буфер обмена ниже */
        }
      }
      try {
        await navigator.clipboard.writeText(full);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* нет доступа к буферу — тихо игнорируем */
      }
    }
  }

  return (
    // min-h-dvh + safe-area паддинги: мини-апп открывается внутри клиента,
    // нужно не залезать под «чёлку»/системные панели.
    <main
      className="relative flex min-h-dvh flex-col items-center justify-center gap-6 px-5 py-8"
      style={{
        paddingTop: "max(2rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
        paddingRight: "max(1.25rem, env(safe-area-inset-right))",
      }}
    >
      {/* Шапка */}
      <header className="flex w-full max-w-sm flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">
          Lights Out
        </h1>
        <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
          Daily Puzzle{puzzle ? ` · ${puzzle.dateKey}` : ""}
        </p>
        {/* Чип серии */}
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-3 py-1 text-sm font-semibold text-amber-300">
          🔥 Streak: {streak}
        </span>
      </header>

      {/* Счётчики: ходы и par */}
      <div className="flex w-full max-w-sm items-center justify-center gap-8">
        <Stat label="Ходы" value={ready ? String(moves) : "—"} />
        <Stat label="Par" value={puzzle ? String(puzzle.par) : "—"} />
      </div>

      {/* Игровое поле 5×5 */}
      <div className="relative w-full max-w-sm">
        <div className="grid grid-cols-5 gap-2.5 sm:gap-3">
          {ready
            ? board.map((on, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Тайл ${i + 1}: ${on ? "вкл" : "выкл"}`}
                  aria-pressed={on}
                  onClick={() => press(i)}
                  disabled={solved}
                  className={[
                    "aspect-square rounded-2xl transition-all duration-150",
                    "active:scale-90 focus:outline-none",
                    on
                      ? "bg-emerald-400 shadow-[0_0_22px_-2px] shadow-emerald-400/70"
                      : "bg-slate-800 hover:bg-slate-700",
                  ].join(" ")}
                />
              ))
            : // Скелет на время инициализации.
              Array.from({ length: SIZE * SIZE }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded-2xl bg-slate-800/60"
                />
              ))}
        </div>

        {/* Экран победы поверх поля */}
        {solved && puzzle && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl bg-slate-950/85 px-4 backdrop-blur-sm">
            <div className="text-5xl">🎉</div>
            <p className="text-center text-lg font-semibold text-slate-50">
              Solved in {moves} / par {puzzle.par}
            </p>
            <p className="text-sm text-amber-300">🔥 Streak: {streak}</p>
            <div className="mt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={share}
                className="rounded-full bg-emerald-400 px-6 py-2.5 text-sm font-semibold text-slate-950 transition active:scale-95"
              >
                {copied ? "Скопировано ✓" : "Поделиться"}
              </button>
              <button
                type="button"
                onClick={restart}
                className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 active:scale-95"
              >
                Заново
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Подсказка + сброс (до победы) */}
      <div className="flex w-full max-w-sm flex-col items-center gap-3">
        <p className="text-center text-xs text-slate-500">
          Тапни тайл — он и соседи по сторонам меняются. Погаси все.
        </p>
        {ready && !solved && (
          <button
            type="button"
            onClick={restart}
            className="rounded-full border border-slate-700 px-5 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 active:scale-95"
          >
            Сбросить
          </button>
        )}
      </div>
    </main>
  );
}

// Маленький блок «значение + подпись».
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-3xl font-bold tabular-nums text-slate-50">
        {value}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
        {label}
      </span>
    </div>
  );
}
