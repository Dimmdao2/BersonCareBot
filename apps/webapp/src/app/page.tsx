/** Публичный specialist-first лендинг BersonCare. */

import type { Metadata } from "next";
import "./styles/landing.css";
import { LandingAcquisition } from "@/components/landing/LandingAcquisition";
import { LandingPwaClientBootstrap } from "@/components/landing/LandingPwaClientBootstrap";
import { StandaloneRootRedirect } from "@/components/landing/StandaloneRootRedirect";
import { getAppBaseUrl } from "@/modules/system-settings/integrationRuntime";

const ogTitle = "BersonCare — кабинет специалиста";
const ogDescription =
  "Расписание, карточки клиентов, программы реабилитации и связь с пациентами в одном рабочем кабинете.";
const shareImage = "/pwa-icon-512.png";

export async function generateMetadata(): Promise<Metadata> {
  const appBaseUrl = await getAppBaseUrl();
  return {
    metadataBase: new URL(appBaseUrl),
    title: ogTitle,
    description: ogDescription,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: appBaseUrl,
      siteName: "BersonCare",
      type: "website",
      images: [
        {
          url: shareImage,
          width: 512,
          height: 512,
          alt: "Иконка BersonCare",
        },
      ],
    },
    twitter: {
      card: "summary",
      title: ogTitle,
      description: ogDescription,
      images: [shareImage],
    },
  };
}

export default async function HomePage() {
  const appBaseUrl = await getAppBaseUrl();
  return (
    <div
      data-landing-public
      className="min-h-screen bg-white text-[#17264A]"
    >
      <StandaloneRootRedirect />
      <LandingPwaClientBootstrap />
      <LandingAcquisition appBaseUrl={appBaseUrl} />
    </div>
  );
}
