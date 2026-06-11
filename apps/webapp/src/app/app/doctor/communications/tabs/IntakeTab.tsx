"use client";

import { DoctorOnlineIntakeClient } from "../../online-intake/DoctorOnlineIntakeClient";
import type { CommunicationsTabProps } from "../communicationsTabRegistry";

/** Таб «Заявки» — deep-link ?id= ↔ URL-sync шелла. */
export function IntakeTab({ deepLinkParams, onDeepLinkChange }: CommunicationsTabProps) {
  return (
    <DoctorOnlineIntakeClient
      initialOpenRequestId={deepLinkParams.id ?? null}
      onDetailChange={(id) => onDeepLinkChange("id", id)}
    />
  );
}
