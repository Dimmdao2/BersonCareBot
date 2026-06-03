"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { landingContainer } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const heroSlides = [
  {
    label: "Разминки",
    title: "Снять напряжение в шее и спине",
    text: "Быстрые разминки для шеи, плеч и спины.",
    imageSrc: "/images/landing/hero-slide-warmup.png",
    imageAlt: "Экран разминки дня в приложении BersonCare",
  },
  {
    label: "Тренировки",
    title: "Упражнения под ваши задачи",
    text: "Шея, поясница, осанка и персональные программы.",
    imageSrc: "/images/landing/hero-slide-exercises.png",
    imageAlt: "Экран упражнений и программы этапа в приложении BersonCare",
  },
  {
    label: "Самочувствие",
    title: "Прогресс",
    text: "Дневник самочувствия и напоминания о разминках.",
    imageSrc: "/images/landing/hero-slide-statistics.png",
    imageAlt: "Экран статистики самочувствия и разминок в приложении BersonCare",
  },
] as const;

const HERO_ROTATE_MS = 15_000;
const HERO_SLIDE_MS = 650;

const trustPoints = [
  "Без App Store и Google Play",
  "Бесплатно, без подписок и рекламы",
  "Открывается с экрана телефона в один клик",
] as const;

const heroTitleClass =
  "max-w-3xl text-[1.625rem] font-semibold leading-[1.14] tracking-[-0.025em] text-[#13234A] sm:text-[2rem] lg:text-[2.375rem]";

const phoneImageClass =
  "relative h-auto w-[168px] rounded-[22px] border border-white/20 bg-white sm:w-[240px] sm:rounded-[26px] md:w-[320px] lg:w-[400px] lg:rounded-[28px]";

export function HeroSection() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % heroSlides.length);
    }, HERO_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const slide = heroSlides[activeSlide];

  return (
    <section className="relative overflow-x-hidden bg-white pt-6 pb-10 sm:pt-8 sm:pb-12 lg:pt-10 lg:pb-20">
      <div className={cn("relative", landingContainer)}>
        <h1 className={heroTitleClass}>
          Разминки и тренировки для дома и работы
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-[#536179] sm:text-[1.0625rem] sm:leading-7">
          Заботьтесь о теле без спортзала и сложных программ.
        </p>

        <div
          className="relative my-6 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#203F8F] via-[#2F55B7] to-[#6E8FF2] pl-4 pr-0 py-5 sm:my-8 sm:rounded-[28px] sm:pl-6 sm:pr-0 sm:py-6 lg:pl-8 lg:pr-0 lg:py-7"
          aria-roledescription="carousel"
          aria-label="Возможности приложения"
        >
          <div
            key={slide.imageSrc}
            className="flex w-full items-start gap-3 pb-9 motion-reduce:animate-none sm:gap-5 sm:pb-10 md:gap-8 lg:pb-11 landing-hero-slide-in"
            style={{ animationDuration: `${HERO_SLIDE_MS}ms` }}
          >
            <div className="min-w-0 flex-1 pt-0.5 sm:pt-1">
              <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-white/80 sm:text-xs">
                {slide.label}
              </span>
              <p className="mt-5 text-[1.0625rem] font-semibold leading-snug tracking-[-0.01em] text-white sm:mt-6 sm:text-[1.25rem] lg:text-[1.5rem]">
                {slide.title}
              </p>
              <p className="mt-2 text-[0.875rem] font-medium leading-6 text-white/78 sm:text-base sm:leading-7">
                {slide.text}
              </p>
            </div>

            <div className="shrink-0 -mt-5 -mb-[56px] overflow-hidden rounded-[22px] sm:-mt-6 sm:-mb-16 sm:rounded-[26px] lg:-mt-7 lg:-mb-[72px] lg:rounded-[28px]">
              <Image
                src={slide.imageSrc}
                alt={slide.imageAlt}
                width={512}
                height={1024}
                priority
                sizes="(max-width: 640px) 168px, (max-width: 1024px) 240px, 400px"
                className={phoneImageClass}
              />
            </div>
          </div>

          <div
            className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-1.5 sm:bottom-4 sm:gap-2"
            aria-label="Слайды описания"
          >
            {heroSlides.map((s, index) => {
              const selected = index === activeSlide;
              return (
                <button
                  key={s.imageSrc}
                  type="button"
                  aria-label={`Показать слайд ${index + 1}`}
                  aria-current={selected}
                  onClick={() => setActiveSlide(index)}
                  className={cn(
                    "h-1.5 rounded-full transition",
                    selected
                      ? "w-5 bg-white"
                      : "w-1.5 bg-white/35 hover:bg-white/55",
                  )}
                />
              );
            })}
          </div>
        </div>

        <ul className="flex flex-col gap-2.5">
          {trustPoints.map((text) => (
            <li
              key={text}
              className="flex items-start gap-2.5 text-[0.9375rem] font-medium leading-6 text-[#23385F] sm:text-base"
            >
              <span
                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#ECFDF3] text-[#17A56B]"
                aria-hidden
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              <span className="min-w-0">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
