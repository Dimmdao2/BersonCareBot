import type { Metadata } from 'next';
import { AppEntryRsc, type AppEntrySearchParams } from '@/app/app/AppEntryRsc';
import { staffPwaLayoutMetadata } from '@/shared/lib/pwa/staffPwaLayoutMetadata';

// TPB-08: this route has no layout of its own (route group `(role-login)`), so it would
// otherwise inherit the root patient-surface metadata fallback in `app/layout.tsx`. Staff login
// screens declare their own identity through the same seam the doctor/admin/settings layouts use.
export const metadata: Metadata = staffPwaLayoutMetadata;

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
