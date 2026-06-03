import { cn } from "@/lib/utils";

/** Контейнер секции лендинга. */
export const landingContainer = "mx-auto max-w-full min-w-0 px-4 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8";

/** Mobile-first: H1 32–48px. */
export const landingH1 = cn(
  "text-[2rem] font-semibold leading-[1.1] tracking-[-0.02em] text-[#17264A]",
  "sm:text-[2.5rem] lg:text-[3.25rem] lg:leading-[1.05] lg:tracking-[-0.03em]",
);

export const landingH2 = cn(
  "text-[1.625rem] font-semibold leading-[1.2] tracking-[-0.02em] text-[#17264A]",
  "sm:text-[2rem]",
);

/** Заголовок карточки/секции среднего уровня: 18–22px. */
export const landingH3 = cn(
  "text-[1.125rem] font-semibold leading-snug text-[#17264A]",
  "sm:text-[1.25rem]",
);

/** Заголовок шага установки / карточки возможностей: 16–17px. */
export const landingStepTitle = "text-[1.0625rem] font-semibold leading-snug text-[#17264A]";

/** Lead-параграф (под H1, побольше body). */
export const landingLead = cn(
  "text-[1.0625rem] leading-7 text-[#475467]",
  "sm:text-[1.1875rem] sm:leading-8",
);

export const landingBody = "text-base leading-7 text-[#475467]";

/** Описание шага / вторичный текст: 15–16px. */
export const landingBodySecondary = "text-[0.9375rem] leading-6 text-[#667085]";

/** Подпись под CTA (техническая): 14px. */
export const landingCaption = "text-sm leading-5 text-[#98A2B3]";

export const landingInstallCard = cn(
  "min-w-0 rounded-[22px] border border-[#E6ECF8] bg-white p-5 sm:rounded-[24px] sm:p-7",
);

export const landingCtaPrimary = cn(
  "inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl",
  "bg-[#2F55B7] px-6 text-base font-semibold text-white shadow-[0_8px_22px_rgba(47,85,183,0.32)]",
  "transition hover:bg-[#2448A5] hover:shadow-[0_10px_28px_rgba(47,85,183,0.42)]",
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2F55B7]/30",
  "sm:min-h-[3.5rem] sm:w-auto sm:px-7",
);

export const landingCtaSecondary = cn(
  "inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl",
  "border border-[#D5DEF1] bg-white px-6 text-base font-semibold text-[#17264A]",
  "transition hover:border-[#2F55B7]/45 hover:bg-[#F4F7FF]",
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2F55B7]/20",
  "sm:min-h-[3.5rem] sm:w-auto sm:px-7",
);

/** Sticky header ~56–72px — якорь #install не перекрывается. */
export const landingInstallAnchor = "scroll-mt-[80px]";
