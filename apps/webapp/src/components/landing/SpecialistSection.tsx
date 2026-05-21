import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { landingBodySecondary, landingContainer } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const linkClass =
  "inline-flex items-center gap-1.5 text-base font-semibold text-[#2F55B7] hover:text-[#2448A5]";

export function SpecialistSection() {
  return (
    <section id="specialist" className="overflow-x-hidden border-t border-[#E6ECF8] bg-white py-6 sm:py-7">
      <div className={landingContainer}>
        <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-[#E6ECF8] sm:h-24 sm:w-24">
            <Image
              src="/images/landing/dmitry-berson.jpg"
              alt="Дмитрий Берсон"
              fill
              sizes="(max-width: 640px) 80px, 96px"
              className="object-cover object-[center_15%]"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#98A2B3]">Об авторе</p>
            <h3 className="mt-0.5 text-[1.375rem] font-semibold leading-tight text-[#17264A]">Дмитрий Берсон</h3>
            <p className="mt-1 text-[0.9375rem] font-medium leading-5 text-[#2F55B7]">
              Реабилитолог, кинезиолог, остеопат.
            </p>
            <p className={cn(landingBodySecondary, "mt-2")}>
              С 2014 года занимается восстановлением при боли в спине, шее и суставах, после травм и операций.
            </p>
            <Link href="https://dmitryberson.ru" className={cn(linkClass, "mt-2.5")} target="_blank" rel="noreferrer">
              Подробнее <ExternalLink className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
