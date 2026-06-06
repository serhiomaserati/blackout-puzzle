// Клиентская обвязка контракта лидерборда: ABI + адрес/сеть из public-env.

export const LEADERBOARD_ABI = [
  {
    type: "function",
    name: "submitScore",
    stateMutability: "nonpayable",
    inputs: [
      { name: "score", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getTop",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "list",
        type: "tuple[]",
        components: [
          { name: "player", type: "address" },
          { name: "score", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "bestScore",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const LEADERBOARD_ADDRESS = process.env
  .NEXT_PUBLIC_LEADERBOARD_ADDRESS as `0x${string}` | undefined;

export const LEADERBOARD_CHAIN_ID =
  Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 84532; // Base Sepolia по умолчанию

/** URL CDP Paymaster для gasless-сабмита со smart wallet (пусто = платим газ сами). */
export const LEADERBOARD_PAYMASTER_URL =
  process.env.NEXT_PUBLIC_PAYMASTER_URL || undefined;

/** ERC-8021 attribution-суффикс для Builder Code `bc_h8896xf8` (base.dev).
 *  Предрассчитан через `ox/erc8021` Attribution.toDataSuffix. Дописывается в конец
 *  calldata транзакции submitScore → ончейн-объём аппа атрибутируется билдеру
 *  (payout = главный кошелёк), что и формирует builder score. */
export const BUILDER_CODE_DATA_SUFFIX: `0x${string}` =
  "0x62635f68383839367866380b0080218021802180218021802180218021";

/** Лидерборд включается, только когда задан адрес контракта. */
export const leaderboardEnabled = (): boolean => !!LEADERBOARD_ADDRESS;
