"use client";
import { ReactNode } from "react";
import { base, baseSepolia } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import "@coinbase/onchainkit/styles.css";

// Сеть лидерборда задаётся env: 84532 = Base Sepolia (тест), иначе Base mainnet.
const chain =
  Number(process.env.NEXT_PUBLIC_CHAIN_ID) === baseSepolia.id
    ? baseSepolia
    : base;

export function RootProvider({ children }: { children: ReactNode }) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      chain={chain}
      config={{
        appearance: {
          mode: "dark",
        },
        wallet: {
          display: "modal",
          preference: "all",
        },
      }}
      miniKit={{
        enabled: true,
        autoConnect: true,
        notificationProxyUrl: undefined,
      }}
    >
      {children}
    </OnchainKitProvider>
  );
}
