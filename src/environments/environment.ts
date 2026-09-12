/**
 * Runtime configuration.
 *
 * `useMockBackend` swaps the HTTP layer for an in-memory implementation of the
 * documented POS API (see `core/http/mock-backend.ts`). Flip it to `false` to
 * talk to the real server at `apiBaseUrl`.
 */
export const environment = {
  production: false,
  appName: 'SuperSoft POS',
  apiBaseUrl: 'https://pp.amanstall.com/p',
  useMockBackend: true,
  /** Simulated latency (ms) for the mock backend, so loading states are visible. */
  mockLatency: 220,
};
