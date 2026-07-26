// Removed 2026-07-26: BookingSoloFormFieldsSection, BookingPublicWidgetSection and
// BookingPublicAttributionSection rendered here were tenant-scoped (one organization's public
// booking form) shown unconditionally to every global admin regardless of clinic membership — see
// owner report. All three remain reachable by the doctor/clinic_admin themselves on their own
// Schedule → Setup → «Публичная форма» tab (ScheduleSetupTab.tsx SectionForm). No platform-level
// content remains on this route; route removal/consolidation is a separate owner decision, not
// made here.
export default function DoctorAdminBookingFormPublicPage() {
  return null;
}
