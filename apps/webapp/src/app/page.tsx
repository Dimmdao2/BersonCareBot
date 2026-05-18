/**
 * Корневая страница «/»: лендинг PWA BersonCare (без редиректа в `/app`).
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

const ogTitle = "BersonCare — кабинет восстановления и реабилитации";
const ogDescription =
  "PWA-приложение для пациентов: программа реабилитации, разминки, дневник самочувствия, напоминания, материалы и запись на приём.";

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
  },
};

export default async function HomePage() {
  return (
    <div className="min-h-screen bg-white text-[#17264A]">
      <LandingPwaClientBootstrap />
      <LandingHeader />
      <main>
        <HeroSection />
        <FeatureGrid />
        <SpecialistSection />
        <InstallSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
