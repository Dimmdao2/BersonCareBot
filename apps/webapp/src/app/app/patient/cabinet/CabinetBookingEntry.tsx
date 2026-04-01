import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { routePaths } from "@/app-layer/routes/paths";

export function CabinetBookingEntry() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Новая запись</CardTitle>
          <Badge variant="outline">Native booking</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Link
          href={routePaths.bookingNew}
          className={cn(buttonVariants({ className: "w-full" }))}
        >
          Записаться на приём
        </Link>
      </CardContent>
    </Card>
  );
}
