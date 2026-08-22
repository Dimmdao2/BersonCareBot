import type { MetadataRoute } from 'next';
import { PATIENT_DEFAULT_SURFACE } from '@/config/productSurfaces';

/**
 * Web App Manifest (PWA).
 *
 * Лендинг `/` используется только как публичная страница установки.
 * Установленное PWA должно открывать приложение пациента.
 *
 * Service worker: `public/sw.js`, scope `/app`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: `${PATIENT_DEFAULT_SURFACE.name} — забота о твоём здоровье`,
    short_name: PATIENT_DEFAULT_SURFACE.name,
    description:
      'Мобильный помощник для восстановления и реабилитации: разминки, упражнения, дневник самочувствия, напоминания и полезные материалы.',
    start_url: '/app/patient',
    scope: '/app',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'ru',
    icons: [
      {
        src: '/pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
