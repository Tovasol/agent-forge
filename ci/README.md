# CI deploy — Cloudflare Pages site (`site/scaffold` → `pipelineforge-site`)

What runs on a push to `main` (gitolite → cicd-runner):

| job | when | image | needs secrets |
|---|---|---|---|
| `smoke` | every push to `main` | `alpine` | no — liveness check |
| `deploy-site` | push to `main` touching `site/scaffold/**`, `ci/deploy-site.sh`, or `.gitolite/ci.yml` | `node:lts-bookworm-slim` | **yes** — `CLOUDFLARE_*` |

`deploy-site` replicates your proven local command (run from `site/scaffold`):
```bash
npm run build && npx wrangler pages deploy dist --project-name=pipelineforge-site
```

## (3) Dependencies — already self-contained
The job needs **nothing pre-installed on the runner** except docker (already there).
`ci/deploy-site.sh` runs `npm ci` inside the node container, which installs vite +
wrangler from `site/scaffold/package-lock.json` (shared `/cache/npm`, so it's fast
after the first run). The node image is pulled by docker on first run. wrangler does
**not** need to exist on the host.

## (2) Acquire the Cloudflare credentials
Locally wrangler authenticates via browser OAuth (`wrangler login`). CI has no
browser → use a scoped **API token** + **account id**, both delivered as secrets.

1. **API token** — Cloudflare dashboard → **My Profile → API Tokens → Create Token →
   Create Custom Token**:
   - Permissions: **Account → Cloudflare Pages → Edit**
   - Account Resources: **Include → your account**
   - (no zone perms needed for Pages deploy)
   - Create → copy the token (shown once).
2. **Account ID** — dashboard → **Workers & Pages** (right sidebar shows *Account ID*),
   or run `npx wrangler whoami` after a local `wrangler login`.
3. Sanity-check the token locally (optional):
   ```bash
   CLOUDFLARE_API_TOKEN=<token> npx wrangler whoami
   ```

## (1) Wire the secrets into CI (sops + age)
The runner already has an age recipient in `.sops.yaml`. Encrypt the two values into
`ci/secrets.enc.yaml` (the deploy job auto-decrypts it host-side at run time):

```bash
# from the repo root, on your Mac (needs sops installed: brew install sops)
sops ci/secrets.enc.yaml          # opens $EDITOR on a NEW file
#   add exactly:
#     CLOUDFLARE_API_TOKEN: <token>
#     CLOUDFLARE_ACCOUNT_ID: <account id>
#   save + quit → sops writes it ENCRYPTED (routed by .sops.yaml)

grep -q ENC ci/secrets.enc.yaml && echo "encrypted ✓"   # never commit plaintext
git add ci/secrets.enc.yaml .gitolite/ci.yml ci/deploy-site.sh
git commit && git push            # → gitolite triggers the deploy
```

The encrypted file is safe to commit (it's ciphertext). See `ci/secrets.enc.yaml.sample`
for the key shape.

## On the VPS — the key must be loaded
`deploy-site` (and `smoke`, since the repo now ships secrets) **defers** if the
runner's age key isn't loaded — it does not fail. After a reboot, post the key once:
```bash
pass show <your-key-entry> | ssh <user>@vps \
  'sudo -n -u cicd-runner /home/cicd-runner/runner/bin/unlock-ci'
```
`unlock-ci` then auto-drains anything deferred (deferred-recovery, DESIGN §10.6/§33).
If the key was already loaded, the push deploys immediately.

## Watch / verify
```bash
ssh <user>@vps 'tail -f ~cicd-runner/runner/runner.log'     # live
ssh <user>@vps 'sudo -iu cicd-runner ci-status'             # latest run + key state
```
A green run ends with `deploy-site: done` and the Pages URL in the deployment's
`output.log`. Confirm in the Cloudflare dashboard (Workers & Pages → pipelineforge-site).

## Notes / knobs
- **Production vs preview:** `--branch=$CI_BRANCH` targets the Pages *production
  branch* when it equals `main` (the default). For preview deploys, push a different
  branch and set the project's production branch accordingly.
- **Token rotation:** re-run the `sops ci/secrets.enc.yaml` edit, commit, push. To
  rotate the *age* key instead, see SOP §6.
- **Don't want smoke on every commit?** Delete the `smoke` job from `.gitolite/ci.yml`;
  `deploy-site` already path-filters to site changes only.
