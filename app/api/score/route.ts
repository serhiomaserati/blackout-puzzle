// ───────────────────────────────────────────────────────────────────────────
// Верификатор счёта (честный анти-чит).
//
// Клиент шлёт записанный ран { address, run: { seed, inputs } }. Сервер:
//   1. пересимулирует ран ДЕТЕРМИНИРОВАННО тем же кодом, что и клиент (lib/sim);
//   2. берёт ТОЛЬКО свой посчитанный счёт (claim клиента игнорируется);
//   3. подписывает EIP-712 (player, score, nonce) ключом доверенного подписанта.
//
// Контракт принимает только такие подписи → накрутить счёт нельзя.
// ───────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { isAddress, getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { simulateRun, type SimInput } from "@/lib/sim";

export const runtime = "nodejs";

const MAX_TICKS = 200_000; // ~55 мин при 60 тиков/с — потолок против огромных пейлоадов

const EIP712_TYPES = {
  Score: [
    { name: "player", type: "address" },
    { name: "score", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

function sanitizeInputs(raw: unknown): SimInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TICKS) {
    return null;
  }
  const out: SimInput[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Record<string, unknown>;
    if (!r || typeof r !== "object") return null;
    const moveX = Number(r.moveX);
    const moveY = Number(r.moveY);
    const aim = Number(r.aim);
    if (!Number.isFinite(moveX) || !Number.isFinite(moveY) || !Number.isFinite(aim)) {
      return null;
    }
    // Движение клиент нормирует в круг радиуса 1; режем с небольшим допуском,
    // чтобы инпуты не могли «разогнать» игрока быстрее задуманного.
    const m = Math.hypot(moveX, moveY);
    const k = m > 1 ? 1 / m : 1;
    out[i] = {
      moveX: moveX * k,
      moveY: moveY * k,
      aim,
      firing: r.firing === true,
    };
  }
  return out;
}

export async function POST(req: Request) {
  const pk = process.env.SIGNER_PRIVATE_KEY as Hex | undefined;
  const contract = process.env.NEXT_PUBLIC_LEADERBOARD_ADDRESS;
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID);

  if (!pk || !contract || !isAddress(contract) || !Number.isFinite(chainId)) {
    return NextResponse.json(
      { error: "Leaderboard not configured" },
      { status: 503 },
    );
  }

  let body: { address?: unknown; run?: { seed?: unknown; inputs?: unknown } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const address = body.address;
  if (typeof address !== "string" || !isAddress(address)) {
    return NextResponse.json({ error: "Bad address" }, { status: 400 });
  }
  const seed = Number(body.run?.seed);
  if (!Number.isInteger(seed)) {
    return NextResponse.json({ error: "Bad seed" }, { status: 400 });
  }
  const inputs = sanitizeInputs(body.run?.inputs);
  if (!inputs) {
    return NextResponse.json({ error: "Bad inputs" }, { status: 400 });
  }

  // Авторитетный счёт — результат нашей пересимуляции.
  const result = simulateRun(seed, inputs);
  if (result.score <= 0) {
    return NextResponse.json({ error: "Zero score" }, { status: 400 });
  }

  const player = getAddress(address);
  const score = BigInt(result.score);
  const nonce = BigInt(`0x${crypto.randomUUID().replace(/-/g, "")}`);

  const account = privateKeyToAccount(pk);
  const signature = await account.signTypedData({
    domain: {
      name: "BaseBlast",
      version: "1",
      chainId,
      verifyingContract: getAddress(contract),
    },
    types: EIP712_TYPES,
    primaryType: "Score",
    message: { player, score, nonce },
  });

  return NextResponse.json({
    score: result.score,
    wave: result.wave,
    ticks: result.ticks,
    nonce: nonce.toString(),
    signature,
  });
}
