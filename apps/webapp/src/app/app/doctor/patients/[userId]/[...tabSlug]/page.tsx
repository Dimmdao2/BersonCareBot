/**
 * Catch-all redirect for patient card tab sub-routes.
 *
 * URLs like /patients/<id>/karta or /patients/<id>/program would 404 because
 * the patient card uses client-side tab switching with ?tab= query params, not
 * URL segments. This page redirects those sub-routes to the correct form so
 * deep-links and browser refreshes work.
 *
 * The specific /patients/[userId]/programs/[instanceId] route takes precedence
 * over this catch-all for valid program instance links.
 */
import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { routePaths } from "@/app-layer/routes/paths";

const VALID_TABS = new Set([
  "overview",
  "karta",
  "program",
  "records",
  "files",
  "comms",
  "finances",
  "account",
]);

type PageProps = {
  params: Promise<{ userId: string; tabSlug: string[] }>;
};

export default async function PatientCardTabRedirectPage({ params }: PageProps) {
  const { userId, tabSlug } = await params;

  if (!z.string().uuid().safeParse(userId).success) {
    notFound();
  }

  const tab = tabSlug[0];
  if (!tab || !VALID_TABS.has(tab)) {
    notFound();
  }

  redirect(`${routePaths.doctorPatients}/${userId}?tab=${tab}`);
}
