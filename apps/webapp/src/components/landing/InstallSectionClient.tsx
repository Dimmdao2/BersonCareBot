"use client";

import { useMemo, useState } from "react";
import { PlatformInstallCard } from "@/components/landing/PlatformInstallCard";
import { detectLandingInstallPlatform } from "@/components/landing/detectLandingInstallPlatform";
import {
  otherPlatform,
  otherPlatformLabel,
  platformIntro,
  stepsForPlatform,
} from "@/components/landing/installSteps";
import { landingBodySecondary } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

export function InstallSectionClient() {
  const primary = useMemo(() => {
    if (typeof navigator === "undefined") return "ios" as const;
    return detectLandingInstallPlatform(navigator.userAgent, navigator.maxTouchPoints);
  }, []);

  const secondary = otherPlatform(primary);
  const [showOther, setShowOther] = useState(false);

  return (
    <div className="mt-6 sm:mt-7">
      <PlatformInstallCard platform={primary} intro={platformIntro(primary)} steps={stepsForPlatform(primary)} />

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowOther((v) => !v)}
          className="text-base font-medium text-[#2F55B7] underline-offset-2 hover:text-[#2448A5] hover:underline"
          aria-expanded={showOther}
        >
          {otherPlatformLabel(primary)}
        </button>

        {showOther ? (
          <div className="mt-4">
            <PlatformInstallCard
              platform={secondary}
              intro={platformIntro(secondary)}
              steps={stepsForPlatform(secondary)}
            />
          </div>
        ) : null}
      </div>

      <p className={cn(landingBodySecondary, "mt-4 text-center text-[#98A2B3]")}>
        После установки иконка BersonCare появится на экране телефона.
      </p>
    </div>
  );
}
