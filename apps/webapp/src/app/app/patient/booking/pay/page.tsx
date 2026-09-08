import { PatientBookingPayClient } from './PatientBookingPayClient';
import { patientBodyTextClass } from '@/shared/ui/patient/patientVisual';

type PageProps = { searchParams: Promise<{ bookingId?: string }> };

export default async function PatientBookingPayPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const bookingId = params.bookingId?.trim() ?? '';
  if (!bookingId) {
    return <p className={`p-4 ${patientBodyTextClass}`}>Запись не найдена</p>;
  }
  return <PatientBookingPayClient bookingId={bookingId} />;
}
