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
  // Подпись владения доменом (JSON Farcaster Signature), сгенерированная
  // Farcaster-тулом для домена base-blaster.vercel.app. Привязывает мини-аппу
  // к FID 575931 (custody 0x386e97e358B8169cf920C429F8ca28a3d45a816E).
  accountAssociation: {
    header:
      "eyJmaWQiOjU3NTkzMSwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDM4NmU5N2UzNThCODE2OWNmOTIwQzQyOUY4Y2EyOGEzZDQ1YTgxNkUifQ",
    payload: "eyJkb21haW4iOiJiYXNlLWJsYXN0ZXIudmVyY2VsLmFwcCJ9",
    signature:
      "Q8KMxhpPVyWD9LnXKTzZ6FNgKs+Ml4EEuenIO/DZfulbv1Is0AAv4jBSQ9hm2hRHFkN/ME7EydQEmuKhAeM3Yxw=",
  },
  // Адрес-владелец из Base Build (тоже подставляется при верификации).
  baseBuilder: {
    ownerAddress: "",
  },
  miniapp: {
    version: "1",
    name: "Base Blast",
    subtitle: "Neon arena survival shooter",
    // Farcaster ограничивает description 170 символами и запрещает спецсимволы
    // (@ # $ % ^ & * + = / \ | ~ « »). Держим строку короткой и чистой.
    description:
      "Twin-stick neon survival shooter. Move with one thumb, aim and fire with the other. Hold off the swarm wave after wave, beat your best onchain, and share it.",
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
