import { cn } from "@/lib/utils";

/**
 * Информационный блок для разделов, включённых в блок главной `subscription_carousel`.
 * Контент раздела не блокируется — только редакционное пояснение (README Phase 7).
 */
export function PatientSectionSubscriptionCallout() {
  return (
    <div
      role="status"
      className={cn(
        "rounded-[var(--patient-card-radius-mobile)] border border-[var(--patient-border)] bg-[var(--patient-color-primary-soft)]/35 px-4 py-3 text-sm text-[var(--patient-text-primary)]",
      )}
      data-testid="patient-section-subscription-callout"
    >
      <p className="m-0 leading-snug">
        <strong>По подписке.</strong> Доступ ко всем материалам этого раздела включён в подписку BersonCare.
        Совсем скоро!
      </p>
    </div>
  );
}
