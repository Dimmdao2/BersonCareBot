import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

const linkClass =
  "inline-flex items-center gap-1.5 text-sm font-semibold text-[#2F55B7] hover:text-[#2448A5]";

export function SpecialistSection() {
  return (
    <section id="specialist" className="scroll-mt-20 bg-white py-16 lg:py-24">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[auto_1fr] lg:items-start lg:gap-16">

          {/* Photo */}
          <div className="relative mx-auto aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-[24px] bg-[#EEF4FF] shadow-[0_8px_32px_rgba(31,61,120,0.10)] sm:max-w-[320px] lg:mx-0 lg:w-[300px] lg:shrink-0 xl:w-[340px]">
            <Image
              src="/images/landing/dmitry-berson.jpg"
              alt="Дмитрий Берсон"
              fill
              sizes="(max-width: 1024px) 90vw, 340px"
              className="object-cover"
            />
          </div>

          {/* Text */}
          <div className="flex flex-col justify-center lg:py-4">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17264A] sm:text-3xl lg:text-[2.5rem]">
              Дмитрий Берсон
            </h2>
            <p className="mt-2 text-base font-medium leading-7 text-[#2F55B7]">
              Реабилитолог, кинезиолог, остеопат, фасциальный терапевт,
              специалист по регуляции метаболизма.
            </p>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#667085]">
              С 2014 года занимается лечением заболеваний опорно-двигательного аппарата.
              Основные направления — боль в спине, шее и суставах, постуральные и цервикогенные
              головные боли, восстановление после травм и операций, работа с телом, движением
              и нервной системой.
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              <li>
                <Link href="https://dmitryberson.ru" className={linkClass} target="_blank" rel="noreferrer">
                  Подробнее обо мне — dmitryberson.ru
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </Link>
              </li>
              <li>
                <Link href="https://kinesio.space/me" className={linkClass} target="_blank" rel="noreferrer">
                  Профессиональная биография — kinesio.space/me
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </Link>
              </li>
            </ul>
          </div>

        </div>
      </div>
    </section>
  );
}
