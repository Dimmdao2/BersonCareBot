"use client";

import type { ComponentProps } from "react";
import { usePatientPhonePromptChrome } from "@/shared/ui/patient/PatientPhonePromptChromeContext";
import { PatientHeader } from "@/shared/ui/PatientHeader";

type Props = ComponentProps<typeof PatientHeader>;

/** Скрывает {@link PatientHeader} в мини-приложении, пока активен экран запроса телефона (контекст из layout). */
export function PatientGatedHeader(props: Props) {
  const chrome = usePatientPhonePromptChrome();
  if (chrome?.suppressPatientHeader) {
    return null;
  }
  return <PatientHeader {...props} />;
}
