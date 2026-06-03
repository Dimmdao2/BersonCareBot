import Image from "next/image";
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
    <footer id="contacts" className="scroll-mt-[80px] overflow-x-hidden border-t border-[#E6ECF8] bg-white py-10 sm:py-12">
      <div className={landingContainer}>
        <div className="grid min-w-0 gap-8 md:grid-cols-2 md:items-start md:gap-12">
          <div>
            <div className="flex items-center gap-2">
              <Image
                src="/apple-touch-icon.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-xl"
              />
              <p className="text-base font-semibold text-[#17264A]">BersonCare</p>
            </div>
            <p className={cn(landingBody, "mt-3 max-w-sm")}>Удобное приложение для заботы о здоровье.</p>
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
              href="/legal/privacy"
              className={cn(linkClass, "w-fit")}
            >
              Политика конфиденциальности
            </Link>
            <Link
              href="/legal/terms"
              className={cn(linkClass, "w-fit")}
            >
              Условия использования
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
