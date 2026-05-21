import { InstallStepVisual } from "@/components/landing/InstallStepVisual";
import type { InstallStep } from "@/components/landing/installSteps";
import {
  landingBodySecondary,
  landingInstallCard,
  landingStepTitle,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

export function PlatformInstallCard({
  intro,
  steps,
  successNote,
}: {
  intro: string;
  steps: readonly InstallStep[];
  successNote: string;
}) {
  return (
    <article className={landingInstallCard}>
      <p className={cn(landingBodySecondary, "font-medium text-[#17264A]")}>{intro}</p>

      <ol className="mt-4 space-y-3.5">
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
              {step.footnote ? (
                <p className="mt-1 text-sm leading-5 text-[#98A2B3]">{step.footnote}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 rounded-xl border border-[#C9EFDA] bg-[#ECFDF3] px-3.5 py-2.5 text-[0.9375rem] font-medium leading-6 text-[#166534]">
        {successNote}
      </p>
    </article>
  );
}
