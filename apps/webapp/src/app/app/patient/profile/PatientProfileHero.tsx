"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { routePaths } from "@/app-layer/routes/paths";
import { InlineEditField } from "@/shared/ui/InlineEditField";
import { EmailAccountPanel } from "@/shared/ui/EmailAccountPanel";
import {
  patientHeroBookingSectionClass,
  patientMutedTextClass,
} from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";
import { updateDisplayName } from "./actions";

type Props = {
  displayName: string;
  phone: string | null;
  supportContactHref: string;
  fallbackDisplayName: string;
  initialEmail: string | null;
  emailVerified: boolean;
};

export function PatientProfileHero({
  displayName,
  phone,
  supportContactHref,
  fallbackDisplayName,
  initialEmail,
  emailVerified,
}: Props) {
  const router = useRouter();

  const handleSaveName = async (next: string) => {
    const trimmedName = next.trim();
    if (!trimmedName || trimmedName === displayName) return;
    await updateDisplayName(trimmedName);
    router.refresh();
  };

  const goToBindPhone = () => {
    router.push(`${routePaths.bindPhone}?next=${encodeURIComponent(routePaths.profile)}`);
  };

  return (
    <section className={patientHeroBookingSectionClass}>
      <div className="flex flex-col gap-4">
        <InlineEditField
          label="ФИО"
          value={displayName}
          placeholder="Иванов Иван Иванович"
          type="text"
          emptyLabel={fallbackDisplayName}
          onSave={handleSaveName}
          labelClassName="font-normal"
          editLinkClassName="font-normal"
        />

        <div className="flex flex-col gap-1 border-t border-[var(--patient-border)] pt-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className={cn(patientMutedTextClass, "text-xs font-normal uppercase tracking-wide")}>Телефон</span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-primary h-auto min-h-0 px-0 py-0 text-sm font-normal"
              onClick={goToBindPhone}
            >
              {phone ? "Изменить" : "Привязать"}
            </Button>
          </div>
          {phone ? <p className="text-sm text-[var(--patient-text-primary)]">{phone}</p> : null}
        </div>

        <EmailAccountPanel
          initialEmail={initialEmail}
          emailVerified={emailVerified}
          supportContactHref={supportContactHref}
          layout="profileHero"
        />
      </div>
    </section>
  );
}
