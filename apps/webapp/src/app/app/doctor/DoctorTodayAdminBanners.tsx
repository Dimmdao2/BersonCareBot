import { Suspense } from 'react';
import { loadAdminRegistrationFailureAttention } from '@/app-layer/product-analytics/loadAdminRegistrationFailureAttention';
import { loadAdminDoctorTodayHealthBanner } from '@/modules/operator-health/adminDoctorTodayHealthBanner';
import { doctorInlineLinkClass } from '@/shared/ui/doctor/doctorVisual';
import Link from 'next/link';

/**
 * Admin-only banners for «Сегодня». Loaded in a separate Suspense boundary so
 * first-paint critical dashboard data is not blocked by health/registration reads.
 */
export async function DoctorTodayAdminBanners() {
  const [adminHealthBanner, adminRegistrationFailureBanner] = await Promise.all([
    loadAdminDoctorTodayHealthBanner(),
    loadAdminRegistrationFailureAttention(),
  ]);

  return (
    <>
      {adminHealthBanner?.show ? (
        <div className="px-0">
          <Link
            id="doctor-today-health-attention"
            href={adminHealthBanner.href}
            className={
              adminHealthBanner.tone === 'stop'
                ? 'inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive no-underline hover:bg-destructive/15'
                : 'inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-900 no-underline hover:bg-amber-500/15 dark:text-amber-100'
            }
          >
            {adminHealthBanner.title}
          </Link>
        </div>
      ) : null}
      {adminRegistrationFailureBanner?.show ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <Link
            href={adminRegistrationFailureBanner.href}
            className={`${doctorInlineLinkClass} font-medium`}
          >
            {adminRegistrationFailureBanner.title}
          </Link>
        </div>
      ) : null}
    </>
  );
}

export function DoctorTodayAdminBannersSuspense() {
  return (
    <Suspense fallback={null}>
      <DoctorTodayAdminBanners />
    </Suspense>
  );
}
