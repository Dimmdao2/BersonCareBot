import type { ClientListItem, DoctorClientsPort } from '@/modules/doctor-clients/ports';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';
import type { BroadcastChannel } from './broadcastChannels';
import type { BroadcastAudienceFilter, BroadcastRecipientsPreview } from './ports';
import { BROADCAST_RECIPIENT_PREVIEW_NAME_CAP } from './ports';
import { formatDoctorFio } from '@/shared/lib/fio';

export type DoctorBroadcastAudienceContext = {
  organizationId: string;
  visibilityActor: PatientVisibilityActor;
};

/**
 * Список клиентов в сегменте рассылки (та же логика фильтров, что в `buildAppDeps` → doctorBroadcasts).
 */
export async function listClientsForBroadcastAudience(
  port: Pick<DoctorClientsPort, 'listClients'>,
  filter: BroadcastAudienceFilter,
  context: DoctorBroadcastAudienceContext,
): Promise<ClientListItem[]> {
  const list = (filters: Parameters<DoctorClientsPort['listClients']>[0]) =>
    port.listClients({
      ...filters,
      organizationId: context.organizationId,
      visibilityActor: context.visibilityActor,
    });
  if (filter === 'with_telegram') {
    return list({ hasTelegram: true });
  }
  if (filter === 'with_max') {
    return list({ hasMax: true });
  }
  if (filter === 'with_upcoming_appointment') {
    return list({ hasUpcomingAppointment: true });
  }
  if (filter === 'active_clients') {
    return list({ onlyWithAppointmentRecords: true });
  }
  if (filter === 'without_appointment') {
    const [all, withUpcoming] = await Promise.all([
      list({}),
      list({ hasUpcomingAppointment: true }),
    ]);
    const upcomingIds = new Set(withUpcoming.map((c) => c.userId));
    return all.filter((c) => !upcomingIds.has(c.userId));
  }
  if (filter === 'inactive') {
    return list({});
  }
  if (filter === 'sms_only') {
    return list({});
  }
  return list({});
}

export function buildRecipientsPreviewFromClients(
  effective: readonly ClientListItem[],
  cap = BROADCAST_RECIPIENT_PREVIEW_NAME_CAP,
): BroadcastRecipientsPreview {
  const labelFor = (client: ClientListItem) =>
    formatDoctorFio(
      {
        lastName: client.lastName ?? null,
        firstName: client.firstName ?? null,
        patronymic: client.patronymic ?? null,
      },
      client.displayName,
    ).trim();
  const sorted = [...effective].sort((a, b) =>
    labelFor(a).localeCompare(labelFor(b), 'ru', { sensitivity: 'base' }),
  );
  const total = sorted.length;
  const names = sorted.slice(0, cap).map((c) => {
    const n = labelFor(c);
    return n || 'Без имени';
  });
  return { names, total, truncated: total > cap };
}
