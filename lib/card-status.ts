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
};

export function toCardStatus(
  input: string | null | undefined,
  fallback: CardStatus = CardStatus.DESPACHADA,
) {
  if (!input) return fallback;
  const key = normalizeText(input).replace(/\s+/g, "").replace(/-/g, "_");
  return map[key] ?? fallback;
}
