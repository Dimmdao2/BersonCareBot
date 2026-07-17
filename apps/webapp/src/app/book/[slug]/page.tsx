import { notFound } from "next/navigation";
import { PublicFormatStepClient } from "../new/PublicFormatStepClient";
import { PublicBookingShell } from "../PublicBookingShell";
import { loadPublicOrganizationCitiesRsc, resolvePublicOrganizationBySlugRsc } from "../publicOrganizationBooking";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * Canonical per-clinic public booking link `/book/{publicSlug}`
 * (owner canon: docs/_TODO/SAAS_FOUNDATION/OWNER_RULINGS_2026-07-17.md §1).
 *
 * The server resolves the slug to an organization through a single chokepoint
 * (`resolvePublicOrganizationBySlugRsc`) BEFORE any catalog read. An unknown, unpublished, or
 * inactive slug renders a uniform 404 — never a distinguishing error, never enumerates other
 * clinics. The generic `/book` entry (this file's sibling `../page.tsx`) is untouched and stays
 * fail-closed as before.
 */
export default async function PublicBookOrganizationPage({ params }: Props) {
  const { slug } = await params;
  const resolved = await resolvePublicOrganizationBySlugRsc(slug);
  if (!resolved) notFound();

  const citiesResult = await loadPublicOrganizationCitiesRsc(resolved.organizationId);
  const cities = citiesResult.ok ? citiesResult.cities : [];
  const catalogError = citiesResult.ok ? null : "Каталог недоступен.";

  return (
    <PublicBookingShell title="Запись" step={1} totalSteps={4} backHref={null}>
      <PublicFormatStepClient cities={cities} catalogError={catalogError} orgSlug={slug} />
    </PublicBookingShell>
  );
}
