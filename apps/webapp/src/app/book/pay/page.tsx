import { redirect } from 'next/navigation';
import { publicBookPaths } from '@/shared/publicBook/paths';
import { PublicBookingPayClient } from './PublicBookingPayClient';

type PageProps = { searchParams: Promise<{ bookingId?: string }> };

export default async function PublicBookingPayPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const bookingId = params.bookingId?.trim();
  if (!bookingId) {
    redirect(publicBookPaths.new);
  }
  return <PublicBookingPayClient bookingId={bookingId} />;
}
