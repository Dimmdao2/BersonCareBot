import { redirect } from "next/navigation";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { PublicBookingPayClient } from "./PublicBookingPayClient";

type PageProps = { searchParams: Promise<{ bookingId?: string; phone?: string }> };

export default async function PublicBookingPayPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const bookingId = params.bookingId?.trim();
  const phone = params.phone?.trim();
  if (!bookingId || !phone) {
    redirect(publicBookPaths.new);
  }
  return <PublicBookingPayClient bookingId={bookingId} contactPhone={phone} />;
}
