import Link from "next/link";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";
import {
  landingBodySecondary,
  landingContainer,
  landingCtaPrimary,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

export function FinalCta() {
  return (
    <section className="overflow-x-hidden border-t border-[#E6ECF8] bg-[#F8FAFF] py-7 sm:py-9 lg:py-14">
      <div className={landingContainer}>
        <div className="min-w-0 overflow-hidden rounded-[20px] bg-gradient-to-br from-[#1E3F9C] via-[#2F55B7] to-[#5A78D6] px-5 py-5 shadow-[0_16px_48px_rgba(31,61,120,0.18)] sm:px-8 sm:py-7 lg:rounded-[24px]">
          <h2 className="text-xl font-semibold tracking-[-0.01em] text-white sm:text-2xl">
            Установите BersonCare на телефон
          </h2>
          <p className={cn(landingBodySecondary, "mt-2 max-w-lg text-white/85")}>
            Откроется в один клик — без поиска сайта в браузере.
          </p>
          <Link
            href={LANDING_INSTALL_HASH}
            className={cn(
              landingCtaPrimary,
              "mt-4 max-w-xs bg-white text-[#2F55B7] hover:bg-white/90 sm:mt-5",
            )}
          >
            Установить
          </Link>
        </div>
      </div>
    </section>
  );
}
