export function buildResolvedCardsPreviewSummary(selectedCardCount: number) {
  return {
    found: Math.max(0, selectedCardCount),
    ambiguous: 0,
    notFound: 0,
    alreadyAssigned: 0,
    notEligible: 0,
    duplicates: 0,
  };
}

export function getPostCreateRouteBrowseFilters(input: {
  createdDate: string;
  currentFrom: string;
  currentTo: string;
}) {
  return {
    from: input.currentFrom && input.currentFrom < input.createdDate ? input.currentFrom : input.createdDate,
    to: input.currentTo && input.currentTo > input.createdDate ? input.currentTo : input.createdDate,
    messengerId: "ALL" as const,
    productType: "ALL" as const,
  };
}
