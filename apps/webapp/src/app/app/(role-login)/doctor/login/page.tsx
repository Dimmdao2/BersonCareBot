import { AppEntryRsc, type AppEntrySearchParams } from '@/app/app/AppEntryRsc';

export default async function DoctorLoginPage({
  searchParams,
}: {
  searchParams: Promise<AppEntrySearchParams>;
}) {
  return (
    <AppEntryRsc
      searchParams={searchParams}
      routeBoundMessengerSurface={null}
      roleLoginPortal="doctor"
    />
  );
}
