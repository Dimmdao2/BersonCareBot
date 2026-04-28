/**
 * Информационный блок для разделов, включённых в блок главной `subscription_carousel`.
 * Контент раздела не блокируется — только редакционное пояснение (README Phase 7).
 */
export function PatientSectionSubscriptionCallout() {
  return (
    <div
      role="status"
      className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-foreground"
      data-testid="patient-section-subscription-callout"
    >
      <p className="m-0 leading-snug">
        <strong>По подписке.</strong> Доступ ко всем материалам этого раздела включён в подписку BersonCare.
        Совсем скоро!
      </p>
    </div>
  );
}
