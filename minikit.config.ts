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
    name: "Word Daily",
    subtitle: "Guess the daily 5-letter word",
    description:
      "A new 5-letter word every day. You get 6 tries — green means right spot, yellow means right letter wrong spot. Solve it, build your streak, and share your grid.",
    screenshotUrls: [`${ROOT_URL}/screenshot.png`],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#05080f",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["word", "daily", "puzzle", "game", "streak"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "One word a day. Guess in six.",
    ogTitle: "Word Daily — Guess the 5-letter word",
    ogDescription:
      "Solve today's 5-letter word in six tries and keep your streak.",
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
} as const;
