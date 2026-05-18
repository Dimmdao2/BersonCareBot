import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";

const installBtnClass = cn(
  buttonVariants({ size: "default" }),
  "h-8 rounded-lg bg-[#2F55B7] px-3 text-xs font-semibold text-white hover:bg-[#2448A5] sm:h-9 sm:rounded-xl sm:px-4 sm:text-sm",
);

export function LandingHeader() {
  return (
    <header className="border-b border-[#DDE3F0]/70 bg-white">
      <div className="mx-auto flex h-14 max-w-full items-center justify-between px-4 sm:h-[72px] sm:px-6 md:max-w-3xl lg:h-20 lg:max-w-6xl lg:px-8">
        <Link href="/" className="flex items-center text-[#17264A] leading-none">
          <span className="text-sm font-semibold tracking-tight whitespace-nowrap max-[439px]:text-[13px] sm:text-lg lg:text-xl">
            BersonCare
          </span>
        </Link>

        <div className="flex shrink-0 items-center">
          <Link href={LANDING_INSTALL_HASH} className={installBtnClass}>
            <span className="sm:hidden">Установить</span>
            <span className="hidden sm:inline">Установить приложение</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
