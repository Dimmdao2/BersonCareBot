import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

const linkClass = "inline-flex items-center gap-1.5 text-sm font-semibold text-[#2F55B7] hover:text-[#2448A5]";

export function SpecialistSection() {
  return (
    <section id="specialist" className="bg-white py-14 lg:py-16">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="rounded-[24px] border border-[#E6ECF8] bg-[#F8FAFF] p-5 sm:p-6 lg:p-8">
          <div className="grid gap-6 md:grid-cols-[280px_1fr] md:items-start lg:grid-cols-[320px_1fr] lg:gap-8">
            <div className="relative mx-auto aspect-[4/5] w-full max-w-[280px] overflow-hidden rounded-[20px] bg-white md:mx-0 md:max-w-none">
              <Image
                src="/images/landing/dmitry-berson.jpg"
                alt="Дмитрий Берсон"
                fill
                sizes="(max-width: 768px) 78vw, 320px"
                className="object-cover object-top"
              />
            </div>

            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[#17264A]">Дмитрий Берсон</h2>
              <p className="mt-2 text-base font-medium leading-7 text-[#2F55B7]">
                Реабилитолог, кинезиолог, остеопат, фасциальный терапевт, специалист по регуляции метаболизма.
              </p>
              <p className="mt-4 text-sm leading-6 text-[#667085] sm:text-base sm:leading-7">
                С 2014 года занимается лечением заболеваний опорно-двигательного аппарата. Основные направления — боль в спине, шее и суставах, постуральные и цервикогенные головные боли, восстановление после травм и операций, работа с телом, движением и нервной системой.
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <Link href="https://dmitryberson.ru" className={linkClass} target="_blank" rel="noreferrer">
                  Подробнее обо мне — dmitryberson.ru <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
                <Link href="https://kinesio.space/me" className={linkClass} target="_blank" rel="noreferrer">
                  Профессиональная биография — kinesio.space/me <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
