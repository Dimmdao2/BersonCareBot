import { CheckCircle2 } from "lucide-react";
import { InstallStepVisual } from "@/components/landing/InstallStepVisual";
import type { InstallStep } from "@/components/landing/installSteps";
import type { LandingInstallPlatform } from "@/components/landing/detectLandingInstallPlatform";
import { WrongBrowserBanner } from "@/components/landing/WrongBrowserBanner";
import {
  landingInstallCard,
  landingStepTitle,
} from "@/components/landing/landingTypography";

export function PlatformInstallCard({
  steps,
  successNote,
  wrongBrowser = false,
  platform = "ios",
}: {
  intro?: string;
  steps: readonly InstallStep[];
  successNote: string;
  wrongBrowser?: boolean;
  platform?: LandingInstallPlatform;
}) {
  return (
    <article className={landingInstallCard}>
      {wrongBrowser && <WrongBrowserBanner platform={platform} />}

      <ol className={`space-y-4 sm:space-y-5 ${wrongBrowser ? "mt-5 sm:mt-6" : ""}`}>
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex gap-3.5 rounded-2xl border border-[#EEF2FA] bg-[#F8FAFF] p-3.5 sm:gap-4 sm:p-4"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold text-[#2F55B7] ring-1 ring-[#D5DEF1] sm:h-10 sm:w-10 sm:text-[1.0625rem]"
              aria-hidden
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={landingStepTitle}>{step.title}</p>
              {step.hint ? <InstallStepVisual kind={step.hint} /> : null}
              {step.footnote ? (
                <p className="mt-1.5 text-sm leading-5 text-[#98A2B3]">{step.footnote}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#C9EFDA] bg-[#ECFDF3] px-4 py-3 text-[0.9375rem] font-medium leading-6 text-[#166534] sm:mt-6">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#17A56B]" aria-hidden />
        <span className="min-w-0">{successNote}</span>
      </p>
    </article>
  );
}
