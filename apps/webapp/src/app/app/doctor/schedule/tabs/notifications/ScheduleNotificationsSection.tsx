'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import type {
  ManagedNotifPresentationEntry,
  ManagedNotifTemplateEntry,
} from '@/modules/notif-templates/managedNotifTemplate';
import { NotificationTemplatesPageClient } from './NotificationTemplatesPageClient';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'ready';
      templates: ManagedNotifTemplateEntry[];
      presentation: ManagedNotifPresentationEntry;
      brandingMutationAvailable: boolean;
    };

type Props = Readonly<{
  endpoint?: '/api/doctor/notification-templates' | '/api/admin/notification-templates';
}>;

export function ScheduleNotificationsSection({
  endpoint = '/api/doctor/notification-templates',
}: Props = {}) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await fetch(endpoint);
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        templates?: ManagedNotifTemplateEntry[];
        presentation?: ManagedNotifPresentationEntry;
        brandingMutationAvailable?: boolean;
      } | null;
      if (
        !res.ok ||
        !json?.ok ||
        !json.templates ||
        !json.presentation ||
        typeof json.brandingMutationAvailable !== 'boolean'
      ) {
        setState({ phase: 'error', message: 'Не удалось загрузить шаблоны уведомлений' });
        return;
      }
      setState({
        phase: 'ready',
        templates: json.templates,
        presentation: json.presentation,
        brandingMutationAvailable: json.brandingMutationAvailable,
      });
    });
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.phase === 'loading') {
    return <p className="text-sm text-muted-foreground">Загрузка шаблонов уведомлений…</p>;
  }
  if (state.phase === 'error') {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{state.message}</p>
        <Button type="button" size="sm" variant="outline" onClick={load}>
          Повторить
        </Button>
      </div>
    );
  }
  return (
    <NotificationTemplatesPageClient
      endpoint={endpoint}
      templates={state.templates}
      presentation={state.presentation}
      brandingMutationAvailable={state.brandingMutationAvailable}
    />
  );
}
