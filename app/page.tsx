"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useMiniKit, useComposeCast } from "@coinbase/onchainkit/minikit";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { Avatar, Name, Address, Identity } from "@coinbase/onchainkit/identity";
import { ArenaGame } from "@/lib/arena";
import { loadProgress, recordWin } from "@/lib/streak";
import { loadBest, saveBest } from "@/lib/scores";
import { buildShareText, APP_NAME } from "@/lib/share";
import { minikitConfig } from "@/minikit.config";

type Tab = "game" | "board" | "arsenal";
type Phase = "menu" | "playing" | "over";

const todayKey = () => new Date().toISOString().slice(0, 10);
const shortAddr = (a?: string) =>
  a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "You";

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [isMiniAppReady, setMiniAppReady]);

  const { composeCastAsync } = useComposeCast();
  const { address, isConnected } = useAccount();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ArenaGame | null>(null);

  const [tab, setTab] = useState<Tab>("game");
  const [phase, setPhase] = useState<Phase>("menu");
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [best, setBest] = useState(0);
  const [streak, setStreak] = useState(0);
  const [playedToday, setPlayedToday] = useState(false);
  const [copied, setCopied] = useState(false);

  // Загрузка статов при старте.
  useEffect(() => {
    const prog = loadProgress();
    setBest(loadBest());
    setStreak(prog.streak);
    setPlayedToday(prog.lastWonKey === todayKey());
  }, []);

  // Движок арены живёт только на вкладке Game (создаём при входе, рушим при выходе).
  useEffect(() => {
    if (tab !== "game" || !canvasRef.current) return;
    const game = new ArenaGame(canvasRef.current, {
      onGameOver: (finalScore, finalWave) => {
        setBest(saveBest(finalScore));
        setStreak(recordWin(todayKey()).streak); // дневной чек-ин
        setPlayedToday(true);
        setScore(finalScore);
        setWave(finalWave);
        setPhase("over");
      },
    });
    gameRef.current = game;
    setPhase("menu");
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [tab]);

  function startGame() {
    gameRef.current?.reset();
    gameRef.current?.start();
    setScore(0);
    setWave(1);
    setPhase("playing");
  }

  // Дневной чек-ин из «Арсенала».
  function checkIn() {
    setStreak(recordWin(todayKey()).streak);
    setPlayedToday(true);
  }

  async function share() {
    const text = buildShareText({
      score: Math.max(score, best),
      wave,
      best,
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
          /* отменили */
        }
      }
      try {
        await navigator.clipboard.writeText(full);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* нет буфера */
      }
    }
  }

  return (
    <main className="retro-grid relative min-h-dvh overflow-hidden bg-[#05080f] text-slate-100">
      {/* фоновые неоновые пятна */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-80 w-80 rounded-full bg-fuchsia-500/15 blur-[120px]" />

      <div
        className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-3 px-3 py-4"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        {/* Шапка: бренд + кошелёк */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_2px] shadow-emerald-400/80" />
            <h1 className="font-display bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-base font-black uppercase tracking-widest text-transparent">
              {APP_NAME}
            </h1>
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

        {/* Вкладки */}
        <nav className="grid grid-cols-3 gap-1 rounded-full bg-slate-900/70 p-1 ring-1 ring-slate-800">
          {(
            [
              ["game", "Arena"],
              ["board", "Ranks"],
              ["arsenal", "Arsenal"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={[
                "rounded-full py-1.5 text-xs font-bold uppercase tracking-wider transition",
                tab === id
                  ? "bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950"
                  : "text-slate-400 hover:text-slate-200",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* ───── ARENA ───── */}
        {tab === "game" && (
          <>
            <div className="flex items-center justify-between rounded-xl bg-slate-900/60 px-3 py-2 text-xs ring-1 ring-slate-800">
              <span className="font-semibold uppercase tracking-wider text-emerald-300">
                ● Arena ready
              </span>
              <span className="font-semibold text-slate-400">
                Best <span className="text-slate-100">{best}</span> · 🔥{" "}
                <span className="text-slate-100">{streak}</span>
              </span>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl ring-1 ring-emerald-500/30 shadow-[0_0_40px_-10px] shadow-emerald-500/40">
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full touch-none select-none"
              />

              {phase === "menu" && (
                <Overlay>
                  <h2 className="font-display text-2xl font-black uppercase tracking-widest text-slate-50">
                    {APP_NAME}
                  </h2>
                  <p className="max-w-[16rem] text-center text-sm text-slate-400">
                    Left thumb moves, right thumb aims & fires. Survive the
                    waves.
                  </p>
                  <p className="text-center text-[11px] text-slate-500">
                    Desktop: WASD to move · mouse to aim · hold to fire
                  </p>
                  <PrimaryButton onClick={startGame}>Start</PrimaryButton>
                </Overlay>
              )}

              {phase === "over" && (
                <Overlay>
                  <h2 className="font-display text-xl font-black uppercase tracking-widest text-rose-400">
                    Game Over
                  </h2>
                  <div className="flex items-end gap-1">
                    <span className="text-5xl font-black tabular-nums text-slate-50">
                      {score}
                    </span>
                    <span className="mb-1 text-sm text-slate-400">pts</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-400">
                    Wave {wave} · Best {best} · 🔥 {streak}
                  </p>
                  <div className="mt-1 flex items-center gap-3">
                    <PrimaryButton onClick={startGame}>Play again</PrimaryButton>
                    <GhostButton onClick={share}>
                      {copied ? "Copied ✓" : "Share"}
                    </GhostButton>
                  </div>
                </Overlay>
              )}
            </div>
          </>
        )}

        {/* ───── RANKS ───── */}
        {tab === "board" && (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3">
            <Panel title="Leaderboard">
              <div className="grid grid-cols-[2rem_1fr_4rem] gap-2 px-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>#</span>
                <span>Player</span>
                <span className="text-right">Best</span>
              </div>
              <div className="grid grid-cols-[2rem_1fr_4rem] items-center gap-2 rounded-xl bg-emerald-400/10 px-1 py-2.5 ring-1 ring-emerald-400/20">
                <span className="text-center font-black text-emerald-300">1</span>
                <span className="truncate text-sm font-semibold text-slate-100">
                  {isConnected ? shortAddr(address) : "You"}
                </span>
                <span className="text-right font-bold tabular-nums text-slate-50">
                  {best}
                </span>
              </div>
              {[2, 3, 4].map((r) => (
                <div
                  key={r}
                  className="grid grid-cols-[2rem_1fr_4rem] items-center gap-2 px-1 py-2 text-slate-600"
                >
                  <span className="text-center font-bold">{r}</span>
                  <span className="text-sm">—</span>
                  <span className="text-right tabular-nums">—</span>
                </div>
              ))}
            </Panel>
            <p className="rounded-xl bg-slate-900/60 px-3 py-2.5 text-center text-xs text-slate-400 ring-1 ring-slate-800">
              🌐 Global onchain leaderboard with gasless score submission is
              coming next.
            </p>
          </div>
        )}

        {/* ───── ARSENAL ───── */}
        {tab === "arsenal" && (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-2.5">
            <MissionCard
              icon="🛡️"
              title="Daily Check-in"
              desc="Show up every day to keep your streak alive."
              badge={playedToday ? "Done" : "Available"}
              badgeTone={playedToday ? "done" : "open"}
              action={playedToday ? "Checked in" : "Check in"}
              disabled={playedToday}
              onClick={checkIn}
            />
            <MissionCard
              icon="📣"
              title="Share your score"
              desc="Cast your best run and challenge your friends."
              badge="Available"
              badgeTone="open"
              action={copied ? "Copied ✓" : "Share"}
              onClick={share}
            />
            <MissionCard
              icon="🔫"
              title="Unlock neon skin"
              desc="Gasless onchain unlock on Base. Coming soon."
              badge="Locked"
              badgeTone="locked"
              action="Locked"
              disabled
              onClick={() => {}}
            />
            {!isConnected && (
              <p className="px-1 text-center text-[11px] text-slate-500">
                Connect your wallet to get ready for onchain rewards.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 px-5 backdrop-blur-sm">
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-display rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-8 py-3 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_24px_-2px] shadow-emerald-400/60 transition active:scale-95"
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 active:scale-95"
    >
      {children}
    </button>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-900/60 p-3 ring-1 ring-slate-800">
      <h3 className="font-display mb-2 px-1 text-sm font-bold uppercase tracking-widest text-slate-200">
        {title}
      </h3>
      {children}
    </div>
  );
}

function MissionCard({
  icon,
  title,
  desc,
  badge,
  badgeTone,
  action,
  disabled,
  onClick,
}: {
  icon: string;
  title: string;
  desc: string;
  badge: string;
  badgeTone: "done" | "open" | "locked";
  action: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const tone =
    badgeTone === "done"
      ? "bg-emerald-400/15 text-emerald-300"
      : badgeTone === "locked"
        ? "bg-slate-700/40 text-slate-400"
        : "bg-amber-400/15 text-amber-300";
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-900/60 p-3 ring-1 ring-slate-800">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-2xl ring-1 ring-slate-700">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h4 className="truncate text-sm font-bold text-slate-100">{title}</h4>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tone}`}
          >
            {badge}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-400">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="shrink-0 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-3.5 py-2 text-xs font-bold text-slate-950 transition active:scale-95 disabled:opacity-40"
      >
        {action}
      </button>
    </div>
  );
}
