import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "@/minikit.config";
import { RootProvider } from "./rootProvider";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const app = minikitConfig.miniapp;

  // Объект embed, который клиент ленты (Base App / Farcaster) парсит,
  // чтобы показать превью-карточку с кнопкой запуска мини-аппа.
  const embed = {
    version: app.version,
    imageUrl: app.heroImageUrl,
    button: {
      title: `Launch ${app.name}`,
      action: {
        name: `Launch ${app.name}`,
        type: "launch_miniapp",
        url: app.homeUrl,
        splashImageUrl: app.splashImageUrl,
        splashBackgroundColor: app.splashBackgroundColor,
      },
    },
  };
  const embedJson = JSON.stringify(embed);

  return {
    title: app.ogTitle || app.name,
    description: app.description,
    openGraph: {
      title: app.ogTitle || app.name,
      description: app.ogDescription || app.description,
      images: [app.ogImageUrl],
    },
    other: {
      // Новый формат (Base App / актуальные клиенты).
      "fc:miniapp": embedJson,
      // Легаси-формат — для совместимости со старыми Farcaster-клиентами.
      "fc:frame": embedJson,
    },
  };
}

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RootProvider>
      <html lang="en">
        <body className={`${inter.variable} ${sourceCodePro.variable}`}>
          <SafeArea>{children}</SafeArea>
        </body>
      </html>
    </RootProvider>
  );
}
