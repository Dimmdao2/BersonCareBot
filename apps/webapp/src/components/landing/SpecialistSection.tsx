import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

const linkClass = "inline-flex items-center gap-1.5 text-xs font-semibold text-[#2F55B7] hover:text-[#2448A5] sm:text-sm";

export function SpecialistSection() {
  return (
    <section id="specialist" className="bg-white py-8 sm:py-10 lg:py-16">
      <div className="mx-auto max-w-full px-4 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="rounded-[20px] border border-[#E6ECF8] bg-[#F8FAFF] p-3.5 sm:rounded-[24px] sm:p-6 lg:p-8">
          <div className="grid gap-4 sm:gap-6 md:grid-cols-[280px_1fr] md:items-start lg:grid-cols-[320px_1fr] lg:gap-8">
            <div className="mx-auto flex w-full max-w-[200px] flex-col gap-2 sm:max-w-[240px] md:mx-0 md:max-w-none md:gap-3">
              <h2 className="text-center text-sm font-semibold tracking-[-0.01em] text-[#17264A] max-[439px]:text-[13px] sm:text-base md:text-left">
                Об авторе
              </h2>
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[18px] bg-white sm:rounded-[20px]">
                <Image
                  src="/images/landing/dmitry-berson.jpg"
                  alt="Дмитрий Берсон"
                  fill
                  sizes="(max-width: 768px) 78vw, 320px"
                  className="object-cover object-top"
                />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold tracking-[-0.01em] text-[#17264A] max-[439px]:text-base sm:text-3xl">
                Дмитрий Берсон
              </h3>
              <p className="mt-1.5 text-[11px] font-medium leading-5 text-[#2F55B7] sm:mt-2 sm:text-base sm:leading-7">
                Реабилитолог, кинезиолог, остеопат, фасциальный терапевт, специалист по регуляции метаболизма.
              </p>
              <p className="mt-2 text-[11px] leading-5 text-[#667085] sm:mt-3 sm:text-base sm:leading-7">
                С 2014 года занимается лечением заболеваний опорно-двигательного аппарата. Основные направления — боль в спине, шее и суставах, постуральные и цервикогенные головные боли, восстановление после травм и операций, работа с телом, движением и нервной системой.
              </p>

              <div className="mt-4 flex flex-col gap-2.5 sm:mt-6 sm:gap-3">
                <Link href="https://dmitryberson.ru" className={linkClass} target="_blank" rel="noreferrer">
                  Подробнее <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
