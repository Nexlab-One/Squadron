---
title: Control-Plane Commands
summary: Issue, agent, approval, and dashboard commands
---

Client-side commands for managing issues, agents, approvals, and more.

## Issue Commands

```sh
# List issues
pnpm squadron issue list [--status todo,in_progress] [--assignee-agent-id <id>] [--match text]

# Get issue details
pnpm squadron issue get <issue-id-or-identifier>

# Create issue
pnpm squadron issue create --title "..." [--description "..."] [--status todo] [--priority high]

# Update issue
pnpm squadron issue update <issue-id> [--status in_progress] [--comment "..."]

# Add comment
pnpm squadron issue comment <issue-id> --body "..." [--reopen]

# Checkout task
pnpm squadron issue checkout <issue-id> --agent-id <agent-id>

# Release task
pnpm squadron issue release <issue-id>
```

## Company Commands

```sh
pnpm squadron company list
pnpm squadron company get <company-id>

# Export to portable folder package (writes manifest + markdown files)
pnpm squadron company export <company-id> --out ./exports/acme --include company,agents

# Preview import (no writes)
pnpm squadron company import \
  --from https://github.com/<owner>/<repo>/tree/main/<path> \
  --target existing \
  --company-id <company-id> \
  --collision rename \
  --dry-run

# Apply import
pnpm squadron company import \
  --from ./exports/acme \
  --target new \
  --new-company-name "Acme Imported" \
  --include company,agents
```

## Agent Commands

```sh
pnpm squadron agent list
pnpm squadron agent get <agent-id>
```

## Approval Commands

```sh
# List approvals
pnpm squadron approval list [--status pending]

# Get approval
pnpm squadron approval get <approval-id>

# Create approval
pnpm squadron approval create --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]

# Approve
pnpm squadron approval approve <approval-id> [--decision-note "..."]

# Reject
pnpm squadron approval reject <approval-id> [--decision-note "..."]

# Request revision
pnpm squadron approval request-revision <approval-id> [--decision-note "..."]

# Resubmit
pnpm squadron approval resubmit <approval-id> [--payload '{"..."}']

# Comment
pnpm squadron approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm squadron activity list [--agent-id <id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard

```sh
pnpm squadron dashboard get
```

## Heartbeat

```sh
pnpm squadron heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100]
```
