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
        <div className="mx-auto max-w-4xl rounded-[24px] border border-[#E6ECF8] bg-white p-5 sm:p-7 lg:p-8">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:gap-6 md:gap-8">
            <div className="min-w-0">
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
                className={cn(linkClass, "mt-4")}
                target="_blank"
                rel="noreferrer"
              >
                dmitryberson.ru
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <div className="mb-[-1.25rem] flex shrink-0 self-end items-end justify-end pl-2 sm:mb-[-1.75rem] sm:pl-3 lg:mb-[-2rem]">
              <Image
                src="/images/landing/specialist-dmitry-berson.png"
                alt="Дмитрий Берсон"
                width={360}
                height={547}
                sizes="(max-width: 640px) 144px, (max-width: 768px) 208px, (max-width: 1024px) 288px, 320px"
                className="h-auto w-36 max-w-none sm:w-52 md:w-72 lg:w-80"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
