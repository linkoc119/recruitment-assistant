// screen-hierarchy.md §5 — default landing order:
// 1) published run -> SCR-06, 2) active run -> SCR-05,
// 3) approved criteria + ready CV -> SCR-05, 4) approved criteria only -> SCR-04, 5) else -> SCR-03.
export async function resolveDefaultLanding(): Promise<string> {
  return "/positions";
}
