"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { LabeledSwitch } from "@/components/common/form/LabeledSwitch";
import { patchAdminSetting } from "./patchAdminSetting";

type Props = {
  allowPastUnlink: boolean;
};

export function BookingPackagePastUnlinkSetting({ allowPastUnlink: initial }: Props) {
  const [enabled, setEnabled] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const ok = await patchAdminSetting("booking_allow_doctor_unlink_past_package_sessions", enabled);
      if (!ok) setError("Не удалось сохранить");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Абонементы</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <LabeledSwitch
          label="Разрешить отвязывать прошедшие записи от абонемента"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <Button type="button" size="sm" disabled={pending} onClick={save}>
          Сохранить
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
