# Cloudflare deployment — DEFERRED

**Integration 4.0.0-rc1 deploys to the existing Render service.** This folder keeps the Cloudflare
work from the Claude 4.0.0 branch (commit `95bf3d7`, which extended the 3.1.0 preparation in
`994fe6e`) as a later option, as the owner asked. Nothing here is used by Render, by the tests or by
the delivery bundle's verification. It was not re-tested against the integrated Codex backend.

| Piece | Where | State in rc1 |
|---|---|---|
| API worker + Container | `deploy/cloudflare/` (`wrangler.jsonc`, `src/index.ts`) | Kept as-is |
| Container image | `Dockerfile`, `.dockerignore`, `scripts/container_start.py` (repository root) | Kept; `COPY runtime_skills` added because the Codex transport reads `runtime_skills/model_registry.json` on every model call |
| Website worker | `web/worker.ts`, `web/wrangler.jsonc`, `web/open-next.config.ts`, `npm run cf:*` | Kept; `lib/api/server.ts` uses the service binding only when `API_ORIGIN` is unset |
| Deploy scripts | `scripts/deploy-cloudflare.sh`, `scripts/Deploy-LabClearCloudflare.ps1` | Kept; not run |
| GitHub Actions | `deploy/cloudflare/ci/deploy-cloudflare.yml` | Moved out of `.github/workflows/` so it can never deploy on push |
| Guide (Thai) | `docs/deploy/cloudflare.md` | Kept with a DEFERRED banner |

## Known gaps before this option can be used

1. `wrangler.jsonc` `vars` were written for the Claude backend: `OPENROUTER_SORT`, `PARALLEL_CHECKS`
   and `EMBEDDING_ENABLED=true` are not Codex settings; `GUARD_PROVIDER=openrouter_guard` is not a
   Codex preset; `PROJECT_BUDGET_THB=360` differs from the Codex 300 THB cap. Re-derive every value
   from `docs/ceo-upgrade/ENV_HANDOVER.md` and keep all six new flags off.
2. The Codex opt-in roles need explicit models, prices and reviewed OpenRouter endpoint IDs; the
   Claude "fast profile" button does not exist in the integrated backend.
3. Workers Paid and Containers cost money; the owner chose Render for now.
4. The Docker image, a real PostgreSQL connection and any live provider call were never tested.

Cloudflare **Free** as DNS/proxy in front of Render needs none of these files; see
`docs/deploy/render-web.md`.
