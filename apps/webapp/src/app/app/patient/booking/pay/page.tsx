import { PatientBookingPayClient } from "./PatientBookingPayClient";

type PageProps = { searchParams: Promise<{ bookingId?: string }> };

export default async function PatientBookingPayPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const bookingId = params.bookingId?.trim() ?? "";
  if (!bookingId) {
    return <p className="p-4 text-sm">Запись не найдена</p>;
  }
  return <PatientBookingPayClient bookingId={bookingId} />;
}
