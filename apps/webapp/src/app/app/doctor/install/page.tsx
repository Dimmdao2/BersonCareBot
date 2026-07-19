import { redirect } from "next/navigation";

export const metadata = {
  title: "Установить приложение — кабинет",
};

export default async function DoctorInstallPage() {
  redirect("/app/account?tab=install");
}
