"use client";

import { useCallback, useEffect, useState } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { Hex } from "viem";
import {
  LEADERBOARD_ABI,
  LEADERBOARD_ADDRESS,
  LEADERBOARD_CHAIN_ID,
  leaderboardEnabled,
} from "./leaderboard";
import type { Run } from "./arena";

export interface TopEntry {
  player: `0x${string}`;
  score: bigint;
}

/** Топ-игроки с контракта (пусто, пока лидерборд не задеплоен). */
export function useTopScores() {
  const { data, refetch, isLoading } = useReadContract({
    address: LEADERBOARD_ADDRESS,
    abi: LEADERBOARD_ABI,
    functionName: "getTop",
    chainId: LEADERBOARD_CHAIN_ID,
    query: { enabled: leaderboardEnabled() },
  });
  return {
    top: (data as readonly TopEntry[] | undefined) ?? [],
    isLoading,
    refetch,
  };
}

/** Личный ончейн-рекорд игрока. */
export function useOnchainBest(address?: `0x${string}`) {
  const { data, refetch } = useReadContract({
    address: LEADERBOARD_ADDRESS,
    abi: LEADERBOARD_ABI,
    functionName: "bestScore",
    args: address ? [address] : undefined,
    chainId: LEADERBOARD_CHAIN_ID,
    query: { enabled: leaderboardEnabled() && !!address },
  });
  return { best: (data as bigint | undefined) ?? BigInt(0), refetch };
}

export type SubmitPhase =
  | "idle"
  | "verifying" // сервер пересимулирует и подписывает
  | "submitting" // ждём подпись кошелька / отправку
  | "confirming" // ждём подтверждение транзакции
  | "done"
  | "error";

/** Поток отправки счёта: /api/score (подпись) → контракт submitScore. */
export function useSubmitScore() {
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [verifiedScore, setVerifiedScore] = useState<number | null>(null);
  const [hash, setHash] = useState<Hex | undefined>();

  const { writeContractAsync } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({
    hash,
    chainId: LEADERBOARD_CHAIN_ID,
    query: { enabled: !!hash },
  });

  useEffect(() => {
    if (isSuccess) setPhase("done");
  }, [isSuccess]);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setVerifiedScore(null);
    setHash(undefined);
  }, []);

  const submit = useCallback(
    async (run: Run, address: `0x${string}`) => {
      if (!leaderboardEnabled() || !LEADERBOARD_ADDRESS) return;
      setError(null);
      setPhase("verifying");
      try {
        const res = await fetch("/api/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, run }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || `Verifier error ${res.status}`);
        }
        const data = (await res.json()) as {
          score: number;
          nonce: string;
          signature: Hex;
        };
        setVerifiedScore(data.score);

        setPhase("submitting");
        const txHash = await writeContractAsync({
          address: LEADERBOARD_ADDRESS,
          abi: LEADERBOARD_ABI,
          functionName: "submitScore",
          args: [BigInt(data.score), BigInt(data.nonce), data.signature],
          chainId: LEADERBOARD_CHAIN_ID,
        });
        setHash(txHash);
        setPhase("confirming");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submit failed");
        setPhase("error");
      }
    },
    [writeContractAsync],
  );

  return { submit, reset, phase, error, verifiedScore, hash };
}
