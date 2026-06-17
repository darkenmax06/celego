type DeliveryLocationInput = {
  provincia: string;
  zona: string;
  reassignedProvince?: string | null;
  reassignedZone?: string | null;
};

export function resolveDeliveryLocation(card: DeliveryLocationInput) {
  return {
    province: card.reassignedProvince?.trim() || card.provincia,
    zone: card.reassignedZone?.trim() || card.zona,
    reassigned: Boolean(card.reassignedProvince?.trim() && card.reassignedZone?.trim()),
  };
}

export function resolveBillableZone(card: DeliveryLocationInput) {
  return resolveDeliveryLocation(card).zone;
}
