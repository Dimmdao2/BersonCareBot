import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { landingContainer } from "@/components/landing/landingTypography";

export function FinalCta() {
  return (
    <section className="bg-white py-14 sm:py-16 lg:py-24">
      <div className={landingContainer}>
        <div className="rounded-[28px] bg-[#406CA7] px-6 py-10 sm:px-10 sm:py-14 lg:px-14">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-white sm:text-[2.25rem]">
              Начните с кабинета специалиста
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
              Настройте расписание, добавьте первого клиента и соберите работу между приёмами в одном месте.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/app?intent=specialist"
                className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-7 text-base font-semibold text-[#315A8D] transition hover:bg-[#F4F7FA] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/35 sm:w-auto"
              >
                Создать кабинет
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/app/contact-support?from=clinic-demo"
                className="inline-flex min-h-14 w-full items-center justify-center rounded-full border border-white/35 px-7 text-base font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30 sm:w-auto"
              >
                Демо для клиники
              </Link>
            </div>
            <Link href="/app" className="mt-5 inline-flex text-sm font-medium text-white/80 underline underline-offset-4 transition hover:text-white">
              У меня есть приглашение / Войти
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
