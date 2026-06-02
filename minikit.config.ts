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
    name: "Lights Out",
    subtitle: "Daily logic puzzle",
    description:
      "A new Lights Out puzzle every day. Tap tiles to flip them and their neighbours — clear the whole board, beat par, and keep your streak alive.",
    screenshotUrls: [`${ROOT_URL}/screenshot.png`],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#0b0f17",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["puzzle", "daily", "logic", "game", "streak"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "One puzzle a day. Clear the lights.",
    ogTitle: "Lights Out — Daily Puzzle",
    ogDescription:
      "Solve today's Lights Out puzzle, beat par, and keep your streak.",
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
} as const;
