import type { MetadataRoute } from "next";

export const STAFF_PWA_MANIFEST_PATH = "/manifest-staff.webmanifest";
export const STAFF_PWA_ICON_192 = "/staff-pwa-icon-192.png";
export const STAFF_PWA_ICON_512 = "/staff-pwa-icon-512.png";
export const STAFF_PWA_APPLE_TOUCH = "/staff-pwa-apple-touch.png";

/** Канон staff manifest (волна 2 §B). Patient `manifest.ts` не меняем. */
export function buildStaffPwaManifest(): MetadataRoute.Manifest {
  return {
    id: "/app-staff",
    name: "BersonAdmin",
    short_name: "BersonAdmin",
    description: "Кабинет врача и администратора: клиенты, расписание, контент, настройки.",
    start_url: "/app/doctor",
    scope: "/app",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "ru",
    icons: [
      {
        src: STAFF_PWA_ICON_192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: STAFF_PWA_ICON_512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
