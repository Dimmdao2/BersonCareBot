import Link from "next/link";
import { LANDING_INSTALL_HASH } from "@/components/landing/landingConstants";
import {
  landingBodySecondary,
  landingContainer,
  landingCtaPrimary,
  landingH2,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

export function FinalCta() {
  return (
    <section className="overflow-x-hidden border-t border-[#E6ECF8] bg-[#F8FAFF] py-10 lg:py-20">
      <div className={landingContainer}>
        <div className="min-w-0 overflow-hidden rounded-[22px] bg-gradient-to-br from-[#1E3F9C] via-[#2F55B7] to-[#5A78D6] px-5 py-7 shadow-[0_20px_60px_rgba(31,61,120,0.20)] sm:px-10 sm:py-12 lg:rounded-[28px]">
          <h2 className={cn(landingH2, "text-white")}>Установите BersonCare на экран телефона</h2>
          <p className={cn(landingBodySecondary, "mt-3 max-w-lg text-white/85 sm:mt-4")}>
            Так приложение будет открываться в один клик — без поиска сайта в браузере.
          </p>
          <Link
            href={LANDING_INSTALL_HASH}
            className={cn(
              landingCtaPrimary,
              "mt-5 bg-white text-[#2F55B7] hover:bg-white/90 sm:mt-6",
            )}
          >
            Установить
          </Link>
        </div>
      </div>
    </section>
  );
}
