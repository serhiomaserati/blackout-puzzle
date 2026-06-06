# Deploy BaseBlastLeaderboard to Base mainnet via Remix

Deploy the contract **from your main wallet** (so the deployment is credited to it),
without ever exposing your private key — Remix signs through your browser wallet.
On mainnet **players pay their own gas**, so we do NOT use a Paymaster here.

## 0. Fund your main wallet on Base mainnet

You need a little ETH **on the Base network** (not Ethereum mainnet) for deploy gas.
Base is an L2 — the deploy costs roughly **$0.05–0.30**. Get ETH on Base via:
- Coinbase: withdraw ETH and pick the **Base** network, or
- Bridge at <https://bridge.base.org>.

A few dollars of ETH is plenty (deploy + headroom).

## 1. Open Remix and load the contract

1. Go to <https://remix.ethereum.org>.
2. Load the flattened contract (single file, no imports to resolve):
   - **Easiest:** in Remix, `File` → `Load from GitHub`, paste:
     `https://raw.githubusercontent.com/serhiomaserati/base-blast/main/contracts/BaseBlastLeaderboard.flat.sol`
   - Or create a new file `BaseBlastLeaderboard.flat.sol` and paste the contents from
     `contracts/BaseBlastLeaderboard.flat.sol`.

## 2. Compile

1. **Solidity Compiler** tab.
2. Compiler version: **0.8.28** (exact).
3. Click **Advanced Configurations** → enable **Optimization**, runs = **200**.
   (Must match what the contract was written/tested with.)
4. Click **Compile BaseBlastLeaderboard.flat.sol**. Should compile with no errors.

## 3. Deploy

1. **Deploy & Run Transactions** tab.
2. **Environment** → **Injected Provider** (your Coinbase Wallet / MetaMask).
   - In the wallet popup, make sure the network is **Base** (chainId 8453). If it
     shows Ethereum or Base Sepolia, switch the wallet to **Base Mainnet** first.
3. **Contract** dropdown → select **BaseBlastLeaderboard**.
4. Next to the orange **Deploy** button, expand the constructor fields and enter:
   - `initialOwner` = **your main wallet address** (the one connected — you become owner)
   - `signer` = `0x9E21e8fdBaCaEbeEd1126F28Fb0f5F371b155Cf0`  *(the verifier address)*
5. Click **Deploy** → confirm the transaction **in your wallet**. Your key stays in the
   wallet; Remix only gets the signature.

## 4. Copy the address and send it to me

Once mined, Remix shows the deployed contract under **Deployed Contracts** — copy its
address (also visible on <https://basescan.org> in your wallet's tx). **Send me that
address.** Then I will:

- verify the contract on BaseScan (mainnet),
- set the production env (`NEXT_PUBLIC_CHAIN_ID=8453`,
  `NEXT_PUBLIC_LEADERBOARD_ADDRESS=<address>`, `SIGNER_PRIVATE_KEY` server-side),
- and we continue the Vercel deploy (see `DEPLOY.md`).

> The `signer` private key (for the server `SIGNER_PRIVATE_KEY`) is stored locally in
> `.env.mainnet` (gitignored). It must stay matched to the `signer` address above, or the
> contract rejects every score.
