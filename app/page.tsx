import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { resolveSessionUser, SESSION_EXPIRED_PATH } from "@/lib/session-user";

export default async function Home() {
  const session = await getAuthSession();
  if (!session?.user) redirect("/login");
  const user = await resolveSessionUser(session);
  redirect(user ? "/dashboard" : SESSION_EXPIRED_PATH);
}
