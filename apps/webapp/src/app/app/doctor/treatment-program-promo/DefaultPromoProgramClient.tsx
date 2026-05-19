"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TemplateOption = { id: string; title: string };

const PROMO_TEMPLATE_NONE = "__promo_template_none__";

export function DefaultPromoProgramClient(props: {
  initialTemplateId: string;
  templates: TemplateOption[];
  stats: { activePromo: number; completedPromo: number };
}) {
  const { initialTemplateId, templates, stats } = props;
  const initialSelect = initialTemplateId.trim() ? initialTemplateId.trim() : PROMO_TEMPLATE_NONE;
  const [selected, setSelected] = useState(initialSelect);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    setSaving(true);
    try {
      const templateId = selected === PROMO_TEMPLATE_NONE ? "" : selected.trim();
      const res = await fetch("/api/doctor/treatment-program-promo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (!res.ok) {
        toast.error("Не удалось сохранить");
        return;
      }
      toast.success("Сохранено");
    } finally {
      setSaving(false);
    }
  };

  const displayLabel =
    selected === PROMO_TEMPLATE_NONE ? "Не задано" : (templates.find((t) => t.id === selected)?.title ?? selected);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex max-w-xl flex-col gap-4">
        <Select value={selected} onValueChange={(v) => setSelected(v ?? PROMO_TEMPLATE_NONE)}>
          <SelectTrigger displayLabel={displayLabel} className="w-full max-w-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PROMO_TEMPLATE_NONE} label="Не задано">
              Не задано
            </SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id} label={t.title}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" disabled={saving} onClick={() => void onSave()}>
          Сохранить
        </Button>
      </div>
      <div className="border-t border-border pt-6">
        <h2 className="mb-2 text-base font-semibold">Статистика (promo)</h2>
        <ul className="m-0 list-none space-y-1 p-0 text-sm text-muted-foreground">
          <li>Активных экземпляров: {stats.activePromo}</li>
          <li>Завершённых экземпляров: {stats.completedPromo}</li>
        </ul>
      </div>
    </div>
  );
}
