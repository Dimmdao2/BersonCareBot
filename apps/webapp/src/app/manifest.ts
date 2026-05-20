import type { MetadataRoute } from "next";

/**
 * Web App Manifest (PWA). Иконки — `public/pwa-icon-*.png` (плейсхолдеры до фирменного набора).
 * `scope: "/app"` — установленное приложение не тянет публичный `/` и пути вне `/app` (напр. `/legal/*`) в ту же оболочку.
 * Service worker: `public/sw.js` — только `install`/`activate` (без перехвата сети); регистрация с лендинга `/` с `scope: "/app"` (`PwaInstallSection`), не в Mini App.
 * `orientation: portrait-primary` — только в установленной PWA; нативный fullscreen видео может временно разрешить landscape (зависит от ОС/браузера).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BersonCare",
    short_name: "BersonCare",
    description: "Разминки и упражнения от реабилитолога",
    start_url: "/app/patient",
    scope: "/app",
    display: "standalone",
    orientation: "portrait-primary",
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
