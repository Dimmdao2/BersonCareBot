"use client";

import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/shared/ui/doctor/primitives/switch";
import { Label } from "@/shared/ui/doctor/primitives/label";
import type { ClientSupportProfile, PatientProgramInteractionPolicy } from "@/modules/doctor-clients/supportPolicy";

type SupportSettingsResponse = {
  ok?: boolean;
  profile?: ClientSupportProfile & { updatedAt: string | null };
  effectivePolicy?: PatientProgramInteractionPolicy;
};

export function DoctorClientSupportPanel({ patientUserId }: { patientUserId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onSupport, setOnSupport] = useState(false);
  const [commentsAllowed, setCommentsAllowed] = useState(false);
  const [mediaAllowed, setMediaAllowed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(patientUserId)}/support-settings`,
      );
      const data = (await res.json()) as SupportSettingsResponse;
      if (!res.ok || !data.ok || !data.effectivePolicy) {
        setError("Не удалось загрузить настройки сопровождения");
        return;
      }
      setOnSupport(data.effectivePolicy.onSupport);
      setCommentsAllowed(data.effectivePolicy.commentsAllowed);
      setMediaAllowed(data.effectivePolicy.mediaAllowed);
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [patientUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/doctor/clients/${encodeURIComponent(patientUserId)}/support-settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json()) as SupportSettingsResponse;
      if (!res.ok || !data.ok || !data.effectivePolicy) {
        setError("Не удалось сохранить");
        return;
      }
      setOnSupport(data.effectivePolicy.onSupport);
      setCommentsAllowed(data.effectivePolicy.commentsAllowed);
      setMediaAllowed(data.effectivePolicy.mediaAllowed);
    } catch {
      setError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Загрузка сопровождения…</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="doctor-client-on-support"
            checked={onSupport}
            disabled={saving}
            onCheckedChange={(checked) => void patch({ onSupport: checked })}
          />
          <Label htmlFor="doctor-client-on-support" className="text-sm font-medium">
            На сопровождении
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="doctor-client-comments-enabled"
            checked={commentsAllowed}
            disabled={saving}
            onCheckedChange={(checked) => void patch({ commentsEnabled: checked })}
          />
          <Label htmlFor="doctor-client-comments-enabled" className="text-sm">
            Комментарии
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="doctor-client-media-enabled"
            checked={mediaAllowed}
            disabled={saving}
            onCheckedChange={(checked) => void patch({ mediaEnabled: checked })}
          />
          <Label htmlFor="doctor-client-media-enabled" className="text-sm">
            Медиа
          </Label>
        </div>
      </div>
    </div>
  );
}
