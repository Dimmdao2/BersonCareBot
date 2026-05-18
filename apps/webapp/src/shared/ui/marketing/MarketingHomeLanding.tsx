import type { ReactNode } from "react";
import { LegalFooterLinks } from "@/shared/ui/LegalFooterLinks";

type MarketingHomeLandingProps = {
  installSlot: ReactNode;
};

/** Статическая маркетинговая обложка `/`: ценность продукта, установка, «обо мне», правовые ссылки. */
export function MarketingHomeLanding({ installSlot }: MarketingHomeLandingProps) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <header className="border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-4">
          <span className="text-xl font-bold tracking-tight text-[#284da0]">BersonCare</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-10">
        <div>
          <h1 className="font-[family-name:var(--font-roboto-heading)] text-3xl font-bold leading-tight text-slate-900">
            Разминки, видео и программа реабилитации в одном приложении
          </h1>
          <ul className="mt-6 list-inside list-disc space-y-2 text-base text-slate-700">
            <li>Ежедневные разминки и материалы</li>
            <li>Видео упражнений и понятные инструкции</li>
            <li>Советы и мотивация</li>
            <li>Запись на приём в офис</li>
            <li>Помощь при острой боли</li>
          </ul>
        </div>
        {installSlot}
        <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-6">
          <h2 className="text-lg font-semibold text-slate-900">Обо мне</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            Практикующий реабилитолог Дмитрий Берсон. Подробнее — на сайте клиники.
          </p>
          <p className="mt-3">
            <a
              href="https://dmitryberson.ru"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#284da0] underline underline-offset-2"
            >
              dmitryberson.ru
            </a>
          </p>
        </section>
      </main>
      <footer className="mt-auto border-t border-slate-100 py-6">
        <LegalFooterLinks />
      </footer>
    </div>
  );
}
