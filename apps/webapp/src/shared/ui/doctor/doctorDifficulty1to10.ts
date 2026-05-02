import type { CSSProperties } from "react";

/** Заливка дорожки слайдера: от почти прозрачного светло-синего к почти чёрному тёмно-синему (1→10). */
export function doctorDifficulty1to10TrackFill(level: number): string {
  const t = Math.max(0, Math.min(1, (level - 1) / 9));
  const h = 215;
  const s = 42 + t * 25;
  const l = 94 - t * 81;
  const alpha = 0.18 + t * 0.82;
  return `hsl(${h} ${Math.round(s)}% ${Math.round(l)}% / ${alpha.toFixed(3)})`;
}

export function doctorDifficulty1to10ClampedInt(raw: number): number {
  return Number.isFinite(raw) ? Math.max(1, Math.min(10, Math.round(raw))) : 5;
}

/** Стили дорожки: градиент с inline-цветом (браузеры часто отбрасывают при invalid syntax в CSS-файле). */
export function doctorDifficulty1to10RangeStyle(difficulty: number): CSSProperties {
  const level = doctorDifficulty1to10ClampedInt(difficulty);
  const p = ((level - 1) / 9) * 100;
  const fill = doctorDifficulty1to10TrackFill(level);
  const unfilled = "color-mix(in srgb, var(--muted) 88%, var(--border))";
  return {
    "--doctor-diff-1to10-fill": fill,
    background: `linear-gradient(to right, ${fill} 0%, ${fill} 100%) 0 0 / ${p}% 100% no-repeat, ${unfilled}`,
  } as CSSProperties;
}

/** Цвет подписей 1 и 10 — та же ось оттенка, что у заливки трека, с контрастом для текста. */
export function doctorDifficulty1to10EndpointLabelColor(endpoint: 1 | 10): string {
  const t = endpoint === 1 ? 0 : 1;
  const h = 215;
  const s = 42 + t * 25;
  const l = endpoint === 1 ? 46 : 26;
  return `hsl(${h} ${Math.round(s)}% ${l}%)`;
}
