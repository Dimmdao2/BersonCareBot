"use client";

import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { PatientProgramInteractionPolicy } from "@/modules/doctor-clients/supportPolicy";

type SupportSettingsResponse = {
  ok?: boolean;
  effectivePolicy?: PatientProgramInteractionPolicy;
};

/** Компактный тумблер «На сопровождении» для Hero (id якоря support). */
export function DoctorClientSupportCareBar({ patientUserId }: { patientUserId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [onSupport, setOnSupport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(patientUserId)}/support-settings`,
      );
      const data = (await res.json()) as SupportSettingsResponse;
      if (res.ok && data.ok && data.effectivePolicy) {
        setOnSupport(data.effectivePolicy.onSupport);
      }
    } catch {
      // Hero badge optional
    } finally {
      setLoading(false);
    }
  }, [patientUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (checked: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(patientUserId)}/support-settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onSupport: checked }),
        },
      );
      const data = (await res.json()) as SupportSettingsResponse;
      if (res.ok && data.ok && data.effectivePolicy) {
        setOnSupport(data.effectivePolicy.onSupport);
      }
    } catch {
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="doctor-client-section-support"
      className="flex items-center gap-2 shrink-0"
    >
      <Switch
        id="doctor-client-on-support-care-bar"
        checked={onSupport}
        disabled={loading || saving}
        onCheckedChange={(checked) => void patch(checked)}
      />
      <Label htmlFor="doctor-client-on-support-care-bar" className="text-sm font-medium whitespace-nowrap">
        На сопровождении
      </Label>
    </div>
  );
}
