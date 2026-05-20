import type { MetadataRoute } from "next";

/**
 * Web App Manifest (PWA). Иконки — `public/pwa-icon-*.png`, `apple-touch-icon.png`.
 * Лендинг `/`: установка «На экран Домой» с корня сайта (start_url /, scope /).
 * Service worker: `public/sw.js` — регистрация с лендинга (`LandingPwaClientBootstrap`), scope `/app` для кабинета.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BersonCare",
    short_name: "BersonCare",
    description: "Разминки и упражнения от реабилитолога",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "ru",
    icons: [
      {
        src: "/pwa-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
