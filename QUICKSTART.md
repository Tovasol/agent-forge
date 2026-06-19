# Quickstart (5 minutes)

```bash
# 0. You need Node >= 18.17 and the `claude` CLI logged in (for subscription auth).
node -v
claude --version    # if missing: npm i -g @anthropic-ai/claude-code  &&  claude login

# 1. Install
npm install

# 2. Configure
cp .env.example .env          # default auth = your Claude Code subscription
#    edit config/brief.json   # your business specifics (a sample is provided)

# 3. Check everything's wired
npm run doctor

# 4. Go — runs research → decide → build, pausing only at deploy/spend
npm run all

# Inspect as it works:
cat memory/progress.md
npm run status
```

## Run it piecemeal instead

```bash
npm run research     # deep cited market research  -> memory/findings/*.json
npm run decide       # scored decision tables       -> memory/decisions/*.json
npm run site         # build the React+CF site      -> site/scaffold/
npm run deploy       # GATED: ship to Cloudflare
npm run optimize     # propose one conversion experiment
```

## If it pauses at a gate

A spend or deploy gate stops the loop. Review `memory/progress.md`, then:

```bash
npm run resume
```

## Switch to API-key auth (for unattended/high-volume runs)

```bash
# in .env
FORGE_AUTH=apikey
ANTHROPIC_API_KEY=sk-ant-...
```

That's it. Everything else is in `README.md` and `docs/`.
