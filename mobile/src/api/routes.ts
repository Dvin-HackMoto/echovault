// EchoVault mobile — the hub's route list, read from /openapi.json (FastAPI
// publishes it by itself). Used by tests/hubContract.test.ts to check that
// every route the app calls exists on a running hub. No React Native imports.

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
