/**
 * Shared rule for the `RouteItem.checkedAt` stamp written when a messenger
 * uploads delivery evidence.
 *
 * Pure and Prisma-free so it can be unit tested with a relative import under the
 * node vitest environment.
 */

/**
 * `checkedAt` records that the item was resolved on the route.
 *
 * Sending the item back out on route (`EN_RUTA`) clears the stamp; any other
 * marked status closes the item and stamps it with the upload instant.
 */
export function resolveRouteItemCheckedAt(nextStatus: string, now: Date): Date | null {
  return nextStatus === "EN_RUTA" ? null : now;
}
