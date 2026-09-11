import { redirect } from 'next/navigation';
import { publicBookPaths } from '@/shared/publicBook/paths';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { PublicBookingPayClient } from './PublicBookingPayClient';

type PageProps = { searchParams: Promise<{ bookingId?: string }> };

export default async function PublicBookingPayPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const bookingId = params.bookingId?.trim();
  if (!bookingId) {
    redirect(publicBookPaths.new);
  }
  return (
    <PublicBookingPayClient
      bookingId={bookingId}
      appDisplayTimeZone={await getAppDisplayTimeZone()}
    />
  );
}
