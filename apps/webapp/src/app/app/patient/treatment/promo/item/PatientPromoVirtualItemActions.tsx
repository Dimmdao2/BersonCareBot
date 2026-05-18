"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

export function PatientPromoVirtualItemActions(props: { templateStageItemId: string }) {
  const { templateStageItemId } = props;
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const onComplete = async () => {
    setPending(true);
    try {
      const res = await fetch("/api/patient/treatment-program-promo/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateStageItemId, markComplete: true }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        redirect?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data?.error ?? "Не удалось отметить");
        return;
      }
      if (data.redirect) router.replace(data.redirect);
      else router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Button type="button" className="mt-4 w-full sm:w-auto" disabled={pending} onClick={() => void onComplete()}>
      Выполнено
    </Button>
  );
}
