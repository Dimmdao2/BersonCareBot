'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { EllipsisVertical, Eye, EyeOff } from 'lucide-react';
import { applyContentLifecycle } from './lifecycleActions';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/doctor/primitives/dropdown-menu';
import { cn } from '@/lib/utils';

type Page = {
  id: string;
  isPublished: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
};

function LifecycleMenuItem({
  onSelect,
  label,
  destructive,
}: {
  onSelect: () => void;
  label: string;
  destructive?: boolean;
}) {
  return (
    <DropdownMenuItem onClick={onSelect}>
      <span className={cn(destructive && 'text-destructive')}>{label}</span>
    </DropdownMenuItem>
  );
}

/** Индикатор «опубликовано» + меню lifecycle (как раньше в таблице). */
export function ContentLifecycleDropdown({ page }: { page: Page }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const deleted = page.deletedAt != null;
  const archived = page.archivedAt != null;
  const published = page.isPublished;
  const id = page.id;

  const apply = (op: string) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('id', id);
      formData.set('op', op);
      try {
        const result = await applyContentLifecycle(null, formData);
        if (!result.ok) {
          toast.error(result.error ?? 'Не удалось применить действие');
          return;
        }
        router.refresh();
      } catch {
        toast.error('Не удалось применить действие');
      }
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      {!deleted ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-full border border-border/80"
          title={published ? 'Снять с публикации' : 'Опубликовать'}
          aria-label={published ? 'Снять с публикации' : 'Опубликовать'}
          disabled={pending}
          onClick={() => apply(published ? 'unpublish' : 'publish')}
        >
          {published ? (
            <Eye className="size-4 text-green-600 dark:text-green-500" aria-hidden />
          ) : (
            <EyeOff className="size-4 text-muted-foreground" aria-hidden />
          )}
        </Button>
      ) : (
        <span
          className="inline-flex size-8 items-center justify-center rounded-full border border-border/80"
          title="Удалено"
        >
          <EyeOff className="size-4 text-muted-foreground" aria-hidden />
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-transparent hover:bg-muted"
          aria-label="Действия"
        >
          <EllipsisVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Действия</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(`/app/doctor/content/edit/${id}`)}>
              Редактировать
            </DropdownMenuItem>
            {deleted ? (
              <LifecycleMenuItem onSelect={() => apply('restore')} label="Восстановить" />
            ) : (
              <>
                {archived ? (
                  <LifecycleMenuItem onSelect={() => apply('unarchive')} label="Из архива" />
                ) : (
                  <LifecycleMenuItem onSelect={() => apply('archive')} label="В архив" />
                )}
                <LifecycleMenuItem
                  onSelect={() => apply('soft_delete')}
                  label="Удалить"
                  destructive
                />
              </>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
