import type { InstallHintKind } from "@/components/landing/InstallStepVisual";
import type { LandingInstallPlatform } from "@/components/landing/detectLandingInstallPlatform";

export type InstallStep = {
  title: string;
  hint?: InstallHintKind;
  footnote?: string;
};

export const IOS_INSTALL_INTRO = "Важно: установка работает через Safari.";

export const ANDROID_INSTALL_INTRO = "Важно: откройте сайт в Chrome.";

export const INSTALL_SUCCESS_NOTE = "Готово: иконка BersonCare появится на экране телефона.";

export const stepsIos: readonly InstallStep[] = [
  { title: "Нажмите «Поделиться»", hint: "ios-share" },
  {
    title: "Выберите «На экран Домой»",
    hint: "ios-add-home",
    footnote: "Если пункта не видно — прокрутите меню ниже.",
  },
  { title: "Нажмите «Добавить»", hint: "ios-add" },
] as const;

export const stepsAndroid: readonly InstallStep[] = [
  { title: "Нажмите меню ⋮", hint: "android-menu" },
  { title: "Выберите «Установить приложение»", hint: "android-install" },
  { title: "Подтвердите установку", hint: "android-confirm" },
] as const;

export function platformSectionTitle(platform: LandingInstallPlatform): string {
  return platform === "ios" ? "Как установить на iPhone" : "Как установить на Android";
}

export function platformIntro(platform: LandingInstallPlatform): string {
  return platform === "ios" ? IOS_INSTALL_INTRO : ANDROID_INSTALL_INTRO;
}

export function stepsForPlatform(platform: LandingInstallPlatform): readonly InstallStep[] {
  return platform === "ios" ? stepsIos : stepsAndroid;
}

export function otherPlatformLabel(primary: LandingInstallPlatform): string {
  return primary === "ios" ? "Инструкция для Android" : "Инструкция для iPhone";
}

export function otherPlatform(primary: LandingInstallPlatform): LandingInstallPlatform {
  return primary === "ios" ? "android" : "ios";
}
