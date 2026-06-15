/**
 * Legacy URL /app/doctor/clients: redirects to the unified patients list.
 * The list page has been replaced by /app/doctor/patients.
 * This page is kept only to preserve deep-links and bookmarks.
 */
import { redirect } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";

type Props = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function DoctorClientsLegacyPage({ searchParams }: Props) {
  await requireDoctorAccess();
  const params = await searchParams;
  const sp = new URLSearchParams();
  // Forward known params where they map cleanly
  if (params.q) sp.set("q", params.q);
  if (params.segment) sp.set("segment", params.segment);
  if (params.scope === "archived") sp.set("archived", "true");
  const qs = sp.toString();
  redirect(`/app/doctor/patients${qs ? `?${qs}` : ""}`);
}
