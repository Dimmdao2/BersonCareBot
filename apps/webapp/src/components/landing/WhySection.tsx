import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const bullets = [
  "меньше хаоса в рекомендациях",
  "больше регулярности в выполнении",
  "понятнее динамика состояния",
] as const;

const bulletCard = "flex items-start gap-3 rounded-2xl border border-[#DDE3F0] bg-[#ECFDF3] p-4";

export function WhySection() {
  return (
    <section id="about" className="scroll-mt-24 py-12 lg:py-20">
      <div className="mx-auto max-w-full px-5 sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8">
        <Card className="border border-[#DDE3F0] bg-white p-6 shadow-sm sm:p-8 rounded-[28px]">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17264A] lg:text-4xl">
                Чтобы восстановление не терялось между приёмами
              </h2>
              <p className="mt-4 text-base leading-7 text-[#667085]">
                После консультации пациент часто остаётся один на один с упражнениями, рекомендациями и вопросами: что
                делать сегодня, сколько раз, как понять прогресс, когда записаться снова. BersonCare собирает это в
                понятный ежедневный маршрут.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {bullets.map((text) => (
                <div key={text} className={cn(bulletCard)}>
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#17A56B]" aria-hidden />
                  <p className="text-sm font-medium leading-6 text-[#17264A] sm:text-base">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
