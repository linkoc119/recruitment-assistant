/**
 * Generic domain-layer error. `code` is one of the contract vocabulary keys
 * in `lib/http/errors.ts` `ERROR_STATUS` (docs/api/README.md §2) — route
 * handlers (Phase 4) catch anything with a string `.code` and map it through
 * `domainError(err.code, err.message)`.
 *
 * Some repositories (`StaleJobError`, `StaleDraftError`, `StaleCriteriaError`,
 * `ActiveRunError`, `StaleResultError`) already throw their own small classes
 * with the same `{ code, message }` shape instead of this one — both are
 * caught the same way at the HTTP boundary, so services are free to use
 * either a repository's own error or this generic one.
 */
export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "DomainError";
  }
}

export function notFound(what: string): DomainError {
  return new DomainError("resource_not_found", `${what} not found.`);
}
