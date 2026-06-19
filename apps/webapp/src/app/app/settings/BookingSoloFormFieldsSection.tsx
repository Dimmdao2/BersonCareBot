"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { Switch } from "@/shared/ui/doctor/primitives/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/doctor/primitives/select";
import { apiJson } from "@/shared/lib/apiJson";
import { slugFieldKey } from "@/app/app/settings/bookingSoloAdminApi";

const BASE = "/api/admin/booking-engine/form-fields";

const QUESTION_TYPES = [
  { value: "first_name", label: "Имя" },
  { value: "phone", label: "Телефон" },
  { value: "email", label: "Email" },
  { value: "comment", label: "Комментарий" },
  { value: "free_text", label: "Текст" },
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

export function BookingSoloFormFieldsSection() {
  const [fields, setFields] = useState<Field[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<string>("free_text");

  const sorted = [...fields].sort((a, b) => a.sortOrder - b.sortOrder);

  const load = useCallback(async () => {
    try {
      const json = await apiJson<{ ok: boolean; fields: Field[] }>(BASE);
      setFields(json.fields);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  async function saveFieldAsync(field: Field) {
    await apiJson(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: field.id,
        fieldKey: field.fieldKey,
        fieldType: field.fieldType,
        label: field.label,
        placeholder: field.placeholder ?? undefined,
        isRequired: field.isRequired,
        visibleToPatient: field.visibleToPatient,
        visibleToStaff: true,
        sortOrder: field.sortOrder,
        isActive: field.isActive,
      }),
    });
  }

  function saveField(field: Field) {
    setError(null);
    startTransition(async () => {
      try {
        await saveFieldAsync(field);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "save_failed");
      }
    });
  }

  function moveField(id: string, direction: -1 | 1) {
    const ordered = sorted;
    const idx = ordered.findIndex((f) => f.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const a = ordered[idx]!;
    const b = ordered[swapIdx]!;
    setError(null);
    startTransition(async () => {
      try {
        await saveFieldAsync({ ...a, sortOrder: b.sortOrder });
        await saveFieldAsync({ ...b, sortOrder: a.sortOrder });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "reorder_failed");
      }
    });
  }

  function createField() {
    const label = newLabel.trim();
    if (!label) return;
    const keys = fields.map((f) => f.fieldKey);
    const fieldKey = slugFieldKey(label, keys);
    const maxOrder = fields.reduce((m, f) => Math.max(m, f.sortOrder), 0);
    setError(null);
    startTransition(async () => {
      try {
        await apiJson(BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fieldKey,
            fieldType: newType,
            label,
            isRequired: false,
            visibleToPatient: true,
            visibleToStaff: true,
            sortOrder: maxOrder + 10,
            isActive: true,
          }),
        });
        setNewLabel("");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "create_failed");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Форма записи</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="space-y-3">
          {sorted.map((f, index) => (
            <div key={f.id} className="rounded-md border border-border/60 p-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <Label>Вопрос</Label>
                    <Input
                      value={f.label}
                      onChange={(e) =>
                        setFields((prev) =>
                          prev.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)),
                        )
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <Label>Тип ответа</Label>
                    <Select
                      value={f.fieldType}
                      onValueChange={(v) => {
                        if (!v) return;
                        setFields((prev) =>
                          prev.map((x) => (x.id === f.id ? { ...x, fieldType: v } : x)),
                        );
                      }}
                    >
                      <SelectTrigger
                        displayLabel={QUESTION_TYPES.find((t) => t.value === f.fieldType)?.label ?? f.fieldType}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUESTION_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value} label={t.label}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <Label>Подсказка в поле</Label>
                    <Input
                      value={f.placeholder ?? ""}
                      onChange={(e) =>
                        setFields((prev) =>
                          prev.map((x) =>
                            x.id === f.id ? { ...x, placeholder: e.target.value || null } : x,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    disabled={pending || index === 0}
                    onClick={() => moveField(f.id, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    disabled={pending || index === sorted.length - 1}
                    onClick={() => moveField(f.id, 1)}
                  >
                    ↓
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={f.visibleToPatient}
                    onCheckedChange={(v) =>
                      setFields((prev) =>
                        prev.map((x) => (x.id === f.id ? { ...x, visibleToPatient: v } : x)),
                      )
                    }
                  />
                  Показывать пациенту
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={f.isRequired}
                    onCheckedChange={(v) =>
                      setFields((prev) =>
                        prev.map((x) => (x.id === f.id ? { ...x, isRequired: v } : x)),
                      )
                    }
                  />
                  Обязательное
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={f.isActive}
                    onCheckedChange={(v) =>
                      setFields((prev) =>
                        prev.map((x) => (x.id === f.id ? { ...x, isActive: v } : x)),
                      )
                    }
                  />
                  Активно
                </label>
                <Button type="button" size="sm" disabled={pending} onClick={() => saveField(f)}>
                  Сохранить
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-dashed p-3 space-y-2">
          <Label>Новый вопрос</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[12rem] flex-1"
              placeholder="Текст вопроса"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <Select value={newType} onValueChange={(v) => v && setNewType(v)}>
              <SelectTrigger
                className="w-[10rem]"
                displayLabel={QUESTION_TYPES.find((t) => t.value === newType)?.label}
              />
              <SelectContent>
                {QUESTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} label={t.label}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" disabled={pending || !newLabel.trim()} onClick={createField}>
              Добавить
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border/60 p-3">
          <p className="mb-2 text-sm font-medium">Предпросмотр (пациент)</p>
          <ul className="space-y-1 text-sm">
            {sorted
              .filter((f) => f.isActive && f.visibleToPatient)
              .map((f) => (
                <li key={f.id}>
                  {f.label}
                  {f.isRequired ? <span className="text-destructive"> *</span> : null}
                </li>
              ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
