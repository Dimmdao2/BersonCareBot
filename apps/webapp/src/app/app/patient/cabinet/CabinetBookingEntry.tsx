import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { routePaths } from "@/app-layer/routes/paths";
import { patientCardClass, patientPrimaryActionClass } from "@/shared/ui/patientVisual";

export function CabinetBookingEntry() {
  return (
    <Card className={cn(patientCardClass, "ring-0")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Новая запись</CardTitle>
          <Badge variant="outline">Native booking</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Link href={routePaths.bookingNew} className={cn(patientPrimaryActionClass, "w-full")}>
          Записаться на приём
        </Link>
      </CardContent>
    </Card>
  );
}
