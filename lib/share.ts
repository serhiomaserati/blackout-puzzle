// Текст результата для шэринга (compose cast / share).

export const APP_NAME = "Base Blast";

export interface ShareInput {
  score: number;
  wave: number;
  best: number;
  streak: number;
}

export function buildShareText({
  score,
  wave,
  best,
  streak,
}: ShareInput): string {
  return [
    `${APP_NAME} 🎯 Score ${score}`,
    `Wave ${wave} · Best ${best} · 🔥 ${streak}`,
    "Think you can beat me?",
  ].join("\n");
}
