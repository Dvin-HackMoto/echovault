// EchoVault mobile — decides, per request, whether the real hub or the demo hub
// answers.
//
// The hub publishes every route it has at /openapi.json (FastAPI does this by
// itself). A route the hub has is always sent to the hub. A route it does not
// have yet (that backend module is not merged) goes to the demo hub in "auto"
// mode, so the screen still works and is labelled "Demo". No React Native
// imports, so it is unit-tested in tests/routes.test.ts.

export type DataMode =
  | "auto" // real hub for every route it has, demo hub for the rest
  | "hub" // real hub only; a missing route is an error (use to check integration)
  | "demo"; // demo hub only, no laptop needed

export type Source = "hub" | "demo" | "missing";

export interface HubRoutes {
  has(method: string, path: string): boolean;
}

/** Build a matcher from the hub's /openapi.json "paths" object. */
export function parseOpenApi(spec: { paths?: Record<string, Record<string, unknown>> }): HubRoutes {
  const routes = Object.entries(spec.paths ?? {}).flatMap(([template, methods]) =>
    Object.keys(methods).map((method) => ({
      method: method.toUpperCase(),
      // "/schedule/{item_id}/ack" -> ^/schedule/[^/]+/ack$
      pattern: new RegExp(
        "^" + template.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^/}]+\}/g, "[^/]+") + "$",
      ),
    })),
  );
  return {
    has(method, path) {
      const bare = path.split("?")[0];
      const upper = method.toUpperCase();
      return routes.some((r) => r.method === upper && r.pattern.test(bare));
    },
  };
}

/**
 * `hubRoutes` is null when the hub has not been reached yet. "auto" then still
 * sends the request to the hub, so an unreachable hub shows up as "can't reach
 * the hub" (and cached data) instead of being quietly replaced by demo data.
 */
export function chooseSource(
  mode: DataMode,
  hubRoutes: HubRoutes | null,
  method: string,
  path: string,
): Source {
  if (mode === "demo") return "demo";
  if (hubRoutes === null || hubRoutes.has(method, path)) return "hub";
  return mode === "auto" ? "demo" : "missing";
}

/** Feature name for a path, e.g. "/medications/logs/x" -> "medications". */
export function featureOf(path: string): string {
  return path.split("?")[0].split("/").filter(Boolean)[0] ?? "";
}
