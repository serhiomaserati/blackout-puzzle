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

/** Лидерборд включается, только когда задан адрес контракта. */
export const leaderboardEnabled = (): boolean => !!LEADERBOARD_ADDRESS;
