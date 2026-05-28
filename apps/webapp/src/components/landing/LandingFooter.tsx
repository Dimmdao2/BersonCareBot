import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  landingBody,
  landingBodySecondary,
  landingContainer,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const linkClass =
  "inline-flex items-center gap-1.5 transition hover:text-[#17264A]";

export function LandingFooter() {
  return (
    <footer className="overflow-x-hidden border-t border-[#E6ECF8] bg-[#F8FAFF] py-10 sm:py-12">
      <div className={landingContainer}>
        <div className="grid min-w-0 gap-8 md:grid-cols-2 md:items-start md:gap-12">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#2F55B7] to-[#5A78D6] text-sm font-bold text-white"
                aria-hidden
              >
                B
              </span>
              <p className="text-base font-semibold text-[#17264A]">BersonCare</p>
            </div>
            <p className={cn(landingBody, "mt-3 max-w-sm")}>
              Пациентский кабинет для реабилитации и сопровождения.
            </p>
          </div>

          <div className={cn("flex flex-col gap-3", landingBodySecondary)}>
            <Link
              href="https://dmitryberson.ru"
              className={cn(linkClass, "w-fit")}
              target="_blank"
              rel="noreferrer"
            >
              dmitryberson.ru
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="https://t.me/dmitryberson"
              className={cn(linkClass, "w-fit")}
              target="_blank"
              rel="noreferrer"
            >
              Telegram: @dmitryberson
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="https://t.me/dimmdao"
              className={cn(linkClass, "w-fit")}
              target="_blank"
              rel="noreferrer"
            >
              Запись: @dimmdao
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
