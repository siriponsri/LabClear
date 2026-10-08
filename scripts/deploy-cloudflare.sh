#!/usr/bin/env bash
# Deploy LabClear to your Cloudflare account (Workers Paid plan, Docker running, `npx wrangler login` done).
#   scripts/deploy-cloudflare.sh            # dry run: type check, build, no upload
#   scripts/deploy-cloudflare.sh --deploy   # deploy API (container) then website
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
commit="$(git -C "$root" rev-parse HEAD)"
deploy="${1:-}"
if [ "$deploy" = "--deploy" ] && [ -n "$(git -C "$root" status --porcelain)" ]; then
  echo "Commit or review local changes before deploying." >&2; exit 1
fi
docker info --format '{{.ServerVersion}}' >/dev/null || { echo "Start Docker before building the API container." >&2; exit 1; }

echo "== API worker (deploy/cloudflare)"
cd "$root/deploy/cloudflare"
npm ci
npm run check
if [ "$deploy" = "--deploy" ]; then npx wrangler deploy --var "LABCLEAR_COMMIT_SHA:$commit"
else npx wrangler deploy --dry-run --var "LABCLEAR_COMMIT_SHA:$commit"; fi

echo "== Website worker (web)"
cd "$root/web"
npm ci
npx tsc --noEmit -p .
npx opennextjs-cloudflare build
if [ "$deploy" = "--deploy" ]; then npx opennextjs-cloudflare deploy
else npx wrangler deploy --dry-run; fi
echo "Done. Open https://<your domain>/health and check version 4.0.0 and commit $commit."
