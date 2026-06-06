// Канонический прод-домен мини-аппа. Манифест ДОЛЖЕН всегда отдавать один и тот
// же адрес (под него подписан accountAssociation), поэтому не используем VERCEL_URL
// — он у каждого деплоя свой. NEXT_PUBLIC_URL оставлен как ручной override.
const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://base-blaster.vercel.app");

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
      "Twin-stick neon survival: left thumb moves, right thumb aims and fires (WASD + mouse on desktop). Hold off the swarm wave after wave — rack up your score, beat your best onchain, and share it.",
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
