/**
 * Запись на приём: виджет Rubitime на всю доступную высоту (EXEC I.9).
 * Доступна без привязки телефона (гость с сессией или без — см. getOptionalPatientSession).
 */
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const WIDGET_URL = "https://dmitryberson.rubitime.ru/widget";
const FALLBACK_URL = "https://dmitryberson.rubitime.ru/";

export default async function PatientBookingPage() {
  const session = await getOptionalPatientSession();

  return (
    <AppShell
      title="Запись на приём"
      user={session?.user ?? null}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <iframe
          title="Rubitime — запись на приём"
          src={WIDGET_URL}
          className="h-[calc(100dvh-9rem)] w-full shrink-0 rounded-lg border border-border bg-background sm:h-[calc(100dvh-8.5rem)]"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <p className="text-muted-foreground text-center text-xs">
          <Link
            href={FALLBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto min-h-0 p-0")}
          >
            Открыть страницу записи в новой вкладке
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
