import Link from "next/link";
import { ArrowRight, CalendarDays, Check, ClipboardList, MessageCircle } from "lucide-react";
import {
  landingContainer,
  landingCtaPrimary,
  landingCtaSecondary,
  landingH1,
  landingLead,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const proofPoints = ["Записи и расписание", "Карточки клиентов", "Сопровождение между приёмами"] as const;

export function HeroSection() {
  return (
    <section className="overflow-hidden bg-white py-12 sm:py-16 lg:py-24">
      <div className={cn(landingContainer, "grid items-center gap-10 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16")}>
        <div>
          <p className="inline-flex rounded-full bg-[#EAF1F8] px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#406CA7] sm:text-sm">
            Платформа для частной практики
          </p>
          <h1 className={cn(landingH1, "mt-5 max-w-3xl")}>Кабинет специалиста для сопровождения пациентов</h1>
          <p className={cn(landingLead, "mt-5 max-w-2xl")}>
            Расписание, карточки клиентов, программы реабилитации и связь — в одном рабочем пространстве.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/app?intent=specialist" className={landingCtaPrimary}>
              Создать кабинет
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/app" className={landingCtaSecondary}>
              Войти
            </Link>
          </div>
          <Link href="/app" className="mt-4 inline-flex text-sm font-medium text-[#526276] underline decoration-[#AFC0D4] underline-offset-4 transition hover:text-[#406CA7]">
            У меня есть приглашение
          </Link>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
            {proofPoints.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm font-medium text-[#475569]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E8F4ED] text-[#26734D]">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-xl" aria-label="Пример рабочего кабинета">
          <div className="absolute -inset-8 rounded-full bg-[#DCE8F5]/70 blur-3xl" aria-hidden />
          <div className="relative overflow-hidden rounded-[28px] border border-[#CAD7E5] bg-[#FAF9F4] p-4 shadow-[0_28px_70px_rgba(41,72,108,0.16)] sm:p-5">
            <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
              <div>
                <p className="text-xs font-medium text-[#758399]">Сегодня</p>
                <p className="mt-0.5 font-semibold text-[#17264A]">Рабочий день</p>
              </div>
              <span className="rounded-full bg-[#EAF1F8] px-3 py-1.5 text-xs font-semibold text-[#406CA7]">3 приёма</span>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-2xl bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#17264A]">
                  <CalendarDays className="h-4 w-4 text-[#406CA7]" aria-hidden />
                  Ближайшие записи
                </div>
                <div className="mt-4 space-y-3">
                  {["Анна С.", "Игорь М.", "Мария К."].map((name, index) => (
                    <div key={name} className="flex items-center justify-between border-b border-[#E8EDF3] pb-3 last:border-0 last:pb-0">
                      <span className="text-sm font-medium text-[#334155]">{name}</span>
                      <span className="text-xs text-[#758399]">{10 + index * 2}:00</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl bg-[#406CA7] p-4 text-white">
                  <ClipboardList className="h-5 w-5" aria-hidden />
                  <p className="mt-3 text-2xl font-semibold">8</p>
                  <p className="mt-1 text-xs text-white/75">активных программ</p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <MessageCircle className="h-5 w-5 text-[#406CA7]" aria-hidden />
                  <p className="mt-3 text-2xl font-semibold text-[#17264A]">2</p>
                  <p className="mt-1 text-xs text-[#758399]">новых сообщения</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
