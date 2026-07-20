import { CalendarDays, ClipboardList, MessageCircle, UserPlus } from "lucide-react";
import { landingBodySecondary, landingContainer, landingH2, landingStepTitle } from "@/components/landing/landingTypography";
import { cn } from "@/lib/utils";

const steps = [
  {
    title: "Настройте услуги и расписание",
    description: "Создайте услуги, места приёма и рабочее время.",
    icon: CalendarDays,
  },
  {
    title: "Добавляйте клиентов",
    description: "Запишите клиента на приём или создайте карточку после визита.",
    icon: UserPlus,
  },
  {
    title: "Ведите приёмы и назначения",
    description: "Сохраняйте историю визитов и собирайте программу реабилитации.",
    icon: ClipboardList,
  },
  {
    title: "Оставайтесь на связи",
    description: "Клиент видит назначения в своём кабинете, а вы — сообщения и динамику.",
    icon: MessageCircle,
  },
] as const;

export function WorkflowSection() {
  return (
    <section id="workflow" className="scroll-mt-[80px] bg-white py-14 sm:py-16 lg:py-24">
      <div className={landingContainer}>
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#406CA7] sm:text-[0.8125rem]">
            Как это работает
          </p>
          <h2 className={cn(landingH2, "mt-2")}>От записи до сопровождения между приёмами</h2>
        </div>
        <ol className="mt-8 grid gap-px overflow-hidden rounded-[24px] border border-[#DDE5EF] bg-[#DDE5EF] md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="bg-white p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EAF1F8] text-[#406CA7]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold text-[#94A3B8]">{index + 1}</span>
                </div>
                <h3 className={cn(landingStepTitle, "mt-5")}>{step.title}</h3>
                <p className={cn(landingBodySecondary, "mt-2")}>{step.description}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
