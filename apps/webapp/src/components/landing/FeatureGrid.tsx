import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileHeart,
  MessageCircle,
  UserRound,
} from 'lucide-react';
import {
  landingBodySecondary,
  landingContainer,
  landingH2,
  landingStepTitle,
} from '@/components/landing/landingTypography';
import { cn } from '@/lib/utils';

const features: ReadonlyArray<{ title: string; description: string; icon: LucideIcon }> = [
  {
    title: 'Запись и расписание',
    description: 'Услуги, места приёма, рабочее время и календарь в одном месте.',
    icon: CalendarDays,
  },
  {
    title: 'Карточки клиентов',
    description: 'Контакты, визиты, заметки, программы и коммуникации собраны вместе.',
    icon: UserRound,
  },
  {
    title: 'История визитов',
    description: 'Фиксируйте приёмы и быстро возвращайтесь к нужному контексту.',
    icon: FileHeart,
  },
  {
    title: 'Программы реабилитации',
    description: 'Собирайте план из упражнений, тестов, рекомендаций и видео.',
    icon: ClipboardList,
  },
  {
    title: 'Связь с клиентом',
    description: 'Обсуждайте ход программы и важные вопросы в едином чате.',
    icon: MessageCircle,
  },
  {
    title: 'Контент для пациента',
    description: 'Публикуйте понятные материалы, справку и видео в кабинете клиента.',
    icon: BookOpen,
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-[80px] bg-white py-14 sm:py-16 lg:py-24">
      <div className={landingContainer}>
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#406CA7] sm:text-[0.8125rem]">
            Возможности
          </p>
          <h2 className={cn(landingH2, 'mt-2')}>Всё нужное для работы с клиентом</h2>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="rounded-[20px] border border-[#E1E7EE] bg-white p-6 transition hover:-translate-y-0.5 hover:border-[#B8C9DE]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EAF1F8] text-[#406CA7]">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className={cn(landingStepTitle, 'mt-5')}>{feature.title}</h3>
                <p className={cn(landingBodySecondary, 'mt-2')}>{feature.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
