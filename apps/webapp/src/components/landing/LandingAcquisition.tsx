import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { FinalCta } from "@/components/landing/FinalCta";
import { HeroSection } from "@/components/landing/HeroSection";
import { InstallSection } from "@/components/landing/InstallSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { PracticePathsSection } from "@/components/landing/PracticePathsSection";
import { PricingTeaserSection } from "@/components/landing/PricingTeaserSection";
import { SpecialistSection } from "@/components/landing/SpecialistSection";
import { WorkflowSection } from "@/components/landing/WorkflowSection";

export function LandingAcquisition({ appBaseUrl }: { appBaseUrl: string }) {
  return (
    <>
      <LandingHeader />
      <main>
        <HeroSection />
        <PracticePathsSection />
        <WorkflowSection />
        <FeatureGrid />
        <PricingTeaserSection />
        <SpecialistSection />
        <InstallSection appBaseUrl={appBaseUrl} />
        <FinalCta />
      </main>
      <LandingFooter />
    </>
  );
}
