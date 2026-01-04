---
name: fm
description: Provides detail on how to interact with the user's email account. Includes list mailboxes, fetch messages and bodies, move/add/remove mailboxes, archive/trash/delete, mark flags, and set/remove keywords. Use when the user asks to review, organize, or change their emails.
---

# fm (FastMail JMAP agent skill)

## Goal

Translate user intent into `fm` operations and return results without exposing CLI details. Always use `--json` for machine-readable output.

## Preconditions

- Ensure `FASTMAIL_API_TOKEN` is set (Bun auto-loads `.env`).
- Run commands in this repo via `bun run src/index.ts ...` or the `fm` alias.
- Prefer `--dry-run` for previews of destructive actions.

## JSON output shapes (parse these)

- `mailbox list` returns an array of mailbox objects; rely on `id`, `name`, `role`, `unreadEmails`, `totalEmails`.
- `mailbox get` returns a single mailbox object.
- `message list` returns `{ mailbox: { id, name, role }, messages: [...] }`.
  - If `--fields` is used, each message is a partial object with only those fields.
- `message get` returns a full message object; with body included, expect `textBody`/`htmlBody` parts plus `bodyValues` content.
- Mutation commands return `{ ok: true, action: "...", ... }` plus identifiers for auditing.

## Concepts to apply

- Use exactly one mailbox selector when required (`--id`, `--name`, `--role`, or the command-specific variants).
- `message list --unread` cannot be combined with `--position` or `--sort`.
- `message list --limit` max is 100; use `--position` to paginate or `--all` to fetch every page.
- For bulk actions (`move`, `archive`, `trash`, `delete`, `mark`), `--stdin` accepts newline-delimited IDs. Use `--force --no-input` for non-interactive trash/delete.
- `--body-type` implies body output (`text`, `html`, or `both`).
- Use `--fields` on `message list` to limit payload size when you only need a few columns.

Allowed fields for `--fields`: `id`, `receivedAt`, `from`, `subject`, `preview`, `hasAttachment`, `keywords`, `mailboxIds`, `threadId`, `flags`.

## Command patterns (JSON-only)

### Mailboxes

- List all mailboxes:
  - `fm mailbox list --json`
- Filter by role:
  - `fm mailbox list --role inbox --json`
- Get a mailbox by role, name, or id:
  - `fm mailbox get --role archive --json`
  - `fm mailbox get --name "Receipts" --json`
  - `fm mailbox get --id M123 --json`

### Message retrieval

- List messages in a mailbox:
  - `fm message list --mailbox-role inbox --limit 20 --json`
- List all messages in a mailbox:
  - `fm message list --mailbox-role inbox --all --json`
- List unread messages:
  - `fm message list --mailbox-role inbox --unread --limit 50 --json`
- List messages with limited fields:
  - `fm message list --mailbox-role inbox --fields id,receivedAt,from,subject,flags --json`
- Fetch a message with body text:
  - `fm message get E123 --body-type text --json`
- Fetch a message with both text and HTML:
  - `fm message get E123 --body-type both --json`

### Move / add / remove mailbox

- Move message(s):
  - `fm message move E123 --from-role inbox --to-role archive --json`
  - `fm message move E1 E2 --from-role inbox --to-role archive --json`
  - `printf "E1\nE2\n" | fm message move --stdin --from-role inbox --to-role archive --json`
- Add a mailbox tag:
  - `fm message add-mailbox E123 --mailbox-name "Receipts" --json`
- Remove a mailbox tag:
  - `fm message remove-mailbox E123 --mailbox-name "Receipts" --json`
- Preview changes:
  - `fm message move E123 --from-role inbox --to-role archive --dry-run --json`

### Archive / trash / delete

- Archive messages:
  - `fm message archive E1 E2 E3 --json`
- Archive without marking read:
  - `fm message archive E1 E2 --no-mark-read --json`
- Trash messages (force for non-interactive):
  - `fm message trash E1 E2 --force --no-input --json`
- Delete messages (force for non-interactive):
  - `fm message delete E1 E2 --force --no-input --json`
- Bulk trash from stdin:
  - `printf "E1\nE2\n" | fm message trash --stdin --force --no-input --json`

### Mark read/unread/flag/unflag

- Mark as read:
  - `fm message mark read E1 E2 --json`
- Mark as unread:
  - `fm message mark unread E1 --json`
- Flag and unflag:
  - `fm message mark flag E1 --json`
  - `fm message mark unflag E1 --json`

### Keywords

- Set a keyword:
  - `fm message keyword set E123 "$todo" --json`
- Remove a keyword:
  - `fm message keyword remove E123 "$todo" --json`

## Operational guidance

- Confirm mailbox selectors before destructive actions (trash/delete).
- Use `--dry-run` when you need a preview of the action.
- Return a concise user-facing summary derived from JSON output, without mentioning the CLI or flags.
