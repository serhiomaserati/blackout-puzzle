"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSendCalls,
  useCallsStatus,
  useCapabilities,
} from "wagmi";
import type { Hex } from "viem";
import {
  LEADERBOARD_ABI,
  LEADERBOARD_ADDRESS,
  LEADERBOARD_CHAIN_ID,
  LEADERBOARD_PAYMASTER_URL,
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

/** Поток отправки счёта: /api/score (подпись) → контракт submitScore.
 *  Если кошелёк (smart wallet) поддерживает EIP-5792 + paymaster и задан
 *  NEXT_PUBLIC_PAYMASTER_URL — сабмит идёт gasless (sendCalls). Иначе —
 *  обычная транзакция (игрок платит газ). */
export function useSubmitScore() {
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [verifiedScore, setVerifiedScore] = useState<number | null>(null);
  const [hash, setHash] = useState<Hex | undefined>();
  const [callsId, setCallsId] = useState<string | undefined>();
  const [gasless, setGasless] = useState(false);

  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { sendCallsAsync } = useSendCalls();

  // Поддерживает ли подключённый кошелёк gasless (только при заданном URL).
  const { data: capabilities } = useCapabilities({
    query: {
      enabled: !!LEADERBOARD_PAYMASTER_URL && leaderboardEnabled() && isConnected,
    },
  });
  const paymasterSupported =
    !!LEADERBOARD_PAYMASTER_URL &&
    !!capabilities?.[LEADERBOARD_CHAIN_ID]?.paymasterService?.supported;

  // Подтверждение обычной транзакции (EOA-путь).
  const { isSuccess: txMined } = useWaitForTransactionReceipt({
    hash,
    chainId: LEADERBOARD_CHAIN_ID,
    query: { enabled: !!hash && !callsId },
  });

  // Подтверждение gasless-бандла (EIP-5792).
  const { data: callsStatus } = useCallsStatus({
    id: callsId as string,
    query: {
      enabled: !!callsId,
      refetchInterval: (query) =>
        query.state.data?.status === "success" ? false : 1500,
    },
  });

  useEffect(() => {
    if (txMined) setPhase("done");
  }, [txMined]);

  useEffect(() => {
    if (callsStatus?.status === "success") {
      const h = callsStatus.receipts?.[0]?.transactionHash as Hex | undefined;
      if (h) setHash(h);
      setPhase("done");
    }
  }, [callsStatus]);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setVerifiedScore(null);
    setHash(undefined);
    setCallsId(undefined);
    setGasless(false);
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

        const args = [
          BigInt(data.score),
          BigInt(data.nonce),
          data.signature,
        ] as const;

        setPhase("submitting");
        if (paymasterSupported) {
          // Gasless: спонсируем газ через CDP Paymaster (smart wallet).
          const result = await sendCallsAsync({
            calls: [
              {
                to: LEADERBOARD_ADDRESS,
                abi: LEADERBOARD_ABI,
                functionName: "submitScore",
                args,
              },
            ],
            capabilities: {
              paymasterService: { url: LEADERBOARD_PAYMASTER_URL as string },
            },
            chainId: LEADERBOARD_CHAIN_ID,
          });
          setGasless(true);
          setCallsId(typeof result === "string" ? result : result.id);
        } else {
          const txHash = await writeContractAsync({
            address: LEADERBOARD_ADDRESS,
            abi: LEADERBOARD_ABI,
            functionName: "submitScore",
            args,
            chainId: LEADERBOARD_CHAIN_ID,
          });
          setHash(txHash);
        }
        setPhase("confirming");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submit failed");
        setPhase("error");
      }
    },
    [paymasterSupported, sendCallsAsync, writeContractAsync],
  );

  return { submit, reset, phase, error, verifiedScore, hash, gasless };
}
