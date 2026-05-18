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
import { patchAdminSetting } from "@/app/app/settings/patchAdminSetting";

type TemplateOption = { id: string; title: string };

const PROMO_TEMPLATE_NONE = "__promo_template_none__";

export function AdminPromoProgramClient(props: {
  initialTemplateId: string;
  templates: TemplateOption[];
}) {
  const { initialTemplateId, templates } = props;
  const initialSelect = initialTemplateId.trim() ? initialTemplateId.trim() : PROMO_TEMPLATE_NONE;
  const [selected, setSelected] = useState(initialSelect);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    setSaving(true);
    try {
      const value = selected === PROMO_TEMPLATE_NONE ? "" : selected.trim();
      const ok = await patchAdminSetting("patient_default_promo_treatment_program_template_id", value);
      if (!ok) {
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
  );
}
