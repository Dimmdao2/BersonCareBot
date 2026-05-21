import Link from "next/link";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";
import { landingContainer } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const installBtnClass = cn(
  "inline-flex h-9 items-center justify-center rounded-lg border border-[#2F55B7]/35 bg-white px-3.5",
  "text-sm font-semibold text-[#2F55B7] hover:border-[#2F55B7]/55 hover:bg-[#EEF4FF]",
);

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#DDE3F0]/70 bg-white">
      <div className={cn(landingContainer, "flex h-14 items-center justify-between sm:h-[72px] lg:h-20")}>
        <Link href="/" className="flex items-center text-base font-semibold tracking-tight text-[#17264A] sm:text-lg lg:text-xl">
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
