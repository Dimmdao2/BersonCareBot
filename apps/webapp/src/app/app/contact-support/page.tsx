import { AppShell } from "@/shared/ui/AppShell";
import { LegalFooterLinks } from "@/shared/ui/LegalFooterLinks";
import { PatientSupportForm } from "@/app/app/patient/support/PatientSupportForm";
import { cn } from "@/lib/utils";
import { patientCardClass, patientMutedTextClass, patientSectionTitleClass } from "@/shared/ui/patientVisual";

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
      patientHideBottomNav
    >
      <section id="login-contact-support-section" className={cn(patientCardClass, "flex flex-col gap-4")}>
        <div>
          <h2 className={patientSectionTitleClass}>Написать в поддержку</h2>
          <p className={cn(patientMutedTextClass, "mt-1")}>
            Сообщение уйдёт администратору. Укажите email — на него ответят при необходимости.
          </p>
        </div>
        <PatientSupportForm defaultEmail="" supportSubmitPath="/api/public/support" />
      </section>
      <LegalFooterLinks className="mt-8" />
    </AppShell>
  );
}
