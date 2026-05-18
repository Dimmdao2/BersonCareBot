/**
 * Ассеты кладите в `apps/webapp/public/landing/` и перечисляйте здесь — показываются на `/`.
 * Поддерживаются обычные форматы (png, jpg, webp). Пока файла нет, блок остаётся аккуратным плейсхолдером.
 */
export type MarketingLandingGalleryItem = {
  file: string;
  alt: string;
  /** Скрин телефона или горизонтальное фото */
  ratio: "phone" | "wide";
};

/** Скрины интерфейса и фото — замените имена файлов на свои после добавления в `public/landing/`. */
export const MARKETING_LANDING_GALLERY: MarketingLandingGalleryItem[] = [
  { file: "screen-today.png", alt: "Главный экран приложения", ratio: "phone" },
  { file: "screen-program.png", alt: "Программа реабилитации", ratio: "phone" },
  { file: "photo-warmup.jpg", alt: "Разминка", ratio: "wide" },
];

/** Портрет для блока «Обо мне» (необязательно). */
export const MARKETING_LANDING_AUTHOR_PHOTO = "photo-author.jpg";
