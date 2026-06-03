/**
 * Корневая страница «/»: лендинг PWA BersonCare.
 *
 * В обычном браузере остаётся лендинг.
 * В установленной PWA корень страхуется редиректом в приложение пациента.
 */

import type { Metadata } from "next";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { FinalCta } from "@/components/landing/FinalCta";
import { HeroSection } from "@/components/landing/HeroSection";
import { InstallSection } from "@/components/landing/InstallSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingPwaClientBootstrap } from "@/components/landing/LandingPwaClientBootstrap";
import { SpecialistSection } from "@/components/landing/SpecialistSection";
import { StandaloneRootRedirect } from "@/components/landing/StandaloneRootRedirect";

const ogTitle = "BersonCare — забота о твоём здоровье";
const ogDescription =
  "Мобильный помощник для восстановления и реабилитации: разминки, упражнения, дневник самочувствия, напоминания и полезные материалы.";
const shareImage = "/pwa-icon-512.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://bersoncare.ru"),
  title: ogTitle,
  description: ogDescription,
  openGraph: {
    title: ogTitle,
    description: ogDescription,
    url: "https://bersoncare.ru",
    siteName: "BersonCare",
    type: "website",
    images: [
      {
        url: shareImage,
        width: 512,
        height: 512,
        alt: "Иконка приложения BersonCare",
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

export default async function HomePage() {
  return (
    <div
      data-landing-public
      className="min-h-screen bg-white text-[#17264A]"
    >
      <StandaloneRootRedirect />
      <LandingPwaClientBootstrap />
      <LandingHeader />
      <main>
        <HeroSection />
        <InstallSection />
        <FeatureGrid />
        <SpecialistSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}