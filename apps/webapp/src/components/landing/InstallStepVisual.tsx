import Image from "next/image";

export type InstallHintKind =
  | "ios-share"
  | "ios-add-home"
  | "ios-add"
  | "android-menu"
  | "android-install";

type InstallStepVisualProps = {
  kind: InstallHintKind;
};

type ScreenshotProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Tailwind max-width класс; по умолчанию для портретных скринов */
  maxW?: string;
};

function StepScreenshot({ src, alt, width, height, maxW = "max-w-[180px] sm:max-w-[210px]" }: ScreenshotProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={`mt-3 h-auto w-full rounded-xl border border-[#DDE3F0] shadow-sm ${maxW}`}
    />
  );
}

/** Скриншоты-подсказки к шагам установки. */
export function InstallStepVisual({ kind }: InstallStepVisualProps) {
  switch (kind) {
    case "ios-share":
      return (
        <StepScreenshot
          src="/images/landing/install/ios-step-1-share.png"
          alt="Safari — кнопка «Поделиться» внизу браузера"
          width={507}
          height={1024}
        />
      );
    case "ios-add-home":
      return (
        <StepScreenshot
          src="/images/landing/install/ios-step-2-add-home.png"
          alt="Меню «Поделиться» — пункт «На экран Домой»"
          width={537}
          height={1024}
        />
      );
    case "ios-add":
      return (
        <StepScreenshot
          src="/images/landing/install/ios-step-3-confirm.png"
          alt="Диалог подтверждения — кнопка «Добавить»"
          width={655}
          height={412}
          maxW="max-w-[260px] sm:max-w-[300px]"
        />
      );
    case "android-menu":
      return (
        <StepScreenshot
          src="/images/landing/install/android-step-1-menu.png"
          alt="Chrome — кнопка меню ⋮ в правом углу"
          width={504}
          height={1024}
        />
      );
    case "android-install":
      return (
        <StepScreenshot
          src="/images/landing/install/android-step-2-install.png"
          alt="Меню Chrome — пункт «Установить приложение»"
          width={504}
          height={1024}
        />
      );
    default:
      return null;
  }
}
