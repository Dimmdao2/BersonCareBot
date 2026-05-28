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
    <section id="specialist" className="overflow-x-hidden bg-[#F8FAFF] py-12 sm:py-14 lg:py-16">
      <div className={landingContainer}>
        <div className="mx-auto max-w-3xl rounded-[24px] border border-[#E6ECF8] bg-white p-5 shadow-[0_8px_28px_rgba(31,61,120,0.06)] sm:p-7">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl ring-1 ring-[#E6ECF8] sm:h-28 sm:w-28">
              <Image
                src="/images/landing/dmitry-berson.jpg"
                alt="Дмитрий Берсон"
                fill
                sizes="(max-width: 640px) 96px, 112px"
                className="object-cover object-[center_15%]"
              />
            </div>

            <div className="min-w-0 flex-1">
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
          </div>
        </div>
      </div>
    </section>
  );
}
