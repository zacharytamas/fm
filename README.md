# fm

FastMail JMAP CLI for triaging mailboxes and messages. Built for Bun.

## Requirements

- Bun (do not use Node.js)

## Setup

Set your FastMail API token via environment variable (Bun auto-loads `.env`):

```bash
export FASTMAIL_API_TOKEN="your-token"
```

## Run

```bash
bun run src/index.ts <command> [args]
```

Optional convenience alias:

```bash
alias fm="bun run src/index.ts"
```

## CLI Overview

Use `fm --help` for the full command list and `fm help <command>` for details.

Commands (high level):

- `mailbox list`, `mailbox get`
- `message list`, `message get`, `message move`
- `message add-mailbox`, `message remove-mailbox`
- `message archive`, `message trash`, `message delete`
- `message mark read|unread|flag|unflag`
- `message keyword set|remove`

Bulk note: `message move`, `message archive`, `message trash`, `message delete`, and `message mark` accept multiple IDs or `--stdin` for newline-delimited IDs.
Message list note: `message list` supports `--limit` (max 100), `--position` for pagination, and `--all` to fetch every page.

## Output Formats

- Default: human tables when stdout is a TTY, plain tab-separated lines otherwise.
- `--json` for machine-readable JSON.
- `--plain` for stable, line-oriented output.
- `--quiet` to suppress success output.

## Examples

```bash
# List mailboxes
fm mailbox list --plain

# Get a mailbox by role
fm mailbox get --role inbox --json

# List unread messages in inbox
fm message list --mailbox-role inbox --unread --limit 20

# Fetch all messages in a mailbox
fm message list --mailbox-role inbox --all

# Paginate messages
fm message list --mailbox-role inbox --limit 100 --position 100

# Fetch a message body
fm message get E123 --body --body-type text

# Move a message
fm message move E123 --from-role inbox --to-role archive

# Move multiple messages
fm message move E1 E2 --from-role inbox --to-role archive

# Move via stdin
printf "E1\nE2\n" | fm message move --stdin --from-role inbox --to-role archive

# Archive multiple messages
fm message archive E1 E2 E3 --no-mark-read

# Trash via stdin (requires --force for non-interactive)
printf "E1\nE2\n" | fm message trash --stdin --force
```
