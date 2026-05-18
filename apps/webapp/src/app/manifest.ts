import type { MetadataRoute } from "next";

/**
 * Web App Manifest (PWA). Иконки — `public/pwa-icon-*.png` (плейсхолдеры до фирменного набора).
 * Service worker: `public/sw.js`, регистрация только с лендинга `/` и не в Mini App.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BersonCare",
    short_name: "BersonCare",
    description: "Разминки и упражнения от реабилитолога",
    start_url: "/app/patient",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#284da0",
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
