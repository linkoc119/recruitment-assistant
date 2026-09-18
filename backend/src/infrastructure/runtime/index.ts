/** Mock state shared across Next bundles/reloads, never across processes. */
const host = globalThis as typeof globalThis & { __recruitmentMockState?: Map<string, unknown> };
const state = host.__recruitmentMockState ??= new Map();
export function processSingleton<T>(key: string, create: () => T): T {
  if (!state.has(key)) state.set(key, create());
  return state.get(key) as T;
}
