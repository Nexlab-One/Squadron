# CLI Reference

Squadron CLI (invoked as `squadron`) supports both:

- instance setup/diagnostics (`onboard`, `doctor`, `configure`, `env`, `allowed-hostname`)
- control-plane client operations (issues, approvals, agents, activity, dashboard)

## Base Usage

Use repo script in development:

```sh
pnpm squadron --help
```

First-time local bootstrap + run:

```sh
pnpm squadron run
```

Choose local instance:

```sh
pnpm squadron run --instance dev
```

## Deployment Modes

Mode taxonomy and design intent are documented in `doc/DEPLOYMENT-MODES.md`.

Current CLI behavior:

- `squadron onboard` and `squadron configure --section server` set deployment mode in config
- runtime can override mode with `PAPERCLIP_DEPLOYMENT_MODE`
- `squadron run` and `squadron doctor` do not yet expose a direct `--mode` flag

Target behavior (planned) is documented in `doc/DEPLOYMENT-MODES.md` section 5.

Allow an authenticated/private hostname (for example custom Tailscale DNS):

```sh
pnpm squadron allowed-hostname dotta-macbook-pro
```

All client commands support:

- `--data-dir <path>`
- `--api-base <url>`
- `--api-key <token>`
- `--context <path>`
- `--profile <name>`
- `--json`

Company-scoped commands also support `--company-id <id>`.

Use `--data-dir` on any CLI command to isolate all default local state (config/context/db/logs/storage/secrets) away from `~/.paperclip`:

```sh
pnpm squadron run --data-dir ./tmp/paperclip-dev
pnpm squadron issue list --data-dir ./tmp/paperclip-dev
```

## Context Profiles

Store local defaults in `~/.paperclip/context.json`:

```sh
pnpm squadron context set --api-base http://localhost:3100 --company-id <company-id>
pnpm squadron context show
pnpm squadron context list
pnpm squadron context use default
```

To avoid storing secrets in context, set `apiKeyEnvVarName` and keep the key in env:

```sh
pnpm squadron context set --api-key-env-var-name PAPERCLIP_API_KEY
export PAPERCLIP_API_KEY=...
```

## Company Commands

```sh
pnpm squadron company list
pnpm squadron company get <company-id>
pnpm squadron company delete <company-id-or-prefix> --yes --confirm <same-id-or-prefix>
```

Examples:

```sh
pnpm squadron company delete PAP --yes --confirm PAP
pnpm squadron company delete 5cbe79ee-acb3-4597-896e-7662742593cd --yes --confirm 5cbe79ee-acb3-4597-896e-7662742593cd
```

Notes:

- Deletion is server-gated by `PAPERCLIP_ENABLE_COMPANY_DELETION`.
- With agent authentication, company deletion is company-scoped. Use the current company ID/prefix (for example via `--company-id` or `PAPERCLIP_COMPANY_ID`), not another company.

## Issue Commands

```sh
pnpm squadron issue list --company-id <company-id> [--status todo,in_progress] [--assignee-agent-id <agent-id>] [--match text]
pnpm squadron issue get <issue-id-or-identifier>
pnpm squadron issue create --company-id <company-id> --title "..." [--description "..."] [--status todo] [--priority high]
pnpm squadron issue update <issue-id> [--status in_progress] [--comment "..."]
pnpm squadron issue comment <issue-id> --body "..." [--reopen]
pnpm squadron issue checkout <issue-id> --agent-id <agent-id> [--expected-statuses todo,backlog,blocked]
pnpm squadron issue release <issue-id>
```

## Agent Commands

```sh
pnpm squadron agent list --company-id <company-id>
pnpm squadron agent get <agent-id>
pnpm squadron agent local-cli <agent-id-or-shortname> --company-id <company-id>
```

`agent local-cli` is the quickest way to run local Claude/Codex manually as a Paperclip agent:

- creates a new long-lived agent API key
- installs missing Squadron skills into `~/.codex/skills` and `~/.claude/skills`
- prints `export ...` lines for `SQUADRON_API_URL`, `SQUADRON_COMPANY_ID`, `SQUADRON_AGENT_ID`, and `SQUADRON_API_KEY`

Example for shortname-based local setup:

```sh
pnpm squadron agent local-cli codexcoder --company-id <company-id>
pnpm squadron agent local-cli claudecoder --company-id <company-id>
```

## Approval Commands

```sh
pnpm squadron approval list --company-id <company-id> [--status pending]
pnpm squadron approval get <approval-id>
pnpm squadron approval create --company-id <company-id> --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]
pnpm squadron approval approve <approval-id> [--decision-note "..."]
pnpm squadron approval reject <approval-id> [--decision-note "..."]
pnpm squadron approval request-revision <approval-id> [--decision-note "..."]
pnpm squadron approval resubmit <approval-id> [--payload '{"...":"..."}']
pnpm squadron approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm squadron activity list --company-id <company-id> [--agent-id <agent-id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard Commands

```sh
pnpm squadron dashboard get --company-id <company-id>
```

## Heartbeat Command

`heartbeat run` now also supports context/api-key options and uses the shared client stack:

```sh
pnpm squadron heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100] [--api-key <token>]
```

## Local Storage Defaults

Default local instance root is `~/.paperclip/instances/default`:

- config: `~/.paperclip/instances/default/config.json`
- embedded db: `~/.paperclip/instances/default/db`
- logs: `~/.paperclip/instances/default/logs`
- storage: `~/.paperclip/instances/default/data/storage`
- secrets key: `~/.paperclip/instances/default/secrets/master.key`

Override base home or instance with env vars:

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm squadron run
```

## Storage Configuration

Configure storage provider and settings:

```sh
pnpm squadron configure --section storage
```

Supported providers:

- `local_disk` (default; local single-user installs)
- `s3` (S3-compatible object storage)
