# Deploying Base Blast

Step-by-step to take Base Blast from localhost to a live Base mini app on Vercel.
The onchain leaderboard contract is already deployed & verified on **Base Sepolia**
(`0xf6719a176F7b54ea828597c5e61348149787c9B2`); this guide covers the **frontend +
verifier API** hosting and the **mini-app manifest** (Base App embed).

> Secrets (e.g. `SIGNER_PRIVATE_KEY`) are NOT in this file — copy their values from
> your local `.env` (app) and `contracts/.env`. Never commit real secret values.

---

## 1. Import the repo into Vercel

1. Go to <https://vercel.com/new> and import `serhiomaserati/base-blast`.
2. Framework preset: **Next.js** (auto-detected). Root directory: **`./`** (the repo
   root already is the Next app — leave default).
3. **Don't deploy yet** — add the environment variables first (next step), otherwise the
   first build ships without the leaderboard wired.

## 2. Environment variables

Add these in **Vercel → Project → Settings → Environment Variables** (Production +
Preview). `NEXT_PUBLIC_*` are exposed to the browser by design; `SIGNER_PRIVATE_KEY` is
server-only — keep it secret.

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_PROJECT_NAME` | `Base Blast` | |
| `NEXT_PUBLIC_CHAIN_ID` | `84532` | Base Sepolia |
| `NEXT_PUBLIC_LEADERBOARD_ADDRESS` | `0xf6719a176F7b54ea828597c5e61348149787c9B2` | deployed + verified |
| `NEXT_PUBLIC_PAYMASTER_URL` | _from local `.env`_ | CDP Paymaster (gasless) |
| `NEXT_PUBLIC_ONCHAINKIT_API_KEY` | _from CDP portal_ | recommended (RPC/wallet UX) |
| `SIGNER_PRIVATE_KEY` | _from local `.env`_ | **secret** — server-only verifier key |
| `NEXT_PUBLIC_URL` | _leave empty for now_ | set in step 4 once you have the domain |

> The signer key here must correspond to the `trustedSigner` the contract was deployed
> with (`0x3F15de5E1C7dEf15D27bed1512548f000F168fAf`). If they don't match, the contract
> rejects every signed score.

## 3. First deploy

Trigger the deploy. You'll get a URL like `https://base-blast-xxxx.vercel.app`
(or attach a custom domain under **Settings → Domains**). Decide which domain is the
canonical one — the mini-app manifest is **bound to exactly one domain**.

## 4. Set the canonical URL and redeploy

1. Set `NEXT_PUBLIC_URL` = your canonical domain (e.g. `https://baseblast.xyz`,
   **no trailing slash**).
2. Redeploy. The manifest (`/.well-known/farcaster.json`) and all OG/splash/icon URLs
   are built from `NEXT_PUBLIC_URL`, so every absolute link now points at the live host.

Verify it serves:

```
curl https://<your-domain>/.well-known/farcaster.json
```

You should see the `miniapp` block populated, but `accountAssociation` still empty —
that's the next step.

## 5. Verify the domain in Base Build (account association)

The mini app only embeds in Base App once the domain is cryptographically associated
with your account.

1. Open **Base Build → Mini Apps**: <https://docs.base.org/mini-apps/features/manifest>
2. Run the domain verification / "Account Association" flow for `NEXT_PUBLIC_URL`.
   It generates three values: `header`, `payload`, `signature`, plus your
   `ownerAddress`.
3. Paste them into `minikit.config.ts`:

   ```ts
   accountAssociation: {
     header: "…",
     payload: "…",
     signature: "…",
   },
   baseBuilder: {
     ownerAddress: "0x…",
   },
   ```

4. Commit + push → Vercel auto-redeploys. The manifest now serves a valid
   `accountAssociation`.

## 6. Smoke-test in Base App

1. Open the mini app inside **Base App** (or the Mini App preview/embed tool).
2. Connect a **Coinbase Smart Wallet** (gasless path needs a smart wallet).
3. Play a run → **Game Over → Submit score onchain**. With the smart wallet +
   allowlisted Paymaster, it should post **gas-free** ("On leaderboard ✓ · gas-free").
4. Open the **Ranks** tab — your address + score should appear (reads from the contract).

If submit fails with "policy rejected": confirm the CDP Paymaster allowlist includes
contract `0xf6719a…9B2` **and** method `submitScore` (selector `0xf2c0a29a`).

---

## Going to Base mainnet (later)

Only after testnet traction. Outline:

1. Redeploy the contract to **Base mainnet** (chainId `8453`) with a funded deployer:
   `cd contracts && forge script script/Deploy.s.sol --rpc-url base --broadcast --verify`
   (set `BASE_RPC` + `BASESCAN_API_KEY` in `contracts/.env`).
2. Update Vercel envs: `NEXT_PUBLIC_CHAIN_ID=8453`,
   `NEXT_PUBLIC_LEADERBOARD_ADDRESS=<mainnet address>`, and a **mainnet** CDP Paymaster
   URL (`…/rpc/v1/base/…`) with the contract+`submitScore` allowlisted.
3. Re-verify the domain association if the canonical URL changed.
