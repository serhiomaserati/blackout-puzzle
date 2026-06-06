import type { Metadata } from "next";
import { Inter, Source_Code_Pro, Orbitron } from "next/font/google";
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
      // Верификация владения доменом в Base Dashboard (base.dev).
      "base:app_id": "6a240987ab28df7fd2fc173c",
      // Верификация проекта в Talent Protocol (talent app).
      "talentapp:project_verification":
        "2454b9c8959e03a5e1e1e1cdfd742829dddf5b4a2eea0bce92298588f7574f0a9d63925931ab368d92264f742ebe08ddcaf66d4b5f76557ceaab9bf451d22ab2",
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

// Игровой «аркадный» шрифт для заголовков/брендинга.
const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RootProvider>
      <html lang="en">
        <body
          className={`${inter.variable} ${sourceCodePro.variable} ${orbitron.variable}`}
        >
          <SafeArea>{children}</SafeArea>
        </body>
      </html>
    </RootProvider>
  );
}
