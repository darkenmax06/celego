"use client";

import { CardImportPanels } from "@/components/importacion/card-import-panels";
import { PageHeader } from "@/components/ui/page-header";

export default function ImportacionClient() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Importación" subtitle="Carga de archivos de tarjetas de crédito y débito" />
      <CardImportPanels />
    </div>
  );
}
