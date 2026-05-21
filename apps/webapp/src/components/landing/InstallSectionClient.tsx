"use client";

import { useMemo, useState } from "react";
import { PlatformInstallCard } from "@/components/landing/PlatformInstallCard";
import { detectLandingInstallPlatform } from "@/components/landing/detectLandingInstallPlatform";
import {
  INSTALL_SUCCESS_NOTE,
  otherPlatform,
  otherPlatformLabel,
  platformIntro,
  platformSectionTitle,
  stepsForPlatform,
} from "@/components/landing/installSteps";
import { landingH2 } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

export function InstallSectionClient() {
  const primary = useMemo(() => {
    if (typeof navigator === "undefined") return "ios" as const;
    return detectLandingInstallPlatform(navigator.userAgent, navigator.maxTouchPoints);
  }, []);

  const secondary = otherPlatform(primary);
  const [showOther, setShowOther] = useState(false);

  return (
    <>
      <h2 className={cn(landingH2, "text-center")}>{platformSectionTitle(primary)}</h2>

      <div className="mt-5 sm:mt-6">
        <PlatformInstallCard
          intro={platformIntro(primary)}
          steps={stepsForPlatform(primary)}
          successNote={INSTALL_SUCCESS_NOTE}
        />

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
                intro={platformIntro(secondary)}
                steps={stepsForPlatform(secondary)}
                successNote={INSTALL_SUCCESS_NOTE}
              />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
