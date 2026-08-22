import Link from "next/link";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { publicBookPaths } from "@/shared/publicBook/paths";
import { PublicBookingShell } from "../PublicBookingShell";
import { BookingDoneClient } from "@/app/app/patient/booking/new/done/BookingDoneClient";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default async function PublicBookDonePage({ searchParams }: Props) {
  const raw = await searchParams;

  const bookingId = first(raw.bookingId)?.trim();
  const slotStart = first(raw.slotStart)?.trim();
  const slotEnd = first(raw.slotEnd)?.trim();
  const serviceTitle = first(raw.serviceTitle)?.trim();
  const locationLabel = first(raw.locationLabel)?.trim() ?? "";

  // Прямой заход без параметров (не через мастер записи) — старая заглушка вместо редиректа:
  // это единственная публичная страница, на неё не грех попасть и без контекста записи.
  if (!bookingId || !slotStart || !slotEnd || !serviceTitle) {
    return (
      <PublicBookingShell title="Запись создана" step={4} totalSteps={4} backHref={null}>
        <p className="text-sm">Мы получили вашу заявку. При необходимости с вами свяжутся по указанному телефону.</p>
        <Link href={publicBookPaths.new} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
          Новая запись
        </Link>
      </PublicBookingShell>
    );
  }

  const appDisplayTimeZone = await getAppDisplayTimeZone();

  return (
    <PublicBookingShell title="Запись подтверждена" step={4} totalSteps={4} backHref={null}>
      <BookingDoneClient
        slotStart={slotStart}
        slotEnd={slotEnd}
        serviceTitle={serviceTitle}
        locationLabel={locationLabel}
        bookingId={bookingId}
        backToHubHref={publicBookPaths.new}
        appDisplayTimeZone={appDisplayTimeZone}
      />
    </PublicBookingShell>
  );
}
