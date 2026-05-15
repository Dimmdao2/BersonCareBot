import { AppEntryRsc, type AppEntrySearchParams } from "../AppEntryRsc";

export default async function MaxAppEntryPage({
  searchParams,
}: {
  searchParams: Promise<AppEntrySearchParams>;
}) {
  return <AppEntryRsc searchParams={searchParams} routeBoundMessengerSurface="max" />;
}
