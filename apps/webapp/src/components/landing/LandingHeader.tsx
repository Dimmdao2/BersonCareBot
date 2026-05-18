import Link from "next/link";
import { Menu } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";

const installBtnClass = cn(
  buttonVariants({ size: "default" }),
  "rounded-xl bg-[#2F55B7] px-4 text-sm font-semibold text-white hover:bg-[#2448A5]",
);

export function LandingHeader() {
  return (
    <header className="border-b border-[#DDE3F0]/70 bg-white">
      <div className="mx-auto flex h-[72px] max-w-full items-center justify-between px-5 sm:px-6 md:max-w-3xl lg:h-20 lg:max-w-6xl lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-[#17264A]">
          <span className="text-lg font-semibold tracking-tight sm:text-xl">BersonCare</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link href={LANDING_INSTALL_HASH} className={installBtnClass}>
            Установить приложение
          </Link>

          <button
            type="button"
            aria-label="Меню"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#DDE3F0] text-[#17264A]"
          >
            <Menu className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
