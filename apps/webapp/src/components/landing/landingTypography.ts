import { cn } from "@/lib/utils";

/** Контейнер секции лендинга. */
export const landingContainer = "mx-auto max-w-full min-w-0 px-4 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8";

/** Mobile-first: читаемость 45+ (28–30px H1, 16px body). */
export const landingH1 = cn(
  "text-[1.875rem] font-semibold leading-[1.15] tracking-[-0.02em] text-[#17264A]",
  "sm:text-[2.4rem] lg:text-[3rem] lg:leading-[1.05] lg:tracking-[-0.04em]",
);

export const landingH2 = cn(
  "text-2xl font-semibold tracking-[-0.02em] text-[#17264A]",
  "sm:text-3xl",
);

/** Платформа в карточке установки: 18–20px. */
export const landingH3 = cn("text-xl font-semibold text-[#17264A]", "sm:text-xl");

/** Заголовок шага установки / карточки возможностей: 16–17px. */
export const landingStepTitle = "text-[1.0625rem] font-medium leading-snug text-[#17264A]";

export const landingBody = "text-base leading-7 text-[#667085]";

/** Описание шага / вторичный текст: 15–16px. */
export const landingBodySecondary = "text-[0.9375rem] leading-6 text-[#667085]";

/** Подпись под CTA (техническая): 14px. */
export const landingCaption = "text-sm leading-5 text-[#98A2B3]";

export const landingInstallCard = cn(
  "min-w-0 rounded-[22px] border border-[#E6ECF8] bg-white p-5 shadow-sm",
  "sm:rounded-[24px] sm:p-6",
);

export const landingCtaPrimary = cn(
  "inline-flex min-h-[3rem] w-full items-center justify-center rounded-xl bg-[#2F55B7] px-5",
  "text-base font-semibold text-white hover:bg-[#2448A5] sm:min-h-[3.25rem] sm:w-auto",
);

/** Sticky header ~56–72px — якорь #install не перекрывается. */
export const landingInstallAnchor = "scroll-mt-[72px]";
