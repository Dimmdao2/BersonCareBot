"use client";

/**
 * PatientsPageClient — Wave 1 placeholder.
 * Wave 2 builds the real UI (filters, segments, search, list, preview panel).
 */
import { use } from "react";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import { doctorSectionCardClass, doctorSectionTitleClass } from "@/shared/ui/doctor/doctorVisual";

type Props = {
  listPromise: Promise<ClientListItem[]>;
  initialFilters: {
    q: string;
    segment: string | null;
    channel: string | null;
    archivedOnly: boolean;
  };
};

export function PatientsPageClient({ listPromise, initialFilters: _filters }: Props) {
  const clients = use(listPromise);

  return (
    <div className={doctorSectionCardClass}>
      <p className={doctorSectionTitleClass}>Пациенты</p>
      <p className="text-sm text-muted-foreground">
        Всего: <strong>{clients.length}</strong>
      </p>
      {/* TODO (Wave 2): Render filter segments, search bar, patient list with previews */}
      <p className="text-xs text-muted-foreground mt-2">
        Wave 2 — список пациентов с фильтрами и превью
      </p>
    </div>
  );
}
