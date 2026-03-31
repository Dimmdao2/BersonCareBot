import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { routePaths } from "@/app-layer/routes/paths";

export function CabinetInfoLinks() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Полезная информация</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link href={routePaths.patientAddress} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
          Адрес кабинета
        </Link>
        <Link href={routePaths.patientHelp} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
          Как подготовиться
        </Link>
        <Link href={routePaths.patientHelp} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
          Стоимость
        </Link>
      </CardContent>
    </Card>
  );
}
