import { AppEntryRsc, type AppEntrySearchParams } from "../AppEntryRsc";

export default async function TelegramAppEntryPage({
  searchParams,
}: {
  searchParams: Promise<AppEntrySearchParams>;
}) {
  return <AppEntryRsc searchParams={searchParams} routeBoundMessengerSurface="telegram" />;
}
