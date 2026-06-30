/**
 * Admin + admin mode: probable name overlap report (`name-match-hints` API). Non-admins redirect to clients hub.
 */
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { NameMatchHintsClient } from "./NameMatchHintsClient";

const CLIENTS = "/app/doctor/patients";
const CLIENTS_ALL = CLIENTS;

export default async function NameMatchHintsPage() {
  const session = await requireDoctorAccess();
  if (session.user.role !== "admin" || !session.adminMode) {
    redirect(CLIENTS);
  }

  return (
    <DoctorAppShell title="Кандидаты по ФИО (admin)" user={session.user}>
      <div className="mb-2 px-4">
        <Link href={CLIENTS_ALL} className="text-sm text-primary underline-offset-4 hover:underline">
          ← К списку клиентов (все подписчики)
        </Link>
      </div>
      <NameMatchHintsClient clientsListBase={CLIENTS} />
    </DoctorAppShell>
  );
}
