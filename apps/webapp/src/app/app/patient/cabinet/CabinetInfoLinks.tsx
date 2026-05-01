import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import { patientCardClass } from "@/shared/ui/patientVisual";

export function CabinetInfoLinks() {
  return (
    <Card className={cn(patientCardClass, "ring-0")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Полезная информация</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link
          href={routePaths.patientAddress}
          className="rounded-lg border border-[var(--patient-border)] px-3 py-2 text-sm font-medium text-[var(--patient-text-primary)] hover:bg-[var(--patient-color-primary-soft)]/40"
        >
          Адрес кабинета
        </Link>
        <Link
          href={routePaths.patientHelp}
          className="rounded-lg border border-[var(--patient-border)] px-3 py-2 text-sm font-medium text-[var(--patient-text-primary)] hover:bg-[var(--patient-color-primary-soft)]/40"
        >
          Как подготовиться
        </Link>
        <Link
          href={routePaths.patientHelp}
          className="rounded-lg border border-[var(--patient-border)] px-3 py-2 text-sm font-medium text-[var(--patient-text-primary)] hover:bg-[var(--patient-color-primary-soft)]/40"
        >
          Стоимость
        </Link>
      </CardContent>
    </Card>
  );
}
