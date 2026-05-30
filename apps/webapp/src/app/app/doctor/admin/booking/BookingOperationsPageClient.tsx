"use client";

import { useState } from "react";
import { BookingPatientSearchPicker } from "@/app/app/doctor/admin/booking/BookingPatientSearchPicker";
import { BookingPatientPackagesSection } from "@/app/app/settings/BookingPatientPackagesSection";
import { BookingPatientProductsSection } from "@/app/app/settings/BookingPatientProductsSection";
import { BookingManualLifecycleSection } from "@/app/app/settings/BookingManualLifecycleSection";
import { BookingMergeCandidatesSection } from "@/app/app/settings/BookingMergeCandidatesSection";
import { BOOKING_CARD_GRID_WIDE_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
import type { BookingPatientPick } from "@/app/app/doctor/admin/booking/BookingPatientSearchPicker";

export function BookingOperationsPageClient() {
  const [patient, setPatient] = useState<BookingPatientPick | null>(null);
  const platformUserId = patient?.id ?? "";

  return (
    <div className="space-y-4">
      <BookingPatientSearchPicker value={patient} onChange={setPatient} />

      <div className={BOOKING_CARD_GRID_WIDE_CLASS}>
        <BookingPatientPackagesSection
          platformUserId={platformUserId}
          apiBase="/api/doctor/booking-engine/patient-packages"
          packagesApi="/api/doctor/booking-engine/packages"
          servicesApi="/api/doctor/booking-engine/services"
        />
        <BookingPatientProductsSection
          platformUserId={platformUserId}
          apiBase="/api/doctor/booking-engine/patient-products"
          servicesApi="/api/doctor/booking-engine/services"
        />
      </div>

      <BookingManualLifecycleSection
        key={patient?.id ?? "no-patient"}
        apiBase="/api/doctor/booking-engine"
        useDateTimePickers
        platformUserId={patient?.id}
      />
      <BookingMergeCandidatesSection />
    </div>
  );
}
