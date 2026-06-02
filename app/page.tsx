"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMiniKit, useComposeCast } from "@coinbase/onchainkit/minikit";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { Avatar, Name, Address, Identity } from "@coinbase/onchainkit/identity";
import {
  getDailyWord,
  scoreGuess,
  isValidWord,
  WORD_LEN,
  MAX_GUESSES,
  type LetterState,
  type DailyWord,
} from "@/lib/game";
import { loadProgress, recordWin } from "@/lib/streak";
import { loadDay, saveDay, type DayStatus } from "@/lib/dailyStore";
import { buildShareText, APP_NAME } from "@/lib/share";
import { minikitConfig } from "@/minikit.config";

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

export default function Home() {
  // Готовность мини-аппа.
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [isMiniAppReady, setMiniAppReady]);

  const { composeCastAsync } = useComposeCast();

  // Состояние игры.
  const [daily, setDaily] = useState<DailyWord | null>(null);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [status, setStatus] = useState<DayStatus>("playing");
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [solvedToday, setSolvedToday] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Текущий статус через ref — чтобы обработчики ввода были «чистыми»
  // (без вложенных setState, которые React.StrictMode дублирует в dev).
  const statusRef = useRef<DayStatus>("playing");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Инициализация на клиенте (избегаем hydration mismatch).
  useEffect(() => {
    const d = getDailyWord();
    setDaily(d);

    const saved = loadDay(d.dateKey);
    if (saved) {
      setGuesses(saved.guesses);
      setStatus(saved.status);
    }
    const prog = loadProgress();
    setStreak(prog.streak);
    setBest(prog.bestStreak);
    setSolvedToday(
      prog.lastWonKey === d.dateKey || saved?.status === "won",
    );
  }, []);

  const ready = daily !== null;

  // Короткое всплывающее сообщение.
  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1300);
  }, []);

  const addLetter = useCallback((ch: string) => {
    if (statusRef.current !== "playing") return;
    setCurrent((c) => (c.length < WORD_LEN ? c + ch : c));
  }, []);

  const removeLetter = useCallback(() => {
    setCurrent((c) => c.slice(0, -1));
  }, []);

  const submit = useCallback(() => {
    if (!daily || status !== "playing") return;
    if (current.length < WORD_LEN) {
      flash("Not enough letters");
      return;
    }
    if (!isValidWord(current)) {
      flash("Not in word list");
      return;
    }
    const newGuesses = [...guesses, current];
    const won = current === daily.answer;
    const lost = !won && newGuesses.length >= MAX_GUESSES;
    const newStatus: DayStatus = won ? "won" : lost ? "lost" : "playing";

    setGuesses(newGuesses);
    setCurrent("");
    setStatus(newStatus);
    saveDay({ dateKey: daily.dateKey, guesses: newGuesses, status: newStatus });

    if (won) {
      const prog = recordWin(daily.dateKey);
      setStreak(prog.streak);
      setBest(prog.bestStreak);
      setSolvedToday(true);
      flash("Solved! 🎉");
    } else if (lost) {
      flash(`Answer: ${daily.answer.toUpperCase()}`);
    }
  }, [daily, status, current, guesses, flash]);

  // Физическая клавиатура (для теста на десктопе).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") submit();
      else if (e.key === "Backspace") removeLetter();
      else if (/^[a-zA-Z]$/.test(e.key)) addLetter(e.key.toLowerCase());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, removeLetter, addLetter]);

  // «Поделиться».
  async function share() {
    if (!daily) return;
    const text = buildShareText({
      number: daily.number,
      answer: daily.answer,
      guesses,
      won: status === "won",
      streak,
    });
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
          /* отменили — пробуем буфер ниже */
        }
      }
      try {
        await navigator.clipboard.writeText(full);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* нет доступа к буферу */
      }
    }
  }

  // Агрегированное состояние каждой буквы для раскраски клавиатуры.
  const letterStates: Record<string, LetterState> = {};
  if (daily) {
    const rank: Record<LetterState, number> = {
      absent: 0,
      present: 1,
      correct: 2,
    };
    for (const g of guesses) {
      const sc = scoreGuess(g, daily.answer);
      for (let i = 0; i < WORD_LEN; i++) {
        const ch = g[i];
        if (!(ch in letterStates) || rank[sc[i]] > rank[letterStates[ch]]) {
          letterStates[ch] = sc[i];
        }
      }
    }
  }

  const finished = status !== "playing";

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#05080f] text-slate-100">
      {/* Неоновые подсветки фона */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-emerald-500/25 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-cyan-500/15 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-[120px]" />

      <div
        className="relative z-10 mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-4 px-4 py-6"
        style={{
          paddingTop: "max(1.5rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        {/* Шапка: заголовок + кошелёк */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_2px] shadow-emerald-400/80" />
            <div className="leading-tight">
              <h1 className="text-lg font-bold tracking-tight text-slate-50">
                {APP_NAME}
              </h1>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
                {daily ? `#${daily.number} · ${daily.dateKey}` : "Daily"}
              </p>
            </div>
          </div>

          <Wallet>
            <ConnectWallet className="!rounded-full !bg-slate-800/80 !px-3 !py-1.5 !text-xs !font-semibold hover:!bg-slate-700/80">
              <Avatar className="h-5 w-5" />
              <Name className="text-slate-100" />
            </ConnectWallet>
            <WalletDropdown>
              <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                <Avatar />
                <Name />
                <Address />
              </Identity>
              <WalletDropdownDisconnect />
            </WalletDropdown>
          </Wallet>
        </header>

        {/* Статы */}
        <div className="grid grid-cols-3 gap-2.5">
          <StatCard accent="amber" icon="🔥" label="Streak" value={ready ? String(streak) : "—"} />
          <StatCard accent="violet" icon="★" label="Best" value={ready ? String(best) : "—"} />
          <StatCard
            accent="emerald"
            icon={solvedToday ? "✓" : "•"}
            label="Today"
            value={solvedToday ? "Done" : ready ? "Playing" : "—"}
          />
        </div>

        {/* Доска 6×5 + всплывающее сообщение */}
        <div className="relative flex flex-1 flex-col justify-center">
          {toast && (
            <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-lg">
              {toast}
            </div>
          )}

          <div className="mx-auto grid w-full max-w-[20rem] grid-rows-6 gap-1.5">
            {Array.from({ length: MAX_GUESSES }).map((_, r) => {
              const isSubmitted = r < guesses.length;
              const isCurrent = r === guesses.length && status === "playing";
              const guess = isSubmitted ? guesses[r] : "";
              const states =
                isSubmitted && daily ? scoreGuess(guess, daily.answer) : null;
              return (
                <div key={r} className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: WORD_LEN }).map((__, c) => {
                    const ch = isSubmitted
                      ? guess[c]
                      : isCurrent
                        ? current[c] ?? ""
                        : "";
                    const state: LetterState | "empty" = states
                      ? states[c]
                      : "empty";
                    return (
                      <div
                        key={c}
                        className={[
                          "flex aspect-square items-center justify-center rounded-lg text-2xl font-bold uppercase transition-colors",
                          cellClass(state, !!ch),
                        ].join(" ")}
                      >
                        {ch}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Результат + кнопка «Поделиться» */}
        {finished && daily && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-900/70 px-4 py-3 ring-1 ring-slate-700/50">
            <p className="text-center text-sm font-bold text-slate-50">
              {status === "won"
                ? `Solved in ${guesses.length}/${MAX_GUESSES}! 🎉`
                : `Out of tries — answer: ${daily.answer.toUpperCase()}`}
            </p>
            <p className="text-xs font-semibold text-amber-300">
              🔥 Streak: {streak} · ★ {best}
            </p>
            <button
              type="button"
              onClick={share}
              className="mt-1 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-6 py-2.5 text-sm font-bold text-slate-950 shadow-[0_0_22px_-2px] shadow-emerald-400/60 transition active:scale-95"
            >
              {copied ? "Copied ✓" : "Share"}
            </button>
          </div>
        )}

        {/* Экранная клавиатура */}
        <div className="flex flex-col gap-1.5">
          {KEY_ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1.5">
              {ri === 2 && (
                <KeyButton wide label="Enter" onClick={submit} disabled={finished} />
              )}
              {row.split("").map((ch) => (
                <KeyButton
                  key={ch}
                  label={ch}
                  state={letterStates[ch]}
                  onClick={() => addLetter(ch)}
                  disabled={finished}
                />
              ))}
              {ri === 2 && (
                <KeyButton wide label="⌫" onClick={removeLetter} disabled={finished} />
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

// Цвет ячейки доски по состоянию буквы.
function cellClass(state: LetterState | "empty", filled: boolean): string {
  switch (state) {
    case "correct":
      return "bg-gradient-to-br from-emerald-300 to-emerald-500 text-slate-950 ring-1 ring-emerald-200/40 shadow-[0_0_18px_-4px] shadow-emerald-400/60";
    case "present":
      return "bg-amber-400 text-slate-950 ring-1 ring-amber-200/40";
    case "absent":
      return "bg-slate-800/80 text-slate-400";
    default:
      return filled
        ? "border-2 border-slate-500 text-slate-50"
        : "border-2 border-slate-700/40 text-slate-50";
  }
}

// Кнопка экранной клавиатуры.
function KeyButton({
  label,
  state,
  wide,
  disabled,
  onClick,
}: {
  label: string;
  state?: LetterState;
  wide?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const color =
    state === "correct"
      ? "bg-emerald-500 text-slate-950"
      : state === "present"
        ? "bg-amber-400 text-slate-950"
        : state === "absent"
          ? "bg-slate-800 text-slate-500"
          : "bg-slate-700 text-slate-100 hover:bg-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex h-12 items-center justify-center rounded-md text-sm font-bold uppercase transition active:scale-95 disabled:opacity-50",
        wide ? "px-3 text-xs" : "flex-1",
        color,
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// Неоновая карточка-стат.
function StatCard({
  accent,
  icon,
  label,
  value,
}: {
  accent: "amber" | "violet" | "emerald";
  icon: string;
  label: string;
  value: string;
}) {
  const accents: Record<string, string> = {
    amber: "text-amber-300 ring-amber-400/20",
    violet: "text-violet-300 ring-violet-400/20",
    emerald: "text-emerald-300 ring-emerald-400/20",
  };
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-2xl bg-slate-900/60 px-2 py-2.5 ring-1 ${accents[accent]}`}
    >
      <span className={accents[accent].split(" ")[0]}>{icon}</span>
      <span className="text-sm font-bold tabular-nums text-slate-50">{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
        {label}
      </span>
    </div>
  );
}
