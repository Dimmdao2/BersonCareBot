/**
 * Сообщения кабинета специалиста («/app/doctor/messages»).
 * Отправка индивидуальных сообщений клиентам и журнал — через карточку клиента или выбор клиента.
 */
import Link from "next/link";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";

export default async function DoctorMessagesPage() {
  const session = await requireDoctorAccess();
  return (
    <AppShell title="Сообщения" user={session.user} titleSmall>
      <section className="panel stack">
        <p>Чтобы отправить сообщение клиенту, откройте карточку клиента и используйте блок «Коммуникации» или кнопку «Написать».</p>
        <p>
          <Link href="/app/doctor/clients" className="button">
            Перейти к списку клиентов
          </Link>
        </p>
      </section>
    </AppShell>
  );
}
