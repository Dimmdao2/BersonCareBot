import { Loader } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Единственный контентный loader всех кабинетов (врач, администратор, пациент):
 * один серый вращающийся индикатор по центру доступной области.
 *
 * Зона-нейтральный: не импортирует `shared/ui/doctor/**` и `shared/ui/patient/**`, поэтому
 * допустим в обеих зонах (см. AGENTS.md §17). Зональные имена — только re-export отсюда.
 *
 * Не для action labels и прогресса («Загрузить файл», «Сохранение…», проценты аплоада) —
 * это не состояние ожидания контентной области.
 */
export function AppContentLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Загрузка"
      className={cn(
        'flex min-h-0 w-full flex-1 items-center justify-center text-muted-foreground',
        className,
      )}
    >
      <Loader className="size-4 shrink-0 animate-spin" aria-hidden />
    </div>
  );
}

/** Тот же loader для route-level ожидания (`loading.tsx`, Suspense страницы). */
export function AppRouteLoading({ className }: { className?: string }) {
  return <AppContentLoading className={cn('min-h-48 p-6', className)} />;
}
