export function buildRouteReassignmentNote(input: {
  previousRouteId: string;
  previousMessengerName: string;
  nextRouteId: string;
  nextMessengerName: string;
}) {
  return `Reasignada de ${input.previousMessengerName} (ruta ${input.previousRouteId}) a ${input.nextMessengerName} (ruta ${input.nextRouteId})`;
}
