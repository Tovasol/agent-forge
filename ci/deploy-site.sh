#!/usr/bin/env sh
# Build + deploy the Cloudflare Pages site (site/scaffold), in CI.
#
# Replicates the proven local operator command (run from site/scaffold):
#     npm run build && npx wrangler pages deploy dist --project-name=pipelineforge-site
#
# Runs inside node:20-bookworm-slim at /work (the repo root). Self-contained: it
# produces its own dependencies via `npm ci` (so wrangler does NOT need to be
# pre-installed on the runner) using the shared, content-addressed /cache/npm.
#
# Credentials: locally wrangler uses your browser OAuth (`wrangler login`). CI has
# no browser, so it authenticates with an API token via env vars, injected from the
# sops-encrypted ci/secrets.enc.yaml (decrypted host-side, never on disk in the box):
#     CLOUDFLARE_API_TOKEN   — token with the "Cloudflare Pages: Edit" permission
#     CLOUDFLARE_ACCOUNT_ID  — your account id
set -eu
. /cicd/lib.sh

PROJECT=pipelineforge-site
SITE_DIR=site/scaffold

# Fail loud + early if creds are missing (clearer than a wrangler auth error).
: "${CLOUDFLARE_API_TOKEN:?missing — add to ci/secrets.enc.yaml (see ci/README.md), then unlock-ci}"
: "${CLOUDFLARE_ACCOUNT_ID:?missing — add to ci/secrets.enc.yaml (see ci/README.md)}"

cd "$SITE_DIR"

step "install deps (npm ci — shared /cache/npm)"
retry -n 3 -d 15 -- npm ci --no-audit --no-fund

step "build (tsc -b && vite build -> dist)"
npm run build

step "deploy -> Cloudflare Pages ($PROJECT)"
# --no-install: use the wrangler pinned by npm ci (no surprise version fetch).
# --branch=main targets the production branch (set in the Pages project); change it
#   for preview deploys. --commit-* attach metadata (no .git in the CI tree).
retry -n 3 -d 20 -- npx --no-install wrangler pages deploy dist \
  --project-name="$PROJECT" \
  --branch="$CI_BRANCH" \
  --commit-hash="$CI_SHA" \
  --commit-dirty=true

notify_success "deployed $PROJECT @ ${CI_SHA} ($CI_BRANCH)"
echo "OK: $PROJECT deployed @ $CI_SHA ($CI_BRANCH)"
