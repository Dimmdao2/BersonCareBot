import type { ClientListItem, DoctorClientsPort } from "@/modules/doctor-clients/ports";
import type { TestAccountIdentifiers } from "@/modules/system-settings/testAccounts";
import type { BroadcastChannel } from "./broadcastChannels";
import type { BroadcastAudienceFilter, BroadcastRecipientsPreview } from "./ports";
import { BROADCAST_RECIPIENT_PREVIEW_NAME_CAP } from "./ports";

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
 * Клиенты, которым уйдёт доставка через relay-слой: без dev_mode — весь сегмент;
 * при dev_mode — как `relayRecipientAllowedInDevMode` (только тестовые Telegram/Max для `bot_message`); только SMS → пусто.
 */
export function resolveBroadcastEffectiveClients(
  clients: readonly ClientListItem[],
  channels: readonly BroadcastChannel[],
  devMode: boolean,
  testAccounts: TestAccountIdentifiers | null,
): { effective: ClientListItem[]; nominal: number; cappedByDevMode: boolean } {
  const nominal = clients.length;
  if (!devMode) {
    return { effective: [...clients], nominal, cappedByDevMode: false };
  }

  const wantsBot = channels.includes("bot_message");
  const wantsSms = channels.includes("sms");
  const onlySms = wantsSms && !wantsBot;
  const noRelayChannels = !wantsSms && !wantsBot;

  if (noRelayChannels) {
    return { effective: [...clients], nominal, cappedByDevMode: false };
  }

  if (onlySms) {
    return { effective: [], nominal, cappedByDevMode: nominal > 0 };
  }

  if (testAccounts === null) {
    return { effective: [], nominal, cappedByDevMode: nominal > 0 };
  }

  const effective: ClientListItem[] = [];
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
    if (hit) effective.push(c);
  }

  return { effective, nominal, cappedByDevMode: effective.length < nominal };
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
  const r = resolveBroadcastEffectiveClients(clients, channels, true, testAccounts);
  return {
    effective: r.effective.length,
    nominal: r.nominal,
    cappedByDevMode: r.cappedByDevMode,
  };
}

export function buildRecipientsPreviewFromClients(
  effective: readonly ClientListItem[],
  cap = BROADCAST_RECIPIENT_PREVIEW_NAME_CAP,
): BroadcastRecipientsPreview {
  const sorted = [...effective].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "ru", { sensitivity: "base" }),
  );
  const total = sorted.length;
  const names = sorted.slice(0, cap).map((c) => {
    const n = c.displayName.trim();
    return n || "Без имени";
  });
  return { names, total, truncated: total > cap };
}
