"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BASE = "/api/admin/booking-engine/form-fields";

const FIELD_TYPES = [
  { value: "first_name", label: "Имя" },
  { value: "last_name", label: "Фамилия" },
  { value: "phone", label: "Телефон" },
  { value: "email", label: "Email" },
  { value: "comment", label: "Комментарий" },
  { value: "problem_description", label: "Описание проблемы" },
  { value: "text", label: "Текст" },
] as const;

type Field = {
  id: string;
  fieldKey: string;
  fieldType: string;
  label: string;
  placeholder: string | null;
  isRequired: boolean;
  visibleToPatient: boolean;
  visibleToStaff: boolean;
  sortOrder: number;
  isActive: boolean;
};

const emptyDraft = (): Omit<Field, "id"> & { id?: string } => ({
  fieldKey: "",
  fieldType: "text",
  label: "",
  placeholder: null,
  isRequired: false,
  visibleToPatient: true,
  visibleToStaff: true,
  sortOrder: 100,
  isActive: true,
});

export function BookingFormFieldsSection() {
  const [fields, setFields] = useState<Field[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(emptyDraft());

  const load = useCallback(async () => {
    const res = await fetch(BASE);
    const json = (await res.json()) as { ok?: boolean; fields?: Field[]; error?: string };
    if (!json.ok || !json.fields) {
      setError(json.error ?? "load_failed");
      return;
    }
    setFields(json.fields);
    setError(null);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  function saveField(field: Field | (Omit<Field, "id"> & { id?: string })) {
    startTransition(async () => {
      await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "id" in field ? field.id : undefined,
          fieldKey: field.fieldKey,
          fieldType: field.fieldType,
          label: field.label,
          placeholder: field.placeholder ?? undefined,
          isRequired: field.isRequired,
          visibleToPatient: field.visibleToPatient,
          visibleToStaff: field.visibleToStaff,
          sortOrder: field.sortOrder,
          isActive: field.isActive,
        }),
      });
      setDraft(emptyDraft());
      await load();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Поля записи</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {fields.map((f) => (
          <div key={f.id} className="grid gap-2 border-b border-border pb-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <Label>Ключ</Label>
              <Input
                value={f.fieldKey}
                onChange={(e) => setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, fieldKey: e.target.value } : x)))}
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>Подпись</Label>
              <Input
                value={f.label}
                onChange={(e) => setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))}
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>Тип</Label>
              <Select
                value={f.fieldType}
                onValueChange={(v) => {
                  if (!v) return;
                  setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, fieldType: v } : x)));
                }}
              >
                <SelectTrigger displayLabel={FIELD_TYPES.find((t) => t.value === f.fieldType)?.label ?? f.fieldType}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} label={t.label}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <Label>Placeholder</Label>
              <Input
                value={f.placeholder ?? ""}
                onChange={(e) =>
                  setFields((prev) =>
                    prev.map((x) => (x.id === f.id ? { ...x, placeholder: e.target.value || null } : x)),
                  )
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label>Порядок</Label>
              <Input
                type="number"
                value={f.sortOrder}
                onChange={(e) =>
                  setFields((prev) =>
                    prev.map((x) => (x.id === f.id ? { ...x, sortOrder: Number(e.target.value) || 0 } : x)),
                  )
                }
              />
            </label>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={f.isRequired}
                  onCheckedChange={(v) =>
                    setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, isRequired: v } : x)))
                  }
                />
                <span className="text-sm">Обязательное</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={f.visibleToPatient}
                  onCheckedChange={(v) =>
                    setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, visibleToPatient: v } : x)))
                  }
                />
                <span className="text-sm">Пациенту</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={f.isActive}
                  onCheckedChange={(v) =>
                    setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, isActive: v } : x)))
                  }
                />
                <span className="text-sm">Активно</span>
              </div>
              <Button type="button" size="sm" onClick={() => saveField(f)} disabled={pending}>
                Сохранить
              </Button>
            </div>
          </div>
        ))}

        <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
          <p className="text-sm font-medium sm:col-span-2">Новое поле</p>
          <label className="flex flex-col gap-1">
            <Label>Ключ</Label>
            <Input value={draft.fieldKey} onChange={(e) => setDraft({ ...draft, fieldKey: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <Label>Подпись</Label>
            <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <Label>Тип</Label>
            <Select
              value={draft.fieldType}
              onValueChange={(v) => {
                if (v) setDraft({ ...draft, fieldType: v });
              }}
            >
              <SelectTrigger displayLabel={FIELD_TYPES.find((t) => t.value === draft.fieldType)?.label}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} label={t.label}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button
            type="button"
            className="self-end"
            disabled={pending || !draft.fieldKey.trim() || !draft.label.trim()}
            onClick={() => saveField(draft)}
          >
            Создать
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
