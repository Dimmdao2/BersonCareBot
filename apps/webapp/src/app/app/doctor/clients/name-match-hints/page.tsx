/**
 * Admin + admin mode: probable name overlap report (`name-match-hints` API). Non-admins redirect to clients hub.
 */
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/shared/ui/AppShell";
import { NameMatchHintsClient } from "./NameMatchHintsClient";

const CLIENTS = "/app/doctor/clients";
const CLIENTS_ALL = `${CLIENTS}?scope=all`;

export default async function NameMatchHintsPage() {
  const session = await requireDoctorAccess();
  if (session.user.role !== "admin" || !session.adminMode) {
    redirect(CLIENTS);
  }

  return (
    <AppShell title="Кандидаты по ФИО (admin)" user={session.user} variant="doctor">
      <div className="mb-2 px-4">
        <Link href={CLIENTS_ALL} className="text-sm text-primary underline-offset-4 hover:underline">
          ← К списку клиентов (все подписчики)
        </Link>
      </div>
      <NameMatchHintsClient clientsListBase={CLIENTS} />
    </AppShell>
  );
}
