/** Публичный specialist-first лендинг Therapysto. */

import type { Metadata } from 'next';
import './styles/landing.css';
import { LandingAcquisition } from '@/components/landing/LandingAcquisition';
import { LandingPwaClientBootstrap } from '@/components/landing/LandingPwaClientBootstrap';
import { StandaloneRootRedirect } from '@/components/landing/StandaloneRootRedirect';
import { env } from '@/config/env';
import { STAFF_SURFACE } from '@/config/productSurfaces';

const ogTitle = `${STAFF_SURFACE.name} — кабинет специалиста`;
const ogDescription =
  'Расписание, карточки клиентов, программы реабилитации и связь с пациентами в одном рабочем кабинете.';
const shareImage = '/pwa-icon-512.png';

export function generateMetadata(): Metadata {
  const appBaseUrl = env.APP_BASE_URL;
  return {
    metadataBase: new URL(appBaseUrl),
    title: ogTitle,
    description: ogDescription,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: appBaseUrl,
      siteName: STAFF_SURFACE.name,
      type: 'website',
      images: [
        {
          url: shareImage,
          width: 512,
          height: 512,
          alt: `Иконка ${STAFF_SURFACE.name}`,
        },
      ],
    },
    twitter: {
      card: 'summary',
      title: ogTitle,
      description: ogDescription,
      images: [shareImage],
    },
  };
}

export default function HomePage() {
  const appBaseUrl = env.APP_BASE_URL;
  return (
    <div data-landing-public className="min-h-screen bg-white text-[#17264A]">
      <StandaloneRootRedirect />
      <LandingPwaClientBootstrap />
      <LandingAcquisition appBaseUrl={appBaseUrl} />
    </div>
  );
}
