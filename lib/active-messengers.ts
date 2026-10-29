/** Pickers that create or assign work must only offer active (non-archived) messengers. */
export function filterActiveMessengers<T extends { activo?: boolean }>(messengers: T[]): T[] {
  return messengers.filter((messenger) => messenger.activo !== false);
}

/** Keep the id if it is still active; otherwise fall back to the first active messenger (or ""). */
export function reconcileMessengerId(id: string, activeMessengers: Array<{ id: string }>): string {
  if (activeMessengers.some((messenger) => messenger.id === id)) return id;
  return activeMessengers[0]?.id ?? "";
}

/** A persisted draft may reference a messenger archived since; keep the id only if still active. */
export function restorableMessengerId(id: string, activeMessengers: Array<{ id: string }>): string {
  return activeMessengers.some((messenger) => messenger.id === id) ? id : "";
}
