"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { routePaths } from "@/app-layer/routes/paths";
import { QuickAddPopup } from "../diary/QuickAddPopup";

type Context = { trackings: { id: string; title: string }[]; complexes: { id: string; title: string }[] };

type Props = {
  visible: boolean;
};

/**
 * Плюсик быстрого добавления: только вне `/app/patient/diary` (EXEC I.5).
 */
export function PatientQuickAddFAB({ visible }: Props) {
  const pathname = usePathname();
  const [ctx, setCtx] = useState<Context | null>(null);

  const onDiary = pathname?.startsWith(routePaths.diary) ?? false;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/patient/diary/quick-add-context", { credentials: "include" });
      if (!res.ok) {
        setCtx(null);
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        trackings?: { id: string; title: string }[];
        complexes?: { id: string; title: string }[];
      };
      if (!data.ok || !Array.isArray(data.trackings) || !Array.isArray(data.complexes)) {
        setCtx(null);
        return;
      }
      setCtx({ trackings: data.trackings, complexes: data.complexes });
    } catch {
      setCtx(null);
    }
  }, []);

  useEffect(() => {
    if (!visible || onDiary) return;
    const t = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(t);
  }, [visible, onDiary, load]);

  if (!visible || onDiary) return null;
  if (!ctx) return null;
  if (ctx.trackings.length === 0 && ctx.complexes.length === 0) return null;

  return <QuickAddPopup trackings={ctx.trackings} complexes={ctx.complexes} />;
}
