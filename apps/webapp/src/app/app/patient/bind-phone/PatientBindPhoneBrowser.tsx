"use client";

import { useRouter } from "next/navigation";
import { routePaths } from "@/app-layer/routes/paths";
import { PhoneMessengerAuthFlow } from "@/shared/ui/patient/auth/PhoneMessengerAuthFlow";
import { patientMutedTextClass } from "@/shared/ui/patient/patientVisual";

type Props = {
  supportContactHref: string;
  nextPath?: string | null;
  hint?: string;
};

export function PatientBindPhoneBrowser({ supportContactHref, nextPath, hint }: Props) {
  const router = useRouter();

  return (
    <div id="patient-bind-phone-browser" className="flex flex-col gap-3">
      {hint ? <p className={patientMutedTextClass}>{hint}</p> : null}
      <PhoneMessengerAuthFlow
        purpose="profile_bind"
        title="Привязать номер"
        supportContactHref={supportContactHref}
        hideBackOnPhoneStep
        onBack={() => router.push(routePaths.patient)}
        onProfileComplete={() => {
          const target =
            nextPath?.trim() && nextPath.startsWith("/app/patient") ? nextPath.trim() : routePaths.patient;
          router.push(target);
          router.refresh();
        }}
      />
    </div>
  );
}
