import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  landingBodySecondary,
  landingContainer,
  landingH3,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const linkClass =
  "inline-flex items-center gap-1.5 text-base font-semibold text-[#2F55B7] transition hover:text-[#2448A5]";

export function SpecialistSection() {
  return (
    <section id="specialist" className="scroll-mt-[80px] overflow-x-hidden bg-white py-12 sm:py-14 lg:py-16">
      <div className={landingContainer}>
        <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[24px] border border-[#E6ECF8] bg-white p-5 sm:p-7 lg:p-8">
          <div className="absolute bottom-0 right-0">
            <Image
              src="/images/landing/specialist-dmitry-berson.png"
              alt="Дмитрий Берсон"
              width={360}
              height={547}
              sizes="(max-width: 640px) 128px, (max-width: 768px) 180px, (max-width: 1024px) 220px, 260px"
              className="h-auto w-32 max-w-none sm:w-44 md:w-56 lg:w-64"
            />
          </div>
          <div className="pr-36 sm:pr-48 md:pr-60 lg:pr-68">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#EEF4FF] px-3 py-0.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#2F55B7]">
              Об авторе
            </span>
            <h3 className={cn(landingH3, "mt-2")}>Дмитрий Берсон</h3>
            <p className="mt-1 text-[0.9375rem] font-medium leading-6 text-[#2F55B7]">
              Реабилитолог, кинезиолог, остеопат
            </p>
            <p className={cn(landingBodySecondary, "mt-2.5")}>
              С 2014 года занимается восстановлением при боли в спине, шее и суставах,
              после травм и операций.
            </p>
            <Link
              href="https://dmitryberson.ru"
              className={cn(linkClass, "mt-4 inline-flex")}
              target="_blank"
              rel="noreferrer"
            >
              dmitryberson.ru
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
