import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import { patientCardClass, patientInfoLinkTileClass } from "@/shared/ui/patientVisual";

export function CabinetInfoLinks() {
  return (
    <Card className={cn(patientCardClass, "ring-0")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Полезная информация</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link
          href={routePaths.patientAddress}
          className={patientInfoLinkTileClass}
        >
          Адрес кабинета
        </Link>
        <Link href={routePaths.bookingNew} className={patientInfoLinkTileClass}>
          Записаться
        </Link>
        <Link href={routePaths.patientHelp} className={patientInfoLinkTileClass}>
          Справка и контакты
        </Link>
      </CardContent>
    </Card>
  );
}
