"use client";

import { DoctorOnlineIntakeClient } from "../../online-intake/DoctorOnlineIntakeClient";
import type { CommunicationsTabProps } from "../communicationsTabRegistry";

/** Таб «Заявки» — deep-link ?id= → открывает карточку заявки. Block 4 доработает URL-sync. */
export function IntakeTab({ deepLinkParams }: CommunicationsTabProps) {
  return <DoctorOnlineIntakeClient initialOpenRequestId={deepLinkParams.id ?? null} />;
}
