/**
 * Страница входа в приложение («/app»).
 * Если пользователь уже авторизован — перенаправляет: врач/админ в /app/doctor, пациент в /app/patient.
 * Если нет — шапка как у пациента (PersonCare) и блок авторизации (AuthBootstrap).
 *
 * Miniapp с явным surface: `/app/tg` (Telegram), `/app/max` (MAX) — см. {@link AppEntryRsc}.
 */

import { AppEntryRsc, type AppEntrySearchParams } from './AppEntryRsc';

export default async function AppEntryPage({
  searchParams,
}: {
  searchParams: Promise<AppEntrySearchParams>;
}) {
  return <AppEntryRsc searchParams={searchParams} routeBoundMessengerSurface={null} />;
}
