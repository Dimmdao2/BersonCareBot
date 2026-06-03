"use client";

import { useEffect, useState } from "react";
import { PlatformInstallCard } from "@/components/landing/PlatformInstallCard";
import {
  type LandingInstallPlatform,
  detectLandingInstallPlatform,
  detectRequiredBrowserMissing,
} from "@/components/landing/detectLandingInstallPlatform";
import {
  INSTALL_SUCCESS_NOTE,
  platformIntro,
  stepsForPlatform,
} from "@/components/landing/installSteps";
import { landingH2, landingBodySecondary } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const tabs: ReadonlyArray<{ value: LandingInstallPlatform; label: string }> = [
  { value: "ios", label: "iPhone" },
  { value: "android", label: "Android" },
] as const;

export function InstallSectionClient() {
  const [installState, setInstallState] = useState<{
    active: LandingInstallPlatform;
    wrongBrowser: boolean;
  }>({
    active: "ios",
    wrongBrowser: false,
  });

  useEffect(() => {
    const platform = detectLandingInstallPlatform(
      navigator.userAgent,
      navigator.maxTouchPoints,
    );
    const browserMissing = detectRequiredBrowserMissing(navigator.userAgent, platform);
    const frame = window.requestAnimationFrame(() => {
      setInstallState({ active: platform, wrongBrowser: browserMissing });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function selectPlatform(platform: LandingInstallPlatform) {
    setInstallState({
      active: platform,
      wrongBrowser: detectRequiredBrowserMissing(navigator.userAgent, platform),
    });
  }

  return (
    <>
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2F55B7] sm:text-[0.8125rem]">
          Установка за 30 секунд
        </p>
        <h2 className={cn(landingH2, "mt-2")}>Как установить приложение</h2>
        <p className={cn(landingBodySecondary, "mx-auto mt-3 max-w-md")}>
          Выберите ваш телефон и повторите шаги — приложение появится на экране как обычная иконка.
        </p>
      </div>

      <div className="mt-6 flex justify-center sm:mt-7">
        <div
          role="tablist"
          aria-label="Выберите тип телефона"
          className="inline-flex w-full max-w-xs gap-1 rounded-2xl border border-[#E6ECF8] bg-white p-1 sm:w-auto"
        >
          {tabs.map((tab) => {
            const selected = installState.active === tab.value;
            return (
              <button
                key={tab.value}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => selectPlatform(tab.value)}
                className={cn(
                  "flex-1 rounded-xl px-5 py-2.5 text-base font-semibold transition sm:px-7",
                  selected
                    ? "bg-[#2F55B7] text-white"
                    : "text-[#475467] hover:bg-[#F4F7FF] hover:text-[#17264A]",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 sm:mt-8">
        <PlatformInstallCard
          intro={platformIntro(installState.active)}
          steps={stepsForPlatform(installState.active)}
          successNote={INSTALL_SUCCESS_NOTE}
          wrongBrowser={installState.wrongBrowser}
          platform={installState.active}
        />
      </div>
    </>
  );
}
