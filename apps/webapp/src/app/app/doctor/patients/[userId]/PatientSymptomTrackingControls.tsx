'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';

type Tracking = {
  id: string;
  symptomTitle: string;
  isActive: boolean;
  patientTrackingEnabled: boolean;
};

type LoadResponse = {
  ok?: unknown;
  trackings?: unknown;
  createDefault?: unknown;
};

function isTracking(value: unknown): value is Tracking {
  if (value === null || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.symptomTitle === 'string' &&
    typeof row.isActive === 'boolean' &&
    typeof row.patientTrackingEnabled === 'boolean'
  );
}

export function PatientSymptomTrackingControls({ patientUserId }: { patientUserId: string }) {
  const [trackings, setTrackings] = useState<Tracking[]>([]);
  const [title, setTitle] = useState('');
  const [patientTrackingEnabled, setPatientTrackingEnabled] = useState(true);
  const [pending, setPending] = useState(false);

  async function load() {
    const response = await fetch(`/api/doctor/clients/${patientUserId}/symptom-trackings`);
    const json = (await response.json().catch(() => null)) as LoadResponse | null;
    if (!response.ok || json?.ok !== true || !Array.isArray(json.trackings)) return;
    setTrackings(json.trackings.filter(isTracking));
    if (typeof json.createDefault === 'boolean') setPatientTrackingEnabled(json.createDefault);
  }

  useEffect(() => {
    void load();
    // patientUserId is the complete resource identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientUserId]);

  async function create() {
    const symptomTitle = title.trim();
    if (!symptomTitle) return;
    setPending(true);
    try {
      const response = await fetch(`/api/doctor/clients/${patientUserId}/symptom-trackings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symptomTitle, patientTrackingEnabled }),
      });
      if (!response.ok) {
        toast.error('Не удалось добавить симптом');
        return;
      }
      setTitle('');
      await load();
    } finally {
      setPending(false);
    }
  }

  async function setPatientVisibility(tracking: Tracking, enabled: boolean) {
    setPending(true);
    try {
      const response = await fetch(`/api/doctor/clients/${patientUserId}/symptom-trackings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trackingId: tracking.id, patientTrackingEnabled: enabled }),
      });
      if (!response.ok) {
        toast.error('Не удалось изменить настройки симптома');
        return;
      }
      setTrackings((current) =>
        current.map((row) =>
          row.id === tracking.id ? { ...row, patientTrackingEnabled: enabled } : row,
        ),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-3 rounded-lg border border-border p-3">
      <h2 className="text-sm font-medium">Симптомы дневника</h2>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 text-xs text-muted-foreground">
          Симптом
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs">
          <input
            type="checkbox"
            checked={patientTrackingEnabled}
            onChange={(event) => setPatientTrackingEnabled(event.target.checked)}
          />
          разрешить отслеживание пациентом
        </label>
        <Button type="button" size="sm" disabled={pending || !title.trim()} onClick={() => void create()}>
          Добавить
        </Button>
      </div>
      {trackings.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {trackings.map((tracking) => (
            <li key={tracking.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className={tracking.isActive ? '' : 'text-muted-foreground'}>{tracking.symptomTitle}</span>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={tracking.patientTrackingEnabled}
                  disabled={pending}
                  onChange={(event) => void setPatientVisibility(tracking, event.target.checked)}
                />
                разрешить отслеживание пациентом
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
