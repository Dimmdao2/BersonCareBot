"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import {
  patientButtonPrimaryClass,
  patientButtonSecondaryClass,
  patientFormSurfaceClass,
  patientInnerPageStackClass,
  patientMutedTextClass,
  patientMutedTextStrongClass,
  patientSectionSurfaceClass,
  patientSectionTitleClass,
  patientSurfaceDangerClass,
  patientSurfaceSuccessClass,
} from "@/shared/ui/patientVisual";

type State = "form" | "submitting" | "success" | "error";

export function NutritionIntakeClient() {
  const router = useRouter();
  const [state, setState] = useState<State>("form");
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = description.trim().length >= 20;

  async function handleSubmit() {
    if (!canSubmit) return;
    setState("submitting");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/patient/online-intake/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      });

      if (res.ok) {
        setState("success");
      } else {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setErrorMessage(data.message ?? "Произошла ошибка. Попробуйте ещё раз.");
        setState("error");
      }
    } catch {
      setErrorMessage("Не удалось отправить запрос. Проверьте подключение.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className={patientInnerPageStackClass}>
        <div className={patientSurfaceSuccessClass}>
          <h2 className={patientSectionTitleClass}>Заявка отправлена</h2>
          <p className={patientMutedTextClass}>
            Нутрициолог свяжется с вами лично или через приложение в ближайшее время.
          </p>
        </div>
        <button
          type="button"
          className={cn(patientButtonSecondaryClass, "sm:w-auto")}
          onClick={() => router.push(routePaths.bookingNew)}
        >
          Вернуться в кабинет
        </button>
      </div>
    );
  }

  return (
    <div className={patientInnerPageStackClass}>
      <section className={patientSectionSurfaceClass}>
        <h1 className={patientSectionTitleClass}>Нутрициология</h1>

        <div className="flex flex-col gap-1.5">
          <label className={cn("text-xs font-medium", patientMutedTextStrongClass)} htmlFor="nutrition-description">
            Описание запроса <span className="text-destructive">*</span>
          </label>
          <Textarea
            id="nutrition-description"
            className={cn(patientFormSurfaceClass, "min-h-32 resize-y text-sm")}
            placeholder="Опишите запрос: цели, ограничения, что хотите обсудить с нутрициологом..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={state === "submitting"}
          />
          {description.trim().length > 0 && description.trim().length < 20 && (
            <p className="text-xs text-destructive">Минимум 20 символов</p>
          )}
        </div>

        {state === "error" && errorMessage ? (
          <div className={cn(patientSurfaceDangerClass, "text-sm")}>{errorMessage}</div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <button
            type="button"
            className={cn(patientButtonSecondaryClass, "sm:w-auto")}
            onClick={() => router.back()}
            disabled={state === "submitting"}
          >
            Назад
          </button>
          <button
            type="button"
            className={cn(patientButtonPrimaryClass, "sm:w-auto")}
            onClick={handleSubmit}
            disabled={!canSubmit || state === "submitting"}
          >
            {state === "submitting" ? "Отправка..." : "Отправить запрос"}
          </button>
        </div>
      </section>
    </div>
  );
}
