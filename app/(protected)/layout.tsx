import { Sidebar } from "@/components/layout/sidebar";
import { ROLE_LABELS } from "@/lib/constants";
import { getModulesForRole } from "@/lib/acl";
import { requireSession } from "@/lib/server-auth";
import { ensureBaseCatalogs } from "@/lib/bootstrap";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  await ensureBaseCatalogs();

  const allowedModules = getModulesForRole(session.user.role);

  return (
    <div className="min-h-screen bg-[#f5f5f3]">
      <Sidebar
        allowedModules={allowedModules}
        userName={session.user.name ?? session.user.email ?? "Usuario"}
        roleLabel={ROLE_LABELS[session.user.role]}
      />
      <main className="min-h-screen pl-[230px]">
        <div className="mx-auto max-w-[1320px] px-8 py-7">{children}</div>
      </main>
    </div>
  );
}
