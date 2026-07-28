import { requireAdminDoctorPage } from '@/app/app/settings/requireAdminDoctorPage';
import { PlatformLocationPaletteSection } from './PlatformLocationPaletteSection';

/**
 * Platform-scope booking defaults. Deliberately NOT a clinic booking screen.
 *
 * Owner, 2026-07-27, on the previous version of this page: «ЧЬИ ДАННЫЕ ЧИТАЕТ ГЛОБАЛ АДМИН?» — it showed a
 * clinic's counters (locations/services/schedule) because the loader substituted a historical
 * `booking_default_organization_id` for a principal that structurally has no organisation. The first fix
 * passed the absence through and rendered «Клиника не выбрана»; the owner rejected that too — an empty clinic
 * widget on the platform console is noise, not an answer. A platform admin has no clinic, so clinic overview
 * and clinic setup help do not belong here AT ALL.
 *
 * What legitimately stays: the location colour palette, which is a platform-wide default every clinic inherits.
 * Per-clinic booking configuration belongs to the clinic surface (and, later, to the tenant detail page of the
 * platform console, opened for one named clinic).
 */
export default async function PlatformBookingDefaultsPage() {
  await requireAdminDoctorPage();

  return (
    <div className="space-y-4">
      <PlatformLocationPaletteSection />
    </div>
  );
}
