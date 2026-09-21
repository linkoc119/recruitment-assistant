// Resolves the empty hash ("#" or "#/") to SCR-01. This is the application's
// entry point, not the per-position landing order: that one is in
// scr-01-position-list's row action, and screen-hierarchy.md §5 follows it.
export async function resolveDefaultLanding(): Promise<string> {
  return "/positions";
}
