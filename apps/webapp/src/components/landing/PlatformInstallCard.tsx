import { CheckCircle2, Info } from "lucide-react";
import { InstallStepVisual } from "@/components/landing/InstallStepVisual";
import type { InstallStep } from "@/components/landing/installSteps";
import {
  landingInstallCard,
  landingStepTitle,
} from "@/components/landing/landingTypography";

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
      <p className="flex items-start gap-2.5 rounded-xl border border-[#FFE6B5] bg-[#FFF8E8] px-4 py-3 text-[0.9375rem] font-medium leading-6 text-[#7A4A00]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#C2780A]" aria-hidden />
        <span className="min-w-0">{intro}</span>
      </p>

      <ol className="mt-5 space-y-4 sm:mt-6 sm:space-y-5">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex gap-3.5 rounded-2xl border border-[#EEF2FA] bg-[#F8FAFF] p-3.5 sm:gap-4 sm:p-4"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold text-[#2F55B7] shadow-[0_2px_8px_rgba(31,61,120,0.08)] ring-1 ring-[#D5DEF1] sm:h-10 sm:w-10 sm:text-[1.0625rem]"
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
