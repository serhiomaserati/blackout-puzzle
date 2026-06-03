const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

/**
 * MiniApp configuration object. Must follow the mini app manifest specification.
 *
 * @see {@link https://docs.base.org/mini-apps/features/manifest}
 */
export const minikitConfig = {
  // ⚠️ Эти три поля НЕ заполняем вручную — их генерирует Base Build при
  // верификации домена (account association). Подставишь после деплоя (см. Фаза 4).
  accountAssociation: {
    header: "",
    payload: "",
    signature: "",
  },
  // Адрес-владелец из Base Build (тоже подставляется при верификации).
  baseBuilder: {
    ownerAddress: "",
  },
  miniapp: {
    version: "1",
    name: "Base Blast",
    subtitle: "Neon arena survival shooter",
    description:
      "Drag to move, auto-fire at the swarm, and survive as long as you can. Each wave hits harder — rack up your score, beat your best, and share it.",
    screenshotUrls: [`${ROOT_URL}/screenshot.png`],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#05080f",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["arcade", "shooter", "survival", "base", "neon"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Survive the neon swarm.",
    ogTitle: "Base Blast — survival shooter",
    ogDescription:
      "Survive the neon swarm, beat your best score, and share it.",
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
} as const;
