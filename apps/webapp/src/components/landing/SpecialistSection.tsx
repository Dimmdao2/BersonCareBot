import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const linkClass =
  "inline-flex items-center gap-1.5 text-sm font-semibold text-[#2F55B7] hover:text-[#2448A5] sm:text-base";

export function SpecialistSection() {
  return (
    <section id="specialist" className="scroll-mt-24 py-12 lg:py-20">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <Card className="overflow-hidden border border-[#DDE3F0] bg-white p-5 shadow-sm sm:p-8 rounded-[32px]">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-10">
            <div className="relative mx-auto aspect-[4/5] w-full max-w-[320px] overflow-hidden rounded-[28px] bg-[#EEF4FF] sm:max-w-[380px] lg:mx-0 lg:max-w-none">
              <Image
                src="/images/landing/dmitry-berson.jpg"
                alt="Дмитрий Берсон"
                fill
                sizes="(max-width: 1024px) 90vw, 420px"
                className="object-cover"
                priority={false}
              />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17264A] sm:text-3xl lg:text-4xl">
                Дмитрий Берсон
              </h2>
              <p className="mt-2 text-base font-medium leading-7 text-[#2F55B7] sm:text-lg">
                Реабилитолог, кинезиолог, остеопат, фасциальный терапевт, специалист по регуляции метаболизма.
              </p>
              <p className="mt-4 text-base leading-7 text-[#667085]">
                С 2014 года занимается лечением заболеваний опорно-двигательного аппарата. Основные направления — боль в
                спине, шее и суставах, постуральные и цервикогенные головные боли, восстановление после травм и
                операций, работа с телом, движением и нервной системой.
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                <li>
                  <Link href="https://dmitryberson.ru" className={cn(linkClass)} target="_blank" rel="noreferrer">
                    Подробнее обо мне
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </Link>
                </li>
                <li>
                  <Link href="https://kinesio.space/me" className={cn(linkClass)} target="_blank" rel="noreferrer">
                    Профессиональная биография
                    <ExternalLink className="h-4 w-4" aria-hidden />
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
