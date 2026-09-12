import { AppEntryRsc, type AppEntrySearchParams } from '@/app/app/AppEntryRsc';

/**
 * Specialist registration — its own door, not an in-place toggle off `/app/doctor/login` (owner,
 * 12.09: "давай, может, две разные страницы реально сделаем" — two pages, not one form juggling
 * both field sets). Shares AuthFlowV2's existing `specialist_signup` mode/fields with the login
 * door; only the entry view differs.
 */
export default async function DoctorRegisterPage({
  searchParams,
}: {
  searchParams: Promise<AppEntrySearchParams>;
}) {
  return (
    <AppEntryRsc
      searchParams={searchParams}
      routeBoundMessengerSurface={null}
      roleLoginPortal="doctor"
      roleLoginInitialView="register"
    />
  );
}
