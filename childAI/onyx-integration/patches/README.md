# Onyx upstream patches

`onyx-web/` is a sparse clone of `https://github.com/onyx-dot-app/onyx#main`,
gitignored at the repo root. The patches in this directory capture the small
modifications we apply to upstream files so they're not lost if the clone is
re-fetched.

## Apply order

If you re-clone `onyx-web/`, apply the patches in numeric order:

```bash
cd onyx-web
for p in ../onyx-integration/patches/*.patch; do
  patch -p2 < "$p"
done
```

(`-p2` strips the leading `/tmp/onyx-route-original.ts` and `onyx-web/` segments
from the diff paths.)

## Patches

- `01-auth-bridge.patch` — three related modifications. Affects two files:

  **`web/src/app/api/[...path]/route.ts`** (catch-all proxy for client-side `/api/*` calls):
    1. Preserves the `/api/` prefix when forwarding to the upstream URL.
       Onyx's Python backend serves routes at root (no prefix), but our Fastify
       keeps `/api/` on every route, so the proxy must forward `/api/me` to
       `INTERNAL_URL/api/me` instead of stripping it down to `INTERNAL_URL/me`.
    2. Translates the `app_token` cookie our existing childAI frontend sets
       into an `Authorization: Bearer <jwt>` header on the Next.js → Fastify
       proxy hop. Without this, the Onyx UI loads as the anonymous user
       instead of the signed-in learner.

  **`web/src/lib/utilsSS.ts`** (server-side fetch helper used by SSR pages):
    3. Same `/api/` prefix preservation as #1, but for the SSR code path.
       `getAuthTypeMetadataSS()` and `getCurrentUserSS()` use `buildUrl(path)`
       which bypasses the catch-all proxy and calls Fastify directly. Without
       this, the login page SSR fetch fails and the page errors before
       rendering.
