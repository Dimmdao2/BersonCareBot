import { AppShell } from "@/shared/ui/AppShell";
import { LegalFooterLinks } from "@/shared/ui/LegalFooterLinks";
import { PatientSupportForm } from "@/app/app/patient/support/PatientSupportForm";

/**
 * Поддержка до входа: без меню и иконок шапки, только «К входу».
 * Персональные данные профиля в письме не прикрепляются (нет сессии).
 */
export default function LoginContactSupportPage() {
  return (
    <AppShell
      title="BersonCare"
      user={null}
      variant="patient"
      backHref="/app"
      backLabel="К входу"
      patientHideHome
      patientHideRightIcons
      patientBrandTitleBar
    >
      <section
        id="login-contact-support-section"
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div>
          <h2 className="text-base font-semibold">Написать в поддержку</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Сообщение уйдёт администратору. Укажите email — на него ответят при необходимости.
          </p>
        </div>
        <PatientSupportForm defaultEmail="" supportSubmitPath="/api/public/support" />
      </section>
      <LegalFooterLinks className="mt-8" />
    </AppShell>
  );
}
