import type { RouteDefinition, RouteParams, ScreenModule } from "./types.js";
import { resolveDefaultLanding } from "./default-landing.js";
import { updateShell } from "../shell/index.js";

function pathToRegex(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const escaped = path
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{(\w+)\\\}/g, (_match, name: string) => {
      paramNames.push(name);
      return "([^/]+)";
    });
  return { pattern: new RegExp(`^${escaped}$`), paramNames };
}

function route(path: string, load: () => Promise<ScreenModule>): RouteDefinition {
  const { pattern, paramNames } = pathToRegex(path);
  return { pattern, paramNames, load };
}

// screen-hierarchy.md §2.1 — canonical IA path -> hash route -> SCR-xx screen.
const routes: RouteDefinition[] = [
  route("/positions", () => import("../screens/scr-01-position-list/index.js")),
  route("/positions/new", () => import("../screens/scr-02-position-jd-form/index.js")),
  route("/positions/{position}/edit", () => import("../screens/scr-02-position-jd-form/index.js")),
  route("/positions/{position}/criteria", () => import("../screens/scr-03-criteria-review/index.js")),
  route("/positions/{position}/cv-workspace", () => import("../screens/scr-04-cv-workspace/index.js")),
  route("/positions/{position}/screening-runs/{run}", () => import("../screens/scr-05-screening-run/index.js")),
  route("/positions/{position}/ranking", () => import("../screens/scr-06-published-ranking/index.js")),
  route("/positions/{position}/candidates/{result}", () => import("../screens/scr-07-candidate-result/index.js")),
  route("/positions/{position}/runs", () => import("../screens/scr-08-run-history/index.js")),
  route("/positions/{position}/criteria/new-revision", () => import("../screens/scr-03-criteria-review/index.js")),
  route("/positions/{position}/criteria/{revision}", () => import("../screens/scr-03-criteria-review/index.js")),
  route("/positions/{position}/comparison", () => import("../screens/scr-10-run-comparison/index.js")),
];

let current: ScreenModule | null = null;

function matchRoute(hashPath: string): { def: RouteDefinition; params: RouteParams } | null {
  for (const def of routes) {
    const match = def.pattern.exec(hashPath);
    if (match) {
      const params: RouteParams = {};
      def.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      return { def, params };
    }
  }
  return null;
}

async function render(hashPath: string): Promise<void> {
  const container = document.getElementById("app");
  if (!container) return;

  const defaultLanding = await resolveDefaultLanding();
  const targetPath = hashPath === "/" ? defaultLanding : hashPath;
  const matched = matchRoute(targetPath) ?? matchRoute(defaultLanding);
  if (!matched) return;

  updateShell(targetPath);

  if (current) {
    current.unmount();
    current = null;
  }

  const mod = await matched.def.load();
  current = mod;
  mod.mount(container, matched.params);
}

function currentHashPath(): string {
  const hash = window.location.hash;
  return hash.startsWith("#") ? hash.slice(1) || "/" : "/";
}

export function startRouter(): void {
  window.addEventListener("hashchange", () => {
    void render(currentHashPath());
  });
  void render(currentHashPath());
}
