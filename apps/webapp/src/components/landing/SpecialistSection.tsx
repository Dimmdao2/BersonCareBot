import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

const linkClass =
  "inline-flex items-center gap-1.5 text-sm font-semibold text-[#2F55B7] hover:text-[#2448A5]";

export function SpecialistSection() {
  return (
    <section id="specialist" className="scroll-mt-20 bg-[#F8FAFF] py-16 lg:py-24">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        {/* md: — двухколоночная: фото слева, текст справа */}
        <div className="grid gap-8 md:grid-cols-[2fr_3fr] md:items-start md:gap-12 lg:grid-cols-[420px_1fr] lg:gap-16">

          {/* Фото */}
          <div className="relative mx-auto aspect-[4/5] w-full max-w-[280px] overflow-hidden rounded-[24px] bg-[#DDE3F0] md:mx-0 md:max-w-none">
            <Image
              src="/images/landing/dmitry-berson.jpg"
              alt="Дмитрий Берсон"
              fill
              sizes="(max-width: 768px) 70vw, (max-width: 1024px) 40vw, 420px"
              className="object-cover object-top"
            />
          </div>

          {/* Текст */}
          <div className="md:pt-4">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17264A] sm:text-3xl lg:text-[2.5rem] lg:leading-[1.1]">
              Дмитрий Берсон
            </h2>
            <p className="mt-2 text-base font-medium leading-7 text-[#2F55B7]">
              Реабилитолог, кинезиолог, остеопат, фасциальный терапевт, специалист по регуляции метаболизма.
            </p>
            <p className="mt-4 text-base leading-7 text-[#667085]">
              С 2014 года занимается лечением заболеваний опорно-двигательного аппарата. Основные направления — боль в спине, шее и суставах, постуральные и цервикогенные головные боли, восстановление после травм и операций, работа с телом, движением и нервной системой.
            </p>
            <p className="mt-3 text-base leading-7 text-[#667085]">
              В работе использует реабилитационные, фасциальные и остеопатические техники.
            </p>
            <ul className="mt-6 flex flex-col gap-3">
              <li>
                <Link href="https://dmitryberson.ru" className={linkClass} target="_blank" rel="noreferrer">
                  Подробнее обо мне — dmitryberson.ru
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
              <li>
                <Link href="https://kinesio.space/me" className={linkClass} target="_blank" rel="noreferrer">
                  Профессиональная биография — kinesio.space/me
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            </ul>
          </div>

        </div>
      </div>
    </section>
  );
}
