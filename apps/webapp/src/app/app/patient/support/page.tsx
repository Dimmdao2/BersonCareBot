import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { cn } from "@/lib/utils";
import { patientMutedTextClass, patientSectionSurfaceClass } from "@/shared/ui/patientVisual";
import { PatientSupportForm } from "./PatientSupportForm";

export default async function PatientSupportPage() {
  const session = await requirePatientAccess(routePaths.patientSupport);
  const deps = buildAppDeps();
  const verified = await deps.userByPhone.getVerifiedEmailForUser(session.user.userId);
  const defaultEmail = verified?.trim() ?? "";

  return (
    <AppShell title="Поддержка" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <section className={cn(patientSectionSurfaceClass, "!gap-4 !p-6")}>
        <div>
          <h2 className="text-base font-semibold">Связаться с поддержкой</h2>
          <p className={cn(patientMutedTextClass, "mt-1")}>
            Сообщение уйдёт администратору. К письму автоматически прикрепятся ваш профиль и привязки.
          </p>
        </div>
        <PatientSupportForm defaultEmail={defaultEmail} />
      </section>
    </AppShell>
  );
}
