import { CardStatus } from "@prisma/client";
import { normalizeText } from "@/lib/utils";

const map: Record<string, CardStatus> = {
  DESPACHADA: CardStatus.DESPACHADA,
  ENVIADA_INTERIOR: CardStatus.ENVIADA_INTERIOR,
  ENVIADAAINTERIOR: CardStatus.ENVIADA_INTERIOR,
  ENRUTA: CardStatus.EN_RUTA,
  EN_RUTA: CardStatus.EN_RUTA,
  ACUSERECIBIDO: CardStatus.ACUSE_RECIBIDO,
  ACUSE_RECIBIDO: CardStatus.ACUSE_RECIBIDO,
  DEVUELTATIENDA: CardStatus.DEVUELTA_TIENDA,
  DEVUELTAATIENDA: CardStatus.DEVUELTA_TIENDA,
  DEVUELTA_TIENDA: CardStatus.DEVUELTA_TIENDA,
  ENTREGADIGITAL: CardStatus.ENTREGA_DIGITAL,
  ENTREGA_DIGITAL: CardStatus.ENTREGA_DIGITAL,
  ENTREGADA: CardStatus.ENTREGADA,
  RETORNADA: CardStatus.RETORNADA,
  TD_ENTREGADO: CardStatus.TD_ENTREGADO,
  TDENTREGADO: CardStatus.TD_ENTREGADO,
  TD_DEVUELTO_NO_LOCALIZADO: CardStatus.TD_DEVUELTO_NO_LOCALIZADO,
  TDDEVUELTONOLOCALIZADO: CardStatus.TD_DEVUELTO_NO_LOCALIZADO,
  TD_NO_LE_INTERESA: CardStatus.TD_NO_LE_INTERESA,
  TDNOLEINTERESA: CardStatus.TD_NO_LE_INTERESA,
  TD_RETIRADA_EN_OFICINA: CardStatus.TD_RETIRADA_EN_OFICINA,
  TDRETIRADAENOFICINA: CardStatus.TD_RETIRADA_EN_OFICINA,
  TD_SOLICITADA_POR_ERROR: CardStatus.TD_SOLICITADA_POR_ERROR,
  TDSOLICITADAPORERROR: CardStatus.TD_SOLICITADA_POR_ERROR,
  TD_ZONA_FUERA_COBERTURA: CardStatus.TD_ZONA_FUERA_COBERTURA,
  TDZONAFUERACOBERTURA: CardStatus.TD_ZONA_FUERA_COBERTURA,
  NO_LOCALIZADO: CardStatus.NO_LOCALIZADO,
  NOLOCALIZADO: CardStatus.NO_LOCALIZADO,
  EN_PROCESO_DE_RETORNO: CardStatus.EN_PROCESO_DE_RETORNO,
  ENPROCESODERETORNO: CardStatus.EN_PROCESO_DE_RETORNO,
};

export function toCardStatus(
  input: string | null | undefined,
  fallback: CardStatus = CardStatus.DESPACHADA,
) {
  if (!input) return fallback;
  const key = normalizeText(input).toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
  const strippedKey = key.replace(/_/g, "");
  return map[key] ?? map[strippedKey] ?? fallback;
}
