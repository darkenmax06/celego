"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ChartArea,
  CreditCard,
  Route,
  Phone,
  FileText,
  Bike,
  HandCoins,
  FileSpreadsheet,
  Settings,
  LogOut,
  ScanLine,
  Images,
  Search,
  TimerOff,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ModuleName } from "@/lib/constants";

const NAV_ITEMS: Array<{
  module: ModuleName;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { module: "dashboard", label: "Dashboard", href: "/dashboard", icon: ChartArea },
  { module: "tarjetas", label: "Tarjetas", href: "/tarjetas", icon: CreditCard },
  { module: "consolidado_debito", label: "Consolidado d\u00e9bito", href: "/consolidado-debito", icon: Upload },
  { module: "modificacion_masiva", label: "Actualizacion masiva", href: "/modificacion-masiva", icon: ScanLine },
  { module: "status_digitales", label: "Entrega digital (imagenes)", href: "/status-digitales", icon: Images },
  { module: "rastreo_masivo", label: "Rastreo masivo", href: "/rastreo-masivo", icon: Search },
  { module: "sla_vencidas", label: "Vencimientos", href: "/sla-vencidas", icon: TimerOff },
  { module: "rutas", label: "Rutas", href: "/rutas", icon: Route },
  { module: "operativo", label: "Operativo", href: "/operativo", icon: Phone },
  { module: "redaccion", label: "Redaccion", href: "/redaccion", icon: FileText },
  { module: "mensajeros", label: "Mensajeros", href: "/mensajeros", icon: Bike },
  { module: "facturacion", label: "Facturacion", href: "/facturacion", icon: HandCoins },
  { module: "reportes", label: "Reportes", href: "/reportes", icon: FileSpreadsheet },
  { module: "configuracion", label: "Configuracion", href: "/configuracion", icon: Settings },
];

export function Sidebar({
  allowedModules,
  userName,
  roleLabel,
}: {
  allowedModules: ModuleName[];
  userName: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => allowedModules.includes(item.module));

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-[230px] flex-col border-r border-slate-800/40 bg-gradient-to-b from-[#0f2544] to-[#0b1d36] px-4 py-6 text-slate-100">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-sm font-bold shadow-inner">C</div>
        <div>
          <p className="font-display text-lg leading-none">celego</p>
          <p className="text-xs text-slate-300">logistics</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                active
                  ? "bg-white/15 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
                  : "text-slate-200/90 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-sm font-medium">{userName}</p>
        <p className="mb-3 text-xs text-slate-300">{roleLabel}</p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-100 transition hover:bg-white/10"
        >
          <LogOut className="h-3.5 w-3.5" />
          Cerrar sesion
        </button>
      </div>
    </aside>
  );
}
