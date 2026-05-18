import { CheckCircle2 } from "lucide-react";

const bullets = [
  "меньше хаоса в рекомендациях",
  "больше регулярности в выполнении",
  "понятнее динамика состояния",
] as const;

export function WhySection() {
  return (
    <section id="about" className="scroll-mt-20 bg-[#F8FAFF] py-16 lg:py-24">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 lg:items-start">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17264A] sm:text-3xl lg:text-[2.5rem] lg:leading-[1.15]">
              Чтобы восстановление не терялось между приёмами
            </h2>
            <p className="mt-5 text-base leading-7 text-[#667085]">
              После консультации пациент часто остаётся один на один с упражнениями,
              рекомендациями и вопросами: что делать сегодня, сколько раз, как понять прогресс,
              когда записаться снова. BersonCare собирает это в понятный ежедневный маршрут.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:pt-2">
            {bullets.map((text) => (
              <div
                key={text}
                className="flex items-start gap-3 rounded-2xl border border-[#C9EFDA] bg-[#ECFDF3] px-5 py-4"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#17A56B]" aria-hidden />
                <p className="text-sm font-medium leading-6 text-[#17264A] sm:text-base">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
