import { Apple, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { InstallStepVisual } from "@/components/landing/InstallStepVisual";
import type { InstallStep } from "@/components/landing/installSteps";
import type { LandingInstallPlatform } from "@/components/landing/detectLandingInstallPlatform";
import {
  landingBodySecondary,
  landingH3,
  landingInstallCard,
  landingStepTitle,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const platformMeta: Record<
  LandingInstallPlatform,
  { label: string; Icon: LucideIcon }
> = {
  ios: { label: "Для iPhone", Icon: Apple },
  android: { label: "Для Android", Icon: Smartphone },
};

export function PlatformInstallCard({
  platform,
  intro,
  steps,
}: {
  platform: LandingInstallPlatform;
  intro: string;
  steps: readonly InstallStep[];
}) {
  const { label, Icon } = platformMeta[platform];

  return (
    <article className={landingInstallCard}>
      <header className="flex items-center gap-2.5">
        <Icon className="h-5 w-5 text-[#667085]" aria-hidden />
        <h3 className={landingH3}>{label}</h3>
      </header>

      <p className={cn(landingBodySecondary, "mt-3 font-medium text-[#17264A]")}>{intro}</p>

      <ol className="mt-4 space-y-4">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF4FF] text-base font-semibold text-[#2F55B7]"
              aria-hidden
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={landingStepTitle}>{step.title}</p>
              {step.hint ? <InstallStepVisual kind={step.hint} /> : null}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
