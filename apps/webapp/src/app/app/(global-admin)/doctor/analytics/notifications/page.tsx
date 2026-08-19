import { redirect } from 'next/navigation';
import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';

export default async function PlatformAnalyticsNotificationsRedirect() {
  await requirePlatformOperationsPage();
  redirect('/app/doctor/analytics');
}
