import Link from "next/link";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";
import { landingContainer } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const installBtnClass = cn(
  "inline-flex h-10 items-center justify-center rounded-xl bg-[#2F55B7] px-4",
  "text-sm font-semibold text-white shadow-[0_6px_18px_rgba(47,85,183,0.28)]",
  "transition hover:bg-[#2448A5] hover:shadow-[0_8px_22px_rgba(47,85,183,0.36)]",
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2F55B7]/30",
  "sm:h-11 sm:px-5",
);

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#DDE3F0]/70 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className={cn(landingContainer, "flex h-14 items-center justify-between sm:h-16 lg:h-20")}>
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-[#17264A] sm:text-lg lg:text-xl"
        >
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#2F55B7] to-[#5A78D6] text-sm font-bold text-white shadow-[0_4px_14px_rgba(47,85,183,0.32)] sm:h-9 sm:w-9 sm:text-base"
            aria-hidden
          >
            B
          </span>
          BersonCare
        </Link>

        <div className="flex shrink-0 items-center">
          <Link href={LANDING_INSTALL_HASH} className={installBtnClass}>
            Установить
          </Link>
        </div>
      </div>
    </header>
  );
}
