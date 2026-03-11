---
title: Setup Commands
summary: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `squadron run`

One-command bootstrap and start:

```sh
pnpm squadron run
```

Does:

1. Auto-onboards if config is missing
2. Runs `squadron doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
pnpm squadron run --instance dev
```

## `squadron onboard`

Interactive first-time setup:

```sh
pnpm squadron onboard
```

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm squadron onboard --run
```

Non-interactive defaults + immediate start (opens browser on server listen):

```sh
pnpm squadron onboard --yes
```

## `squadron doctor`

Health checks with optional auto-repair:

```sh
pnpm squadron doctor
pnpm squadron doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration
- Storage configuration
- Missing key files

## `squadron configure`

Update configuration sections:

```sh
pnpm squadron configure --section server
pnpm squadron configure --section secrets
pnpm squadron configure --section storage
```

## `squadron env`

Show resolved environment configuration:

```sh
pnpm squadron env
```

## `squadron allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
pnpm squadron allowed-hostname my-tailscale-host
```

## Local Storage Paths

| Data | Default Path |
|------|-------------|
| Config | `~/.paperclip/instances/default/config.json` |
| Database | `~/.paperclip/instances/default/db` |
| Logs | `~/.paperclip/instances/default/logs` |
| Storage | `~/.paperclip/instances/default/data/storage` |
| Secrets key | `~/.paperclip/instances/default/secrets/master.key` |

Override with:

```sh
PAPERCLIP_HOME=/custom/home PAPERCLIP_INSTANCE_ID=dev pnpm squadron run
```

Or pass `--data-dir` directly on any command:

```sh
pnpm squadron run --data-dir ./tmp/paperclip-dev
pnpm squadron doctor --data-dir ./tmp/paperclip-dev
```
