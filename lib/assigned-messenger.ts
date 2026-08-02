export type AssignedMessengerRef = {
  id: string;
  nombre: string;
};

export type RouteAssignmentEvidence = {
  id: string;
  assignedAt: Date | string;
  messenger: AssignedMessengerRef;
};

export type ReassignmentEvidence = {
  id: string;
  assignedAt: Date | string;
  messenger: AssignedMessengerRef;
};

export type AssignedMessengerInput = {
  lastAssignedMessenger?: AssignedMessengerRef | null;
  currentMessenger?: AssignedMessengerRef | null;
  reassignedMessenger?: AssignedMessengerRef | null;
  reassignedAt?: Date | string | null;
  routeAssignments?: readonly RouteAssignmentEvidence[];
  reassignments?: readonly ReassignmentEvidence[];
};

export type AssignedMessengerResolution = {
  messenger: AssignedMessengerRef | null;
  source: "LAST_ASSIGNED" | "CURRENT" | "REASSIGNMENT" | "ROUTE" | "NONE";
  conflict: boolean;
};

type HistoricalEvidence = {
  id: string;
  assignedAtMs: number;
  messenger: AssignedMessengerRef;
  source: "REASSIGNMENT" | "ROUTE";
};

function timestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const result = date.getTime();
  return Number.isFinite(result) ? result : Number.NEGATIVE_INFINITY;
}

function historicalEvidence(input: AssignedMessengerInput) {
  const evidence: HistoricalEvidence[] = [];

  for (const route of input.routeAssignments ?? []) {
    evidence.push({
      id: route.id,
      assignedAtMs: timestamp(route.assignedAt),
      messenger: route.messenger,
      source: "ROUTE",
    });
  }

  for (const reassignment of input.reassignments ?? []) {
    evidence.push({
      id: reassignment.id,
      assignedAtMs: timestamp(reassignment.assignedAt),
      messenger: reassignment.messenger,
      source: "REASSIGNMENT",
    });
  }

  if (input.reassignedMessenger) {
    evidence.push({
      id: "card-reassignment",
      assignedAtMs: input.reassignedAt
        ? timestamp(input.reassignedAt)
        : Number.NEGATIVE_INFINITY,
      messenger: input.reassignedMessenger,
      source: "REASSIGNMENT",
    });
  }

  return evidence;
}

export function resolveAssignedMessenger(
  input: AssignedMessengerInput,
): AssignedMessengerResolution {
  if (input.lastAssignedMessenger) {
    return {
      messenger: input.lastAssignedMessenger,
      source: "LAST_ASSIGNED",
      conflict: false,
    };
  }

  if (input.currentMessenger) {
    return {
      messenger: input.currentMessenger,
      source: "CURRENT",
      conflict: false,
    };
  }

  const evidence = historicalEvidence(input);
  if (!evidence.length) {
    return { messenger: null, source: "NONE", conflict: false };
  }

  const latestTimestamp = Math.max(...evidence.map((item) => item.assignedAtMs));
  const latest = evidence.filter((item) => item.assignedAtMs === latestTimestamp);
  const explicitReassignments = latest.filter((item) => item.source === "REASSIGNMENT");
  const candidates = explicitReassignments.length ? explicitReassignments : latest;
  const messengerIds = new Set(candidates.map((item) => item.messenger.id));

  if (messengerIds.size > 1) {
    return { messenger: null, source: "NONE", conflict: true };
  }

  candidates.sort((left, right) => left.id.localeCompare(right.id));
  return {
    messenger: candidates[0].messenger,
    source: candidates[0].source,
    conflict: false,
  };
}

export function resolveAssignedMessengerName(
  input: AssignedMessengerInput,
  fallback = "SIN ASIGNAR",
) {
  return resolveAssignedMessenger(input).messenger?.nombre ?? fallback;
}
