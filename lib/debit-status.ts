import { CardStatus, CardProductType } from "@prisma/client";

export const DEBIT_TERMINAL_STATUSES: CardStatus[] = [
  CardStatus.TD_ENTREGADO,
  CardStatus.TD_DEVUELTO_NO_LOCALIZADO,
  CardStatus.TD_NO_LE_INTERESA,
  CardStatus.TD_RETIRADA_EN_OFICINA,
  CardStatus.TD_SOLICITADA_POR_ERROR,
  CardStatus.TD_ZONA_FUERA_COBERTURA,
];

export const DEBIT_RETURN_STATUSES: CardStatus[] = [
  CardStatus.TD_DEVUELTO_NO_LOCALIZADO,
  CardStatus.TD_NO_LE_INTERESA,
  CardStatus.TD_RETIRADA_EN_OFICINA,
  CardStatus.TD_SOLICITADA_POR_ERROR,
  CardStatus.TD_ZONA_FUERA_COBERTURA,
];

/**
 * Normalizes raw string from Excel consolidado to CardStatus enum.
 */
export function normalizeDebitConsolidadoStatus(raw: string | null | undefined): CardStatus {
  if (!raw) return CardStatus.DESPACHADA;
  const upper = raw.trim().toUpperCase().replace(/\s+/g, " ");

  if (upper === "TD- ENTREGADO" || upper === "TD-ENTREGADO" || upper === "ENTREGADO" || upper === "TD_ENTREGADO") {
    return CardStatus.TD_ENTREGADO;
  }
  if (
    upper === "TD- DEVUELTO NO LOCALIZADO" ||
    upper === "TD-DEVUELTO NO LOCALIZADO" ||
    upper === "DEVUELTO NO LOCALIZADO" ||
    upper === "TD_DEVUELTO_NO_LOCALIZADO"
  ) {
    return CardStatus.TD_DEVUELTO_NO_LOCALIZADO;
  }
  if (
    upper === "TD- NO LE INTERESA" ||
    upper === "TD-NO LE INTERESA" ||
    upper === "NO LE INTERESA" ||
    upper === "TD_NO_LE_INTERESA"
  ) {
    return CardStatus.TD_NO_LE_INTERESA;
  }
  if (
    upper === "TD- RETIRADA EN OFICINA" ||
    upper === "TD-RETIRADA EN OFICINA" ||
    upper === "RETIRADA EN OFICINA" ||
    upper === "TD_RETIRADA_EN_OFICINA"
  ) {
    return CardStatus.TD_RETIRADA_EN_OFICINA;
  }
  if (
    upper === "TD- SOLICITADA POR ERROR" ||
    upper === "TD-SOLICITADA POR ERROR" ||
    upper === "SOLICITADA POR ERROR" ||
    upper === "TD_SOLICITADA_POR_ERROR"
  ) {
    return CardStatus.TD_SOLICITADA_POR_ERROR;
  }
  if (
    upper === "TD- ZONA FUERA DE COBERTURA" ||
    upper === "TD-ZONA FUERA DE COBERTURA" ||
    upper === "ZONA FUERA DE COBERTURA" ||
    upper === "TD_ZONA_FUERA_COBERTURA"
  ) {
    return CardStatus.TD_ZONA_FUERA_COBERTURA;
  }
  if (upper === "NO LOCALIZADO" || upper === "NO LOCALIZADA" || upper === "NO_LOCALIZADO") {
    return CardStatus.NO_LOCALIZADO;
  }
  if (upper === "EN RUTA" || upper === "EN_RUTA") {
    return CardStatus.EN_RUTA;
  }
  if (upper === "DESPACHADA" || upper === "EN PROCESO" || upper === "EN_PROCESO" || upper === "DESPACHADO") {
    return CardStatus.DESPACHADA;
  }

  return CardStatus.DESPACHADA;
}

/**
 * Maps Pinit export status string to Celego CardStatus.
 */
export function mapPinitExportStatus(pinitStatus: string | null | undefined): CardStatus | null {
  if (!pinitStatus) return null;
  const s = pinitStatus.trim().toLowerCase();

  // Check code prefixes and specific non-delivered phrases first
  if (s.includes("310") || s.includes("intentados no entregados") || s.includes("no entregad")) {
    return CardStatus.NO_LOCALIZADO;
  }
  if (s.includes("207") || s.includes("en espera para salir de nuevo a ruta")) {
    return CardStatus.NO_LOCALIZADO;
  }
  if (s.includes("318") || s.includes("rechazado por el cliente") || s.includes("no le interesa")) {
    return CardStatus.TD_NO_LE_INTERESA;
  }
  if (s.includes("420") || s.includes("cancelado") || s.includes("orden anulada")) {
    return CardStatus.TD_DEVUELTO_NO_LOCALIZADO;
  }
  if (s.includes("311") || s.includes("cliente no disponible") || s.includes("dnd")) {
    return CardStatus.TD_DEVUELTO_NO_LOCALIZADO;
  }
  if (s.includes("303") || s.includes("en transito") || s.includes("en ruta")) {
    return CardStatus.EN_RUTA;
  }
  if (s.includes("360") || s.includes("entregado al cliente") || s.includes("entregado")) {
    return CardStatus.TD_ENTREGADO;
  }

  return null;
}

/**
 * Converts CardStatus back to the exact format needed for the Consolidado Excel export.
 */
export function debitStatusToConsolidadoString(status: CardStatus | string | null | undefined): string {
  if (!status) return "";
  switch (status) {
    case CardStatus.TD_ENTREGADO:
    case "TD_ENTREGADO":
      return "TD- ENTREGADO";
    case CardStatus.TD_DEVUELTO_NO_LOCALIZADO:
    case "TD_DEVUELTO_NO_LOCALIZADO":
      return "TD- DEVUELTO NO LOCALIZADO";
    case CardStatus.TD_NO_LE_INTERESA:
    case "TD_NO_LE_INTERESA":
      return "TD- NO LE INTERESA";
    case CardStatus.TD_RETIRADA_EN_OFICINA:
    case "TD_RETIRADA_EN_OFICINA":
      return "TD- RETIRADA EN OFICINA";
    case CardStatus.TD_SOLICITADA_POR_ERROR:
    case "TD_SOLICITADA_POR_ERROR":
      return "TD- SOLICITADA POR ERROR";
    case CardStatus.TD_ZONA_FUERA_COBERTURA:
    case "TD_ZONA_FUERA_COBERTURA":
      return "TD- ZONA FUERA DE COBERTURA";
    case CardStatus.NO_LOCALIZADO:
    case "NO_LOCALIZADO":
      return "NO LOCALIZADO";
    case CardStatus.EN_RUTA:
    case "EN_RUTA":
      return "EN RUTA";
    case CardStatus.DESPACHADA:
    case "DESPACHADA":
    default:
      return "";
  }
}

/**
 * Checks if a status is terminal for debit cards (closed cycle).
 */
export function isDebitTerminalStatus(status: CardStatus | string | null | undefined): boolean {
  if (!status) return false;
  return (
    status === CardStatus.TD_ENTREGADO ||
    status === CardStatus.TD_DEVUELTO_NO_LOCALIZADO ||
    status === CardStatus.TD_NO_LE_INTERESA ||
    status === CardStatus.TD_RETIRADA_EN_OFICINA ||
    status === CardStatus.TD_SOLICITADA_POR_ERROR ||
    status === CardStatus.TD_ZONA_FUERA_COBERTURA ||
    status === "TD_ENTREGADO" ||
    status === "TD_DEVUELTO_NO_LOCALIZADO" ||
    status === "TD_NO_LE_INTERESA" ||
    status === "TD_RETIRADA_EN_OFICINA" ||
    status === "TD_SOLICITADA_POR_ERROR" ||
    status === "TD_ZONA_FUERA_COBERTURA"
  );
}

/**
 * Checks if a status counts as real delivery for debit cards.
 */
export function isDebitDelivered(status: CardStatus | string | null | undefined): boolean {
  return status === CardStatus.TD_ENTREGADO || status === "TD_ENTREGADO";
}

/**
 * Checks if a status is a return for debit cards.
 */
export function isDebitReturn(status: CardStatus | string | null | undefined): boolean {
  if (!status) return false;
  return (
    status === CardStatus.TD_DEVUELTO_NO_LOCALIZADO ||
    status === CardStatus.TD_NO_LE_INTERESA ||
    status === CardStatus.TD_RETIRADA_EN_OFICINA ||
    status === CardStatus.TD_SOLICITADA_POR_ERROR ||
    status === CardStatus.TD_ZONA_FUERA_COBERTURA ||
    status === "TD_DEVUELTO_NO_LOCALIZADO" ||
    status === "TD_NO_LE_INTERESA" ||
    status === "TD_RETIRADA_EN_OFICINA" ||
    status === "TD_SOLICITADA_POR_ERROR" ||
    status === "TD_ZONA_FUERA_COBERTURA"
  );
}

/**
 * Human-readable label for UI.
 */
export function formatDebitStatusLabel(status: CardStatus | string | null | undefined): string {
  if (!status) return "Sin Estado";
  switch (status) {
    case CardStatus.TD_ENTREGADO:
    case "TD_ENTREGADO":
      return "TD- Entregado";
    case CardStatus.TD_DEVUELTO_NO_LOCALIZADO:
    case "TD_DEVUELTO_NO_LOCALIZADO":
      return "TD- Devuelto No Localizado";
    case CardStatus.TD_NO_LE_INTERESA:
    case "TD_NO_LE_INTERESA":
      return "TD- No le Interesa";
    case CardStatus.TD_RETIRADA_EN_OFICINA:
    case "TD_RETIRADA_EN_OFICINA":
      return "TD- Retirada en Oficina";
    case CardStatus.TD_SOLICITADA_POR_ERROR:
    case "TD_SOLICITADA_POR_ERROR":
      return "TD- Solicitada por Error";
    case CardStatus.TD_ZONA_FUERA_COBERTURA:
    case "TD_ZONA_FUERA_COBERTURA":
      return "TD- Fuera de Cobertura";
    case CardStatus.NO_LOCALIZADO:
    case "NO_LOCALIZADO":
      return "No Localizado";
    case CardStatus.EN_RUTA:
    case "EN_RUTA":
      return "En Ruta";
    case CardStatus.DESPACHADA:
    case "DESPACHADA":
      return "Despachada";
    default:
      return String(status);
  }
}
