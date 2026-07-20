import Link from "next/link";
import { ArrowRight, Building2, Check, UserRound } from "lucide-react";
import {
  landingBodySecondary,
  landingContainer,
  landingCtaPrimary,
  landingH2,
  landingH3,
} from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const soloCapabilities = [
  "Расписание и записи",
  "Карточки клиентов и история визитов",
  "Программы, назначения и связь",
] as const;

export function PracticePathsSection() {
  return (
    <section id="product" className="scroll-mt-[80px] bg-[#FAF9F4] py-14 sm:py-16 lg:py-24">
      <div className={landingContainer}>
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#406CA7] sm:text-[0.8125rem]">
            Для кого
          </p>
          <h2 className={cn(landingH2, "mt-2")}>Для частной практики и клиник</h2>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <article className="rounded-[24px] border border-[#DDE5EF] bg-white p-6 sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF1F8] text-[#406CA7]">
              <UserRound className="h-6 w-6" aria-hidden />
            </div>
            <h3 className={cn(landingH3, "mt-5")}>Соло-специалисту</h3>
            <p className={cn(landingBodySecondary, "mt-2 max-w-xl")}>
              Соберите ежедневную работу с клиентами в одном кабинете.
            </p>
            <ul className="mt-5 space-y-3">
              {soloCapabilities.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[0.9375rem] leading-6 text-[#334155]">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-[#406CA7]" strokeWidth={2.5} aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/app?intent=specialist" className={cn(landingCtaPrimary, "mt-7")}>
              Создать кабинет
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </article>

          <article className="rounded-[24px] border border-[#DDE5EF] bg-white p-6 sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F2EEE5] text-[#725E43]">
              <Building2 className="h-6 w-6" aria-hidden />
            </div>
            <h3 className={cn(landingH3, "mt-5")}>Клинике</h3>
            <p className={cn(landingBodySecondary, "mt-2 max-w-xl")}>
              Если с клиентами работает команда, расскажите о вашем сценарии. Мы покажем
              текущие возможности и обсудим, что нужно для запуска.
            </p>
            <div className="mt-5 rounded-2xl bg-[#FAF9F4] p-4 text-sm leading-6 text-[#5F574C]">
              Клинический режим для команды пока подключается через демо, без обещания неготовых функций.
            </div>
            <Link
              href="/app/contact-support?from=clinic-demo"
              className="mt-7 inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-[#B8C9DE] bg-white px-7 text-base font-semibold text-[#315A8D] transition hover:border-[#406CA7] hover:bg-[#F5F8FC] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#406CA7]/20"
            >
              Запросить демо
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
