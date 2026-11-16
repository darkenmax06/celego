/**
 * Guards overlapping async requests so only the most recently started one may
 * apply its result. Call `start()` when a request begins and check
 * `isLatest(token)` before applying its response.
 */
export function createLatestOnly() {
  let latest = 0;
  return {
    start() {
      latest += 1;
      return latest;
    },
    isLatest(token: number) {
      return token === latest;
    },
  };
}
