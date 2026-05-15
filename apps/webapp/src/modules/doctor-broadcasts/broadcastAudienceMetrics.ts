import type { ClientListItem, DoctorClientsPort } from "@/modules/doctor-clients/ports";
import type { TestAccountIdentifiers } from "@/modules/system-settings/testAccounts";
import type { BroadcastChannel } from "./broadcastChannels";
import type { BroadcastAudienceFilter } from "./ports";

/**
 * Список клиентов в сегменте рассылки (та же логика фильтров, что в `buildAppDeps` → doctorBroadcasts).
 */
export async function listClientsForBroadcastAudience(
  port: Pick<DoctorClientsPort, "listClients">,
  filter: BroadcastAudienceFilter,
): Promise<ClientListItem[]> {
  if (filter === "with_telegram") {
    return port.listClients({ hasTelegram: true });
  }
  if (filter === "with_max") {
    return port.listClients({ hasMax: true });
  }
  if (filter === "with_upcoming_appointment") {
    return port.listClients({ hasUpcomingAppointment: true });
  }
  if (filter === "active_clients") {
    return port.listClients({ onlyWithAppointmentRecords: true });
  }
  if (filter === "without_appointment") {
    const [all, withUpcoming] = await Promise.all([
      port.listClients({}),
      port.listClients({ hasUpcomingAppointment: true }),
    ]);
    const upcomingIds = new Set(withUpcoming.map((c) => c.userId));
    return all.filter((c) => !upcomingIds.has(c.userId));
  }
  if (filter === "inactive") {
    return port.listClients({});
  }
  if (filter === "sms_only") {
    return port.listClients({});
  }
  return port.listClients({});
}

/**
 * При включённом dev_mode исходящий relay разрешает только `telegram`/`max` с получателем из `test_account_identifiers`
 * (`relayRecipientAllowedInDevMode`). SMS в этом режиме не проходит guard — считаем доставку 0, если выбран только SMS.
 */
export function computeDevModeRelayBroadcastReach(
  clients: readonly ClientListItem[],
  channels: readonly BroadcastChannel[],
  testAccounts: TestAccountIdentifiers | null,
): { effective: number; nominal: number; cappedByDevMode: boolean } {
  const nominal = clients.length;
  const wantsBot = channels.includes("bot_message");
  const wantsSms = channels.includes("sms");
  const onlySms = wantsSms && !wantsBot;
  const noRelayChannels = !wantsSms && !wantsBot;

  if (noRelayChannels) {
    return { effective: nominal, nominal, cappedByDevMode: false };
  }

  if (onlySms) {
    return { effective: 0, nominal, cappedByDevMode: nominal > 0 };
  }

  if (testAccounts === null) {
    return { effective: 0, nominal, cappedByDevMode: nominal > 0 };
  }

  let effective = 0;
  for (const c of clients) {
    let hit = false;
    if (wantsBot) {
      const tg = c.bindings.telegramId?.trim();
      if (tg && testAccounts.telegramIds.includes(tg)) hit = true;
      if (!hit) {
        const mx = c.bindings.maxId?.trim();
        if (mx && testAccounts.maxIds.includes(mx)) hit = true;
      }
    }
    if (hit) effective += 1;
  }

  return { effective, nominal, cappedByDevMode: effective < nominal };
}
