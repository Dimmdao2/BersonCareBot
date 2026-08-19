import { notFound, permanentRedirect } from 'next/navigation';
import { PublicBookingShell } from '@/app/book/PublicBookingShell';
import { resolvePublicOrganizationBySlugRsc } from '@/app/book/publicOrganizationBooking';
import { publicBookPaths } from '@/shared/publicBook/paths';
import { BookingEntryClient } from './BookingEntryClient';
import { loadBookingEntryScreenRsc } from './loadBookingEntry';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ clinicSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Канонический вход публичной записи клиники `/{clinic}/booking` (владелец 19.08:
 * «должно быть не domain/booking/clinic, а domain/clinic/booking»).
 *
 * Параметры — QUERY, а не сегменты: они опциональны и независимы, «только специалист, без филиала»
 * в позиционном пути не выражается без пустышки, а фрагмент `#` мессенджеры режут и до сервера он
 * не доходит вовсе (план §6.1).
 *
 * Организация резолвится ИЗ SLUG чокпоинтом и ставится явным принципалом до любого чтения каталога;
 * идентификаторы из ссылки организацию не выбирают никогда.
 */
export default async function ClinicBookingEntryPage({ params, searchParams }: Props) {
  const { clinicSlug } = await params;
  const query = await searchParams;
  const resolved = await resolvePublicOrganizationBySlugRsc(clinicSlug);
  if (!resolved) notFound();
  if (resolved.disposition === 'redirect') {
    permanentRedirect(publicBookPaths.forSlug(resolved.canonicalSlug));
  }

  const specialistId = single(query.specialist);
  const screen = await loadBookingEntryScreenRsc({
    organizationId: resolved.organizationId,
    branchId: single(query.branch),
    specialistId,
  });

  return (
    <PublicBookingShell title="Запись" step={1} totalSteps={4} backHref={null}>
      <BookingEntryClient
        screen={screen}
        orgSlug={resolved.canonicalSlug}
        specialistId={specialistId}
      />
    </PublicBookingShell>
  );
}
