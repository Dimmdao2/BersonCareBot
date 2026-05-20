import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";
import { landingContainer } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const installBtnClass = cn(
  buttonVariants({ size: "default" }),
  "min-h-11 rounded-xl bg-[#2F55B7] px-4 text-base font-semibold text-white hover:bg-[#2448A5] sm:min-h-9 sm:text-sm",
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
