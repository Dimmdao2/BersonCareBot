import { redirect } from "next/navigation";
import { routePaths } from "@/app-layer/routes/paths";

/**
 * Выбор города перенесён на шаг 1 (`/booking/new`). Маршрут сохранён для deep link (бот `booking_city` и т.п.).
 */
export default function BookingNewCityPage() {
  redirect(routePaths.bookingNew);
}
