"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { doctorSectionTitleClass } from "@/shared/ui/doctorVisual";
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
  const router = useRouter();
  const initialSelect = initialTemplateId.trim() ? initialTemplateId.trim() : PROMO_TEMPLATE_NONE;
  const [selected, setSelected] = useState(initialSelect);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const hasSavedPromoTemplate = initialTemplateId.trim().length > 0;

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
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/doctor/treatment-program-promo/refresh", { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        refreshedCount?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data?.error ?? "Не удалось обновить");
        return;
      }
      const count = data.refreshedCount ?? 0;
      toast.success(count > 0 ? `Обновлено: ${count} программ` : "Активных промо-программ нет");
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const displayLabel =
    selected === PROMO_TEMPLATE_NONE ? "Не задано" : (templates.find((t) => t.id === selected)?.title ?? selected);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex max-w-xl flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Select value={selected} onValueChange={(v) => setSelected(v ?? PROMO_TEMPLATE_NONE)}>
            <SelectTrigger displayLabel={displayLabel} className="w-full sm:flex-1">
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
          <Button
            type="button"
            variant="secondary"
            disabled={refreshing || !hasSavedPromoTemplate}
            onClick={() => void onRefresh()}
          >
            {refreshing ? "…" : "Обновить"}
          </Button>
        </div>
        <Button type="button" disabled={saving} onClick={() => void onSave()}>
          Сохранить
        </Button>
      </div>
      <div className="border-t border-border pt-6">
        <h2 className={`mb-2 ${doctorSectionTitleClass}`}>Статистика (promo)</h2>
        <ul className="m-0 list-none space-y-1 p-0 text-sm text-muted-foreground">
          <li>Активных экземпляров: {stats.activePromo}</li>
          <li>Завершённых экземпляров: {stats.completedPromo}</li>
        </ul>
      </div>
    </div>
  );
}
