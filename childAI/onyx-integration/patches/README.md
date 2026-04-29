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

- `01-auth-bridge.patch` — translates the `app_token` cookie our existing
  childAI frontend sets into an `Authorization: Bearer <jwt>` header on the
  Next.js → Fastify proxy hop. Without this patch, the Onyx UI loads as the
  anonymous user instead of the signed-in learner.
