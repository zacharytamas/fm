import { createInterface } from "node:readline"
import { cac } from "cac"
import type { EmailAddress, EmailMessage, GetMessageOptions, Mailbox } from "./tools/index.ts"
import {
  addToMailbox,
  archiveMessages,
  deleteMessage,
  deleteMessages,
  getMailboxById,
  getMailboxByName,
  getMailboxByRole,
  getMailboxes,
  getMessage,
  getMessages,
  getUnreadMessages,
  markAsFlagged,
  markAsUnread,
  markManyAsRead,
  moveMessage,
  moveMessages,
  removeFlag,
  removeFromMailbox,
  removeKeyword,
  setKeyword,
  trashMessages,
} from "./tools/index.ts"

const CLI_NAME = "fm"
const MAX_MESSAGE_LIST_LIMIT = 100
const DEFAULT_LIMIT = MAX_MESSAGE_LIST_LIMIT
const DEFAULT_POSITION = 0

const MESSAGE_LIST_FIELDS = [
  "id",
  "receivedAt",
  "from",
  "subject",
  "preview",
  "hasAttachment",
  "keywords",
  "mailboxIds",
  "threadId",
  "flags",
] as const

const MESSAGE_FIELDS_SET = new Set<string>(MESSAGE_LIST_FIELDS)

type MessageListField = (typeof MESSAGE_LIST_FIELDS)[number]

type OutputFormat = "json" | "plain" | "human"
type FormatFlag = "json" | "plain" | null

interface GlobalOptions {
  format: FormatFlag
  quiet: boolean
  verbose: boolean
  debug: boolean
  noColor: boolean
  noInput: boolean
}

type MailboxSelector =
  | { kind: "id"; value: string }
  | { kind: "name"; value: string }
  | { kind: "role"; value: string }

interface SortSpec {
  property: string
  isAscending: boolean
}

type BodyType = "text" | "html" | "both"

type Command =
  | { kind: "mailbox-list"; role?: string; name?: string }
  | { kind: "mailbox-get"; selector: MailboxSelector }
  | {
      kind: "message-list"
      mailbox: MailboxSelector
      from?: string
      subjectContains?: string
      limit: number
      position: number
      sort: SortSpec[]
      unread: boolean
      fields?: MessageListField[]
      all: boolean
    }
  | { kind: "message-get"; emailId: string; includeBody: boolean; bodyType: BodyType }
  | {
      kind: "message-move"
      emailIds: string[]
      from: MailboxSelector
      to: MailboxSelector
      dryRun: boolean
      stdin: boolean
    }
  | {
      kind: "message-add-mailbox"
      emailId: string
      mailbox: MailboxSelector
      dryRun: boolean
    }
  | {
      kind: "message-remove-mailbox"
      emailId: string
      mailbox: MailboxSelector
      dryRun: boolean
    }
  | {
      kind: "message-archive"
      emailIds: string[]
      markRead: boolean
      dryRun: boolean
      stdin: boolean
    }
  | {
      kind: "message-trash"
      emailIds: string[]
      markRead: boolean
      dryRun: boolean
      force: boolean
      stdin: boolean
    }
  | { kind: "message-delete"; emailIds: string[]; dryRun: boolean; force: boolean; stdin: boolean }
  | {
      kind: "message-mark"
      action: "read" | "unread" | "flag" | "unflag"
      emailIds: string[]
      dryRun: boolean
      stdin: boolean
    }
  | {
      kind: "message-keyword"
      action: "set" | "remove"
      emailId: string
      keyword: string
      dryRun: boolean
    }
  | { kind: "completion"; shell: "bash" | "zsh" | "fish" }

class CliError extends Error {
  exitCode: number

  constructor(message: string, exitCode: number) {
    super(message)
    this.exitCode = exitCode
  }
}

class UsageError extends CliError {
  constructor(message: string) {
    super(message, 2)
  }
}

class AuthError extends CliError {
  constructor(message: string) {
    super(message, 3)
  }
}

class NotFoundError extends CliError {
  constructor(message: string) {
    super(message, 4)
  }
}

class CancelledError extends CliError {
  constructor(message: string) {
    super(message, 1)
  }
}

const DEFAULT_GLOBAL_OPTIONS: GlobalOptions = {
  format: null,
  quiet: false,
  verbose: false,
  debug: false,
  noColor: false,
  noInput: false,
}

export function resolveOutputFormat(formatFlag: FormatFlag, isTty: boolean): OutputFormat {
  if (formatFlag === "json") return "json"
  if (formatFlag === "plain") return "plain"
  return isTty ? "human" : "plain"
}

function readStringOption(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readLastStringOption(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const entry = value[index]
      if (typeof entry === "string") {
        const trimmed = entry.trim()
        if (trimmed.length > 0) return trimmed
      }
    }
    return undefined
  }

  return readStringOption(value)
}

function readStringArrayOption(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  }

  const single = readStringOption(value)
  return single ? [single] : []
}

function readBooleanOption(value: unknown): boolean {
  return value === true
}

function readIntegerOption(value: unknown, fallback: number, name: string, min: number): number {
  if (value === undefined) return fallback

  if (typeof value === "string" && value.trim().length === 0) {
    throw new UsageError(`${name} requires a value`)
  }

  const numberValue = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numberValue) || !Number.isInteger(numberValue) || numberValue < min) {
    throw new UsageError(`${name} must be an integer >= ${min}`)
  }

  return numberValue
}

function parseGlobalOptions(options: Record<string, unknown>): GlobalOptions {
  const json = readBooleanOption(options.json)
  const plain = readBooleanOption(options.plain)

  if (json && plain) {
    throw new UsageError("--json and --plain cannot be used together")
  }

  const format: FormatFlag = json ? "json" : plain ? "plain" : null

  return {
    format,
    quiet: readBooleanOption(options.quiet),
    verbose: readBooleanOption(options.verbose),
    debug: readBooleanOption(options.debug),
    noColor: options.color === false,
    noInput: options.input === false,
  }
}

function normalizeArgs(args: unknown): string[] {
  if (Array.isArray(args)) {
    return args.filter((entry): entry is string => typeof entry === "string")
  }

  if (typeof args === "string") {
    return [args]
  }

  return []
}

function parseMailboxFilterOptions(options: Record<string, unknown>): {
  role?: string
  name?: string
} {
  const role = readLastStringOption(options.role)
  const name = readLastStringOption(options.name)

  if (role && name) {
    throw new UsageError("Use only one of --role or --name")
  }

  return { role: role ?? undefined, name: name ?? undefined }
}

function parseMailboxSelectorFromOptions(
  options: Record<string, unknown>,
  keys: { id: string; name: string; role: string },
  label: string,
): MailboxSelector {
  const id = readLastStringOption(options[keys.id])
  const name = readLastStringOption(options[keys.name])
  const role = readLastStringOption(options[keys.role])
  const selectors = [
    id ? { kind: "id", value: id } : null,
    name ? { kind: "name", value: name } : null,
    role ? { kind: "role", value: role } : null,
  ].filter((value): value is MailboxSelector => value !== null)

  if (selectors.length === 0) {
    throw new UsageError(`${label} selector is required`)
  }

  if (selectors.length > 1) {
    throw new UsageError(`Use only one ${label} selector option`)
  }

  const selector = selectors[0]
  if (!selector) {
    throw new UsageError(`${label} selector is required`)
  }

  return selector
}

function parseMessageFields(value?: string): { fields?: MessageListField[]; errors: string[] } {
  const errors: string[] = []
  if (!value) return { errors }

  const fields = value
    .split(",")
    .map((field) => field.trim())
    .filter((field) => field.length > 0)

  if (fields.length === 0) {
    errors.push("--fields requires at least one field")
    return { errors }
  }

  for (const field of fields) {
    if (!MESSAGE_FIELDS_SET.has(field)) {
      errors.push(`Unknown field: ${field}`)
    }
  }

  if (errors.length > 0) {
    return { errors }
  }

  return { fields: fields as MessageListField[], errors }
}

function parseMessageFieldsOption(value: unknown): MessageListField[] | undefined {
  const fieldsValue = readLastStringOption(value)
  if (!fieldsValue) return undefined

  const parsed = parseMessageFields(fieldsValue)
  if (parsed.errors.length > 0) {
    throw new UsageError(parsed.errors.join("; "))
  }

  return parsed.fields
}

function parseSort(values: string[]): { sort: SortSpec[]; errors: string[] } {
  const errors: string[] = []
  const sort: SortSpec[] = []

  const pieces = values.flatMap((value) =>
    value
      .split(",")
      .map((piece) => piece.trim())
      .filter((piece) => piece.length > 0),
  )

  for (const piece of pieces) {
    const [property, direction] = piece.split(":")
    if (!property || !direction) {
      errors.push(`Invalid sort: ${piece}`)
      continue
    }
    const dir = direction.toLowerCase()
    if (dir !== "asc" && dir !== "desc") {
      errors.push(`Sort direction must be asc or desc: ${piece}`)
      continue
    }
    sort.push({ property, isAscending: dir === "asc" })
  }

  return { sort, errors }
}

function parseSortOption(value: unknown): SortSpec[] {
  const sortValues = readStringArrayOption(value)
  if (sortValues.length === 0) return []

  const parsed = parseSort(sortValues)
  if (parsed.errors.length > 0) {
    throw new UsageError(parsed.errors.join("; "))
  }

  return parsed.sort
}

function formatMailboxSelector(selector: MailboxSelector): string {
  if (selector.kind === "id") return `id:${selector.value}`
  if (selector.kind === "name") return `name:${selector.value}`
  return `role:${selector.value}`
}

function formatAddress(addresses?: EmailAddress[] | null): string {
  if (!addresses || addresses.length === 0) return "-"
  return addresses
    .map((address) => (address.name ? `${address.name} <${address.email}>` : address.email))
    .join(", ")
}

function formatKeywords(keywords: Record<string, boolean>): string {
  const active = Object.keys(keywords).filter((key) => keywords[key])
  return active.length === 0 ? "-" : active.join(",")
}

function formatMailboxIds(mailboxIds: Record<string, boolean>): string {
  const active = Object.keys(mailboxIds).filter((key) => mailboxIds[key])
  return active.length === 0 ? "-" : active.join(",")
}

function getFlagLabels(keywords: Record<string, boolean>): string[] {
  const flags: string[] = []
  if (keywords.$seen) flags.push("seen")
  if (keywords.$flagged) flags.push("flagged")
  return flags
}

function formatFlags(keywords: Record<string, boolean>): string {
  const flags = getFlagLabels(keywords)
  return flags.length === 0 ? "-" : flags.join(",")
}

function formatMessageField(message: EmailMessage, field: MessageListField): string {
  switch (field) {
    case "id":
      return message.id
    case "receivedAt":
      return message.receivedAt
    case "from":
      return formatAddress(message.from)
    case "subject":
      return message.subject ?? "-"
    case "preview":
      return message.preview
    case "hasAttachment":
      return message.hasAttachment ? "true" : "false"
    case "keywords":
      return formatKeywords(message.keywords)
    case "mailboxIds":
      return formatMailboxIds(message.mailboxIds)
    case "threadId":
      return message.threadId
    case "flags":
      return formatFlags(message.keywords)
  }
}

function getMessageFieldValue(message: EmailMessage, field: MessageListField): unknown {
  switch (field) {
    case "id":
      return message.id
    case "receivedAt":
      return message.receivedAt
    case "from":
      return message.from
    case "subject":
      return message.subject
    case "preview":
      return message.preview
    case "hasAttachment":
      return message.hasAttachment
    case "keywords":
      return Object.keys(message.keywords).filter((key) => message.keywords[key])
    case "mailboxIds":
      return Object.keys(message.mailboxIds).filter((key) => message.mailboxIds[key])
    case "threadId":
      return message.threadId
    case "flags":
      return getFlagLabels(message.keywords)
  }
}

function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return ""
  const widths = headers.map((header, index) => {
    let width = header.length
    for (const row of rows) {
      const cell = row[index] ?? ""
      width = Math.max(width, cell.length)
    }
    return width
  })

  const formatRow = (row: string[]): string =>
    row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ")

  const lines = [formatRow(headers), formatRow(headers.map((header) => "-".repeat(header.length)))]
  for (const row of rows) {
    lines.push(formatRow(row))
  }

  return lines.join("\n")
}

export function formatMailboxListPlain(mailboxes: Mailbox[]): string {
  return mailboxes
    .map((mailbox) => {
      const role = mailbox.role ?? "-"
      return `${mailbox.id}\t${mailbox.name}\t${role}\t${mailbox.unreadEmails}/${mailbox.totalEmails}`
    })
    .join("\n")
}

function formatMailboxListHuman(mailboxes: Mailbox[]): string {
  const rows = mailboxes.map((mailbox) => [
    mailbox.id,
    mailbox.name,
    mailbox.role ?? "-",
    `${mailbox.unreadEmails}/${mailbox.totalEmails}`,
  ])
  return formatTable(["ID", "Name", "Role", "Unread/Total"], rows)
}

export function formatMessageListPlain(
  messages: EmailMessage[],
  fields?: MessageListField[],
): string {
  const selected = fields ?? ["id", "receivedAt", "from", "subject", "flags"]
  return messages
    .map((message) => selected.map((field) => formatMessageField(message, field)).join("\t"))
    .join("\n")
}

function formatMessageListHuman(messages: EmailMessage[], fields?: MessageListField[]): string {
  const selected = fields ?? ["id", "receivedAt", "from", "subject", "flags"]
  const headers = selected.map((field) => field)
  const rows = messages.map((message) =>
    selected.map((field) => formatMessageField(message, field)),
  )
  return formatTable(headers, rows)
}

function extractBody(message: EmailMessage, bodyType: "text" | "html"): string | null {
  const values = message.bodyValues
  const parts = bodyType === "text" ? message.textBody : message.htmlBody
  if (!values || !parts || parts.length === 0) return null

  for (const part of parts) {
    if (!part.partId) continue
    const value = values[part.partId]
    if (value?.value) return value.value
  }

  return null
}

function formatMessageSummary(message: EmailMessage): string[] {
  return [
    `id=${message.id}`,
    `subject=${message.subject ?? "-"}`,
    `from=${formatAddress(message.from)}`,
    `receivedAt=${message.receivedAt}`,
    `keywords=${formatKeywords(message.keywords)}`,
    `mailboxIds=${formatMailboxIds(message.mailboxIds)}`,
  ]
}

function formatMessageGetPlain(
  message: EmailMessage,
  includeBody: boolean,
  bodyType: BodyType,
): string {
  const lines = formatMessageSummary(message)

  if (!includeBody) {
    return lines.join("\n")
  }

  const sections: string[] = []
  const textBody = bodyType === "text" || bodyType === "both" ? extractBody(message, "text") : null
  const htmlBody = bodyType === "html" || bodyType === "both" ? extractBody(message, "html") : null

  if (bodyType === "both") {
    if (textBody) {
      sections.push("---text", textBody)
    }
    if (htmlBody) {
      sections.push("---html", htmlBody)
    }
  } else if (bodyType === "text") {
    if (textBody) sections.push("---", textBody)
  } else if (bodyType === "html") {
    if (htmlBody) sections.push("---", htmlBody)
  }

  return [...lines, ...sections].join("\n")
}

function formatMessageGetHuman(
  message: EmailMessage,
  includeBody: boolean,
  bodyType: BodyType,
): string {
  return formatMessageGetPlain(message, includeBody, bodyType)
}

function renderMessageJson(message: EmailMessage, fields?: MessageListField[]): unknown {
  if (!fields) return message
  const output: Record<string, unknown> = {}
  for (const field of fields) {
    output[field] = getMessageFieldValue(message, field)
  }
  return output
}

function getHelpText(path: string[]): string {
  const key = path.join(" ")

  const help: Record<string, string> = {
    "": `FastMail JMAP CLI\n\nUsage:\n  ${CLI_NAME} [global flags] <command> [args]\n\nCommands:\n  mailbox list\n  mailbox get\n  message list\n  message get\n  message move\n  message add-mailbox\n  message remove-mailbox\n  message archive\n  message trash\n  message delete\n  message mark read|unread|flag|unflag\n  message keyword set|remove\n  completion <bash|zsh|fish>\n  help [command]\n\nGlobal flags:\n  -h, --help        Show help\n  --version         Show version\n  --json            JSON output\n  --plain           Plain line output\n  -q, --quiet       Suppress success output\n  -v, --verbose     Verbose diagnostics\n  --debug           Debug errors\n  --no-color        Disable color\n  --no-input        Disable prompts\n\nEnvironment:\n  FASTMAIL_API_TOKEN  FastMail API token\n\nExamples:\n  ${CLI_NAME} mailbox list --plain\n  ${CLI_NAME} message list --mailbox-role inbox --limit 20\n  ${CLI_NAME} message get E123 --json\n  ${CLI_NAME} message archive E1 E2 --no-mark-read\n`,
    "mailbox list": `Usage:\n  ${CLI_NAME} mailbox list [--role <role> | --name <name>] [--plain|--json]\n\nOptions:\n  --role <role>   Filter by role (e.g. inbox, archive, trash)\n  --name <name>   Filter by mailbox name\n`,
    "mailbox get": `Usage:\n  ${CLI_NAME} mailbox get (--id <id> | --name <name> | --role <role>) [--plain|--json]\n`,
    "message list": `Usage:\n  ${CLI_NAME} message list (--mailbox-id <id> | --mailbox-name <name> | --mailbox-role <role>)\n    [--limit <n>] [--position <n>] [--sort <field:asc|desc>...] [--from <query>]\n    [--subject-contains <text>] [--unread] [--all]\n    [--fields <csv>] [--plain|--json]\n\nNotes:\n  --limit max is ${MAX_MESSAGE_LIST_LIMIT}.\n  --unread cannot be combined with --position or --sort.\n`,
    "message get": `Usage:\n  ${CLI_NAME} message get <email-id> [--body] [--body-type text|html|both] [--plain|--json]\n`,
    "message move": `Usage:\n  ${CLI_NAME} message move <email-id...>\n    (--from-id <id> | --from-name <name> | --from-role <role>)\n    (--to-id <id> | --to-name <name> | --to-role <role>)\n    [--stdin] [--dry-run]\n`,
    "message add-mailbox": `Usage:\n  ${CLI_NAME} message add-mailbox <email-id> (--mailbox-id <id> | --mailbox-name <name> | --mailbox-role <role>) [--dry-run]\n`,
    "message remove-mailbox": `Usage:\n  ${CLI_NAME} message remove-mailbox <email-id> (--mailbox-id <id> | --mailbox-name <name> | --mailbox-role <role>) [--dry-run]\n`,
    "message archive": `Usage:\n  ${CLI_NAME} message archive <email-id...> [--no-mark-read] [--stdin] [--dry-run]\n`,
    "message trash": `Usage:\n  ${CLI_NAME} message trash <email-id...> [--no-mark-read] [--stdin] [--force] [--dry-run]\n`,
    "message delete": `Usage:\n  ${CLI_NAME} message delete <email-id...> [--stdin] [--force] [--dry-run]\n`,
    "message mark": `Usage:\n  ${CLI_NAME} message mark read|unread|flag|unflag <email-id...> [--stdin] [--dry-run]\n`,
    "message keyword": `Usage:\n  ${CLI_NAME} message keyword set|remove <email-id> <keyword> [--dry-run]\n`,
    "completion bash": `Usage:\n  ${CLI_NAME} completion bash\n\nOutputs a bash completion script.\n`,
    "completion zsh": `Usage:\n  ${CLI_NAME} completion zsh\n\nOutputs a zsh completion script.\n`,
    "completion fish": `Usage:\n  ${CLI_NAME} completion fish\n\nOutputs a fish completion script.\n`,
  }

  return help[key] ?? help[""] ?? ""
}

function renderCompletionScript(shell: "bash" | "zsh" | "fish"): string {
  if (shell === "bash") {
    return `_${CLI_NAME}_completions() {\n  local cur prev\n  cur=\"\${COMP_WORDS[COMP_CWORD]}\"\n  prev=\"\${COMP_WORDS[COMP_CWORD-1]}\"\n  if [[ $COMP_CWORD -eq 1 ]]; then\n    COMPREPLY=( $(compgen -W \"mailbox message help completion\" -- \"$cur\") )\n    return\n  fi\n  if [[ \${COMP_WORDS[1]} == \"mailbox\" ]]; then\n    COMPREPLY=( $(compgen -W \"list get\" -- \"$cur\") )\n    return\n  fi\n  if [[ \${COMP_WORDS[1]} == \"message\" ]]; then\n    COMPREPLY=( $(compgen -W \"list get move add-mailbox remove-mailbox archive trash delete mark keyword\" -- \"$cur\") )\n    return\n  fi\n  if [[ \${COMP_WORDS[1]} == \"completion\" ]]; then\n    COMPREPLY=( $(compgen -W \"bash zsh fish\" -- \"$cur\") )\n  fi\n}\ncomplete -F _${CLI_NAME}_completions ${CLI_NAME}\n`
  }

  if (shell === "zsh") {
    return `#compdef ${CLI_NAME}\n\n_${CLI_NAME}() {\n  local -a commands\n  commands=(\n    'mailbox:Mailbox operations'\n    'message:Message operations'\n    'help:Show help'\n    'completion:Generate completions'\n  )\n  _describe 'command' commands\n}\n\ncompdef _${CLI_NAME} ${CLI_NAME}\n`
  }

  return `complete -c ${CLI_NAME} -f -a \"mailbox message help completion\"\ncomplete -c ${CLI_NAME} -n \"__fish_seen_subcommand_from mailbox\" -f -a \"list get\"\ncomplete -c ${CLI_NAME} -n \"__fish_seen_subcommand_from message\" -f -a \"list get move add-mailbox remove-mailbox archive trash delete mark keyword\"\ncomplete -c ${CLI_NAME} -n \"__fish_seen_subcommand_from completion\" -f -a \"bash zsh fish\"\n`
}

async function getVersion(): Promise<string> {
  let cached = (getVersion as { cached?: string }).cached
  if (cached) return cached

  try {
    const pkgUrl = new URL("../package.json", import.meta.url)
    const pkg = await Bun.file(pkgUrl).json()
    if (pkg && typeof pkg === "object" && "version" in pkg && typeof pkg.version === "string") {
      cached = pkg.version
    } else {
      cached = "unknown"
    }
  } catch {
    cached = "unknown"
  }

  ;(getVersion as { cached?: string }).cached = cached
  return cached ?? "unknown"
}

function isAuthErrorMessage(message: string): boolean {
  const lowered = message.toLowerCase()
  if (lowered.includes("fastmail_api_token")) return true
  if (lowered.includes("unauthorized") || lowered.includes("forbidden")) return true
  if (lowered.includes("jmap") && (lowered.includes(" 401 ") || lowered.includes(" 403 ")))
    return true
  if (lowered.includes("jmap session") && (lowered.includes("401") || lowered.includes("403")))
    return true
  return false
}

function ensureAuth(): void {
  if (!Bun.env.FASTMAIL_API_TOKEN) {
    throw new AuthError("FASTMAIL_API_TOKEN environment variable is required")
  }
}

async function promptConfirm(promptText: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  const answer = await new Promise<string>((resolve) => {
    rl.question(promptText, (response) => resolve(response))
  })
  rl.close()

  const normalized = answer.trim().toLowerCase()
  return normalized === "y" || normalized === "yes"
}

async function collectEmailIds(ids: string[], stdin: boolean): Promise<string[]> {
  const collected = [...ids]
  if (stdin) {
    const input = await Bun.stdin.text()
    const extra = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    collected.push(...extra)
  }

  const unique = new Set<string>()
  const deduped: string[] = []
  for (const id of collected) {
    if (unique.has(id)) continue
    unique.add(id)
    deduped.push(id)
  }

  return deduped
}

async function resolveMailbox(selector: MailboxSelector): Promise<Mailbox | null> {
  if (selector.kind === "id") return getMailboxById(selector.value)
  if (selector.kind === "name") return getMailboxByName(selector.value)
  return getMailboxByRole(selector.value)
}

function emitOutput(
  output: OutputFormat,
  quiet: boolean,
  payload: { json: unknown; plain?: string; human?: string },
): void {
  if (quiet) return

  if (output === "json") {
    console.log(JSON.stringify(payload.json, null, 2))
    return
  }

  if (output === "plain") {
    if (payload.plain) console.log(payload.plain)
    return
  }

  const text = payload.human ?? payload.plain
  if (text) console.log(text)
}

function emitError(message: string): void {
  console.error(message)
}

function logVerbose(enabled: boolean, message: string): void {
  if (enabled) {
    console.error(message)
  }
}

async function requireConfirmation(options: {
  action: string
  count: number
  force: boolean
  noInput: boolean
  stdinIsTty: boolean
  dryRun: boolean
}): Promise<void> {
  if (options.dryRun || options.force) return

  if (!options.stdinIsTty || options.noInput) {
    throw new UsageError(
      `${options.action} requires confirmation; use --force or run interactively`,
    )
  }

  const ok = await promptConfirm(
    `Confirm ${options.action} for ${options.count} message(s)? [y/N] `,
  )
  if (!ok) {
    throw new CancelledError("Cancelled")
  }
}

function handleCliError(error: unknown, global: GlobalOptions): number {
  if (error instanceof CliError) {
    emitError(error.message)
    return error.exitCode
  }

  if (error instanceof Error && error.name === "CACError") {
    emitError(error.message)
    return 2
  }

  if (error instanceof Error) {
    if (isAuthErrorMessage(error.message)) {
      emitError(error.message)
      return 3
    }

    emitError(error.message)
    if (global.debug && error.stack) {
      emitError(error.stack)
    }
    return 1
  }

  emitError("Unknown error")
  return 1
}

async function executeCommand(
  command: Command,
  global: GlobalOptions,
  io: { stdoutIsTty: boolean; stdinIsTty: boolean },
): Promise<number> {
  const outputFormat = resolveOutputFormat(global.format, io.stdoutIsTty)
  const quiet = global.quiet
  const verbose = global.verbose || global.debug

  try {
    if (command.kind !== "completion") {
      ensureAuth()
    }

    switch (command.kind) {
      case "completion": {
        emitOutput(outputFormat, quiet, {
          json: { shell: command.shell, ok: true },
          plain: renderCompletionScript(command.shell),
          human: renderCompletionScript(command.shell),
        })
        return 0
      }
      case "mailbox-list": {
        const mailboxes = await getMailboxes()
        const { role, name } = command
        const filtered = mailboxes.filter((mailbox) => {
          if (role && mailbox.role !== role) return false
          if (name && mailbox.name !== name) return false
          return true
        })

        emitOutput(outputFormat, quiet, {
          json: filtered,
          plain: formatMailboxListPlain(filtered),
          human: formatMailboxListHuman(filtered),
        })
        return 0
      }
      case "mailbox-get": {
        const mailbox = await resolveMailbox(command.selector)
        if (!mailbox) {
          throw new NotFoundError(`Mailbox not found (${formatMailboxSelector(command.selector)})`)
        }

        emitOutput(outputFormat, quiet, {
          json: mailbox,
          plain: formatMailboxListPlain([mailbox]),
          human: formatMailboxListHuman([mailbox]),
        })
        return 0
      }
      case "message-list": {
        const mailbox = await resolveMailbox(command.mailbox)
        if (!mailbox) {
          throw new NotFoundError(`Mailbox not found (${formatMailboxSelector(command.mailbox)})`)
        }

        logVerbose(verbose, `Using mailbox ${mailbox.name} (${mailbox.id})`)

        const filters =
          command.from || command.subjectContains
            ? { from: command.from, subject: command.subjectContains }
            : undefined

        const fetchPage = async (position: number): Promise<EmailMessage[]> => {
          if (command.unread) {
            return getUnreadMessages(mailbox.id, command.limit, position, filters)
          }

          return getMessages({
            mailboxId: mailbox.id,
            limit: command.limit,
            position,
            sort:
              command.sort.length > 0
                ? command.sort
                : [{ property: "receivedAt", isAscending: false }],
            filters,
          })
        }

        const messages: EmailMessage[] = []
        if (command.all) {
          let position = command.position
          while (true) {
            const page = await fetchPage(position)
            if (page.length === 0) break
            messages.push(...page)
            if (page.length < command.limit) break
            position += page.length
          }
        } else {
          messages.push(...(await fetchPage(command.position)))
        }

        const fields = command.fields
        const jsonMessages = messages.map((message) => renderMessageJson(message, fields))

        emitOutput(outputFormat, quiet, {
          json: {
            mailbox: { id: mailbox.id, name: mailbox.name, role: mailbox.role },
            messages: jsonMessages,
          },
          plain: formatMessageListPlain(messages, fields),
          human: formatMessageListHuman(messages, fields),
        })
        return 0
      }
      case "message-get": {
        const options: GetMessageOptions = {
          includeBody: command.includeBody,
          bodyType: command.bodyType,
        }
        const message = await getMessage(command.emailId, options)
        if (!message) {
          throw new NotFoundError(`Email not found (${command.emailId})`)
        }

        emitOutput(outputFormat, quiet, {
          json: message,
          plain: formatMessageGetPlain(message, command.includeBody, command.bodyType),
          human: formatMessageGetHuman(message, command.includeBody, command.bodyType),
        })
        return 0
      }
      case "message-move": {
        const ids = await collectEmailIds(command.emailIds, command.stdin)
        if (ids.length === 0) {
          throw new UsageError("No email ids provided")
        }

        const firstId = ids[0]
        if (!firstId) {
          throw new UsageError("No email ids provided")
        }

        const fromMailbox = await resolveMailbox(command.from)
        if (!fromMailbox) {
          throw new NotFoundError(`Mailbox not found (${formatMailboxSelector(command.from)})`)
        }
        const toMailbox = await resolveMailbox(command.to)
        if (!toMailbox) {
          throw new NotFoundError(`Mailbox not found (${formatMailboxSelector(command.to)})`)
        }

        if (!command.dryRun) {
          if (ids.length === 1) {
            await moveMessage(firstId, fromMailbox.id, toMailbox.id)
          } else {
            await moveMessages(ids, fromMailbox.id, toMailbox.id)
          }
        }

        const jsonPayload: Record<string, unknown> = {
          ok: true,
          action: "move",
          dryRun: command.dryRun,
          emailIds: ids,
          fromMailboxId: fromMailbox.id,
          toMailboxId: toMailbox.id,
        }

        if (ids.length === 1) {
          jsonPayload.emailId = firstId
        }

        emitOutput(outputFormat, quiet, {
          json: jsonPayload,
          plain: `${command.dryRun ? "dry-run\t" : ""}move\t${ids.join(",")}\t${fromMailbox.id}\t${toMailbox.id}`,
          human:
            ids.length === 1
              ? `${command.dryRun ? "Dry run: " : ""}Moved ${firstId} from ${fromMailbox.name} to ${toMailbox.name}`
              : `${command.dryRun ? "Dry run: " : ""}Moved ${ids.length} message(s) from ${fromMailbox.name} to ${toMailbox.name}`,
        })
        return 0
      }
      case "message-add-mailbox": {
        const mailbox = await resolveMailbox(command.mailbox)
        if (!mailbox) {
          throw new NotFoundError(`Mailbox not found (${formatMailboxSelector(command.mailbox)})`)
        }

        if (!command.dryRun) {
          await addToMailbox(command.emailId, mailbox.id)
        }

        emitOutput(outputFormat, quiet, {
          json: {
            ok: true,
            action: "add-mailbox",
            dryRun: command.dryRun,
            emailId: command.emailId,
            mailboxId: mailbox.id,
          },
          plain: `${command.dryRun ? "dry-run\t" : ""}add-mailbox\t${command.emailId}\t${mailbox.id}`,
          human: `${command.dryRun ? "Dry run: " : ""}Added ${command.emailId} to ${mailbox.name}`,
        })
        return 0
      }
      case "message-remove-mailbox": {
        const mailbox = await resolveMailbox(command.mailbox)
        if (!mailbox) {
          throw new NotFoundError(`Mailbox not found (${formatMailboxSelector(command.mailbox)})`)
        }

        if (!command.dryRun) {
          await removeFromMailbox(command.emailId, mailbox.id)
        }

        emitOutput(outputFormat, quiet, {
          json: {
            ok: true,
            action: "remove-mailbox",
            dryRun: command.dryRun,
            emailId: command.emailId,
            mailboxId: mailbox.id,
          },
          plain: `${command.dryRun ? "dry-run\t" : ""}remove-mailbox\t${command.emailId}\t${mailbox.id}`,
          human: `${command.dryRun ? "Dry run: " : ""}Removed ${command.emailId} from ${mailbox.name}`,
        })
        return 0
      }
      case "message-archive": {
        const ids = await collectEmailIds(command.emailIds, command.stdin)
        if (ids.length === 0) {
          throw new UsageError("No email ids provided")
        }

        if (!command.dryRun) {
          await archiveMessages(ids, command.markRead)
        }

        emitOutput(outputFormat, quiet, {
          json: {
            ok: true,
            action: "archive",
            dryRun: command.dryRun,
            emailIds: ids,
            markRead: command.markRead,
          },
          plain: `${command.dryRun ? "dry-run\t" : ""}archive\t${ids.join(",")}`,
          human: `${command.dryRun ? "Dry run: " : ""}Archived ${ids.length} message(s)`,
        })
        return 0
      }
      case "message-trash": {
        const ids = await collectEmailIds(command.emailIds, command.stdin)
        if (ids.length === 0) {
          throw new UsageError("No email ids provided")
        }

        await requireConfirmation({
          action: "trash",
          count: ids.length,
          force: command.force,
          noInput: global.noInput,
          stdinIsTty: io.stdinIsTty,
          dryRun: command.dryRun,
        })

        if (!command.dryRun) {
          await trashMessages(ids, command.markRead)
        }

        emitOutput(outputFormat, quiet, {
          json: {
            ok: true,
            action: "trash",
            dryRun: command.dryRun,
            emailIds: ids,
            markRead: command.markRead,
          },
          plain: `${command.dryRun ? "dry-run\t" : ""}trash\t${ids.join(",")}`,
          human: `${command.dryRun ? "Dry run: " : ""}Trashed ${ids.length} message(s)`,
        })
        return 0
      }
      case "message-delete": {
        const ids = await collectEmailIds(command.emailIds, command.stdin)
        if (ids.length === 0) {
          throw new UsageError("No email ids provided")
        }

        await requireConfirmation({
          action: "delete",
          count: ids.length,
          force: command.force,
          noInput: global.noInput,
          stdinIsTty: io.stdinIsTty,
          dryRun: command.dryRun,
        })

        if (!command.dryRun) {
          if (ids.length === 1) {
            const firstId = ids[0]
            if (!firstId) {
              throw new UsageError("No email ids provided")
            }
            await deleteMessage(firstId)
          } else {
            await deleteMessages(ids)
          }
        }

        emitOutput(outputFormat, quiet, {
          json: { ok: true, action: "delete", dryRun: command.dryRun, emailIds: ids },
          plain: `${command.dryRun ? "dry-run\t" : ""}delete\t${ids.join(",")}`,
          human: `${command.dryRun ? "Dry run: " : ""}Deleted ${ids.length} message(s)`,
        })
        return 0
      }
      case "message-mark": {
        const ids = await collectEmailIds(command.emailIds, command.stdin)
        if (ids.length === 0) {
          throw new UsageError("No email ids provided")
        }

        if (!command.dryRun) {
          if (command.action === "read") {
            await markManyAsRead(ids)
          } else {
            for (const id of ids) {
              if (command.action === "unread") {
                await markAsUnread(id)
              } else if (command.action === "flag") {
                await markAsFlagged(id)
              } else {
                await removeFlag(id)
              }
            }
          }
        }

        emitOutput(outputFormat, quiet, {
          json: {
            ok: true,
            action: `mark-${command.action}`,
            dryRun: command.dryRun,
            emailIds: ids,
          },
          plain: `${command.dryRun ? "dry-run\t" : ""}mark-${command.action}\t${ids.join(",")}`,
          human: `${command.dryRun ? "Dry run: " : ""}Marked ${ids.length} message(s) as ${command.action}`,
        })
        return 0
      }
      case "message-keyword": {
        if (!command.dryRun) {
          if (command.action === "set") {
            await setKeyword(command.emailId, command.keyword)
          } else {
            await removeKeyword(command.emailId, command.keyword)
          }
        }

        emitOutput(outputFormat, quiet, {
          json: {
            ok: true,
            action: `keyword-${command.action}`,
            dryRun: command.dryRun,
            emailId: command.emailId,
            keyword: command.keyword,
          },
          plain: `${command.dryRun ? "dry-run\t" : ""}keyword-${command.action}\t${command.emailId}\t${command.keyword}`,
          human: `${command.dryRun ? "Dry run: " : ""}${
            command.action === "set" ? "Set" : "Removed"
          } keyword ${command.keyword} on ${command.emailId}`,
        })
        return 0
      }
      default:
        throw new UsageError("Unknown command")
    }
  } catch (error) {
    return handleCliError(error, global)
  }
}

function buildMailboxCommand(
  action: string,
  args: string[],
  options: Record<string, unknown>,
): Command {
  if (action === "list") {
    if (args.length > 0) {
      throw new UsageError("mailbox list does not accept positional arguments")
    }
    const filter = parseMailboxFilterOptions(options)
    return { kind: "mailbox-list", role: filter.role, name: filter.name }
  }

  if (action === "get") {
    if (args.length > 0) {
      throw new UsageError("mailbox get does not accept positional arguments")
    }
    const selector = parseMailboxSelectorFromOptions(
      options,
      { id: "id", name: "name", role: "role" },
      "mailbox",
    )
    return { kind: "mailbox-get", selector }
  }

  throw new UsageError(`Unknown mailbox subcommand: ${action}`)
}

function buildMessageCommand(
  action: string,
  args: string[],
  options: Record<string, unknown>,
): Command {
  if (action === "list") {
    if (args.length > 0) {
      throw new UsageError("message list does not accept positional arguments")
    }

    const selector = parseMailboxSelectorFromOptions(
      options,
      { id: "mailboxId", name: "mailboxName", role: "mailboxRole" },
      "mailbox",
    )

    const limit = readIntegerOption(options.limit, DEFAULT_LIMIT, "--limit", 1)
    if (limit > MAX_MESSAGE_LIST_LIMIT) {
      throw new UsageError(`--limit must be <= ${MAX_MESSAGE_LIST_LIMIT}`)
    }
    const position = readIntegerOption(options.position, DEFAULT_POSITION, "--position", 0)
    const sortValues = readStringArrayOption(options.sort)
    const sort = parseSortOption(sortValues)
    const fields = parseMessageFieldsOption(options.fields)
    const unread = readBooleanOption(options.unread)
    const all = readBooleanOption(options.all)
    const from = readLastStringOption(options.from)
    const subjectContains = readLastStringOption(options.subjectContains)

    if (unread && (options.position !== undefined || sortValues.length > 0)) {
      throw new UsageError("--unread cannot be combined with --position or --sort")
    }

    return {
      kind: "message-list",
      mailbox: selector,
      from,
      subjectContains,
      limit,
      position,
      sort,
      unread,
      fields,
      all,
    }
  }

  if (action === "get") {
    const [emailId, ...rest] = args
    if (!emailId) {
      throw new UsageError("message get requires an email id")
    }
    if (rest.length > 0) {
      throw new UsageError("message get accepts only one email id")
    }

    const bodyTypeValue = readLastStringOption(options.bodyType)
    const bodyType = bodyTypeValue ? bodyTypeValue.toLowerCase() : "both"

    if (bodyType !== "text" && bodyType !== "html" && bodyType !== "both") {
      throw new UsageError("--body-type must be one of text, html, or both")
    }

    return {
      kind: "message-get",
      emailId,
      includeBody: readBooleanOption(options.body) || Boolean(bodyTypeValue),
      bodyType: bodyType as BodyType,
    }
  }

  if (action === "move") {
    const stdin = readBooleanOption(options.stdin)
    if (args.length === 0 && !stdin) {
      throw new UsageError("message move requires at least one email id or --stdin")
    }

    const from = parseMailboxSelectorFromOptions(
      options,
      { id: "fromId", name: "fromName", role: "fromRole" },
      "from mailbox",
    )
    const to = parseMailboxSelectorFromOptions(
      options,
      { id: "toId", name: "toName", role: "toRole" },
      "to mailbox",
    )

    return {
      kind: "message-move",
      emailIds: args,
      from,
      to,
      dryRun: readBooleanOption(options.dryRun),
      stdin,
    }
  }

  if (action === "add-mailbox") {
    const [emailId, ...rest] = args
    if (!emailId) {
      throw new UsageError("message add-mailbox requires an email id")
    }
    if (rest.length > 0) {
      throw new UsageError("message add-mailbox accepts only one email id")
    }

    const mailbox = parseMailboxSelectorFromOptions(
      options,
      { id: "mailboxId", name: "mailboxName", role: "mailboxRole" },
      "mailbox",
    )

    return {
      kind: "message-add-mailbox",
      emailId,
      mailbox,
      dryRun: readBooleanOption(options.dryRun),
    }
  }

  if (action === "remove-mailbox") {
    const [emailId, ...rest] = args
    if (!emailId) {
      throw new UsageError("message remove-mailbox requires an email id")
    }
    if (rest.length > 0) {
      throw new UsageError("message remove-mailbox accepts only one email id")
    }

    const mailbox = parseMailboxSelectorFromOptions(
      options,
      { id: "mailboxId", name: "mailboxName", role: "mailboxRole" },
      "mailbox",
    )

    return {
      kind: "message-remove-mailbox",
      emailId,
      mailbox,
      dryRun: readBooleanOption(options.dryRun),
    }
  }

  if (action === "archive") {
    const stdin = readBooleanOption(options.stdin)
    if (args.length === 0 && !stdin) {
      throw new UsageError("message archive requires at least one email id or --stdin")
    }

    return {
      kind: "message-archive",
      emailIds: args,
      markRead: options.markRead !== false,
      dryRun: readBooleanOption(options.dryRun),
      stdin,
    }
  }

  if (action === "trash") {
    const stdin = readBooleanOption(options.stdin)
    if (args.length === 0 && !stdin) {
      throw new UsageError("message trash requires at least one email id or --stdin")
    }

    return {
      kind: "message-trash",
      emailIds: args,
      markRead: options.markRead !== false,
      dryRun: readBooleanOption(options.dryRun),
      force: readBooleanOption(options.force),
      stdin,
    }
  }

  if (action === "delete") {
    const stdin = readBooleanOption(options.stdin)
    if (args.length === 0 && !stdin) {
      throw new UsageError("message delete requires at least one email id or --stdin")
    }

    return {
      kind: "message-delete",
      emailIds: args,
      dryRun: readBooleanOption(options.dryRun),
      force: readBooleanOption(options.force),
      stdin,
    }
  }

  if (action === "mark") {
    const actionName = args[0]
    const ids = args.slice(1)
    if (!actionName || !["read", "unread", "flag", "unflag"].includes(actionName)) {
      throw new UsageError("message mark requires read, unread, flag, or unflag")
    }

    const stdin = readBooleanOption(options.stdin)
    if (ids.length === 0 && !stdin) {
      throw new UsageError("message mark requires at least one email id or --stdin")
    }

    return {
      kind: "message-mark",
      action: actionName as "read" | "unread" | "flag" | "unflag",
      emailIds: ids,
      dryRun: readBooleanOption(options.dryRun),
      stdin,
    }
  }

  if (action === "keyword") {
    const actionName = args[0]
    const emailId = args[1]
    const keyword = args[2]

    if (!actionName || !["set", "remove"].includes(actionName)) {
      throw new UsageError("message keyword requires set or remove")
    }

    if (!emailId || !keyword) {
      throw new UsageError("message keyword requires <email-id> <keyword>")
    }

    if (args.length > 3) {
      throw new UsageError("message keyword accepts only one email id and keyword")
    }

    return {
      kind: "message-keyword",
      action: actionName as "set" | "remove",
      emailId,
      keyword,
      dryRun: readBooleanOption(options.dryRun),
    }
  }

  throw new UsageError(`Unknown message subcommand: ${action}`)
}

export async function runCli(argv: string[]): Promise<number> {
  const stdoutIsTty = process.stdout.isTTY === true
  const stdinIsTty = process.stdin.isTTY === true
  const cli = cac(CLI_NAME)

  cli
    .option("--json", "JSON output")
    .option("--plain", "Plain line output")
    .option("-q, --quiet", "Suppress success output")
    .option("-v, --verbose", "Verbose diagnostics")
    .option("--debug", "Debug errors")
    .option("--no-color", "Disable color")
    .option("--no-input", "Disable prompts")

  cli
    .command("mailbox <action> [...args]", "Mailbox operations")
    .option("--role <role>", "Filter or select by role")
    .option("--name <name>", "Filter or select by name")
    .option("--id <id>", "Select by id")
    .action(async (action: string, args: unknown, options: Record<string, unknown>) => {
      const global = parseGlobalOptions(options)
      const command = buildMailboxCommand(action, normalizeArgs(args), options)
      return executeCommand(command, global, { stdoutIsTty, stdinIsTty })
    })

  cli
    .command("message <action> [...args]", "Message operations")
    .option("--mailbox-id <id>", "Mailbox id")
    .option("--mailbox-name <name>", "Mailbox name")
    .option("--mailbox-role <role>", "Mailbox role")
    .option("--from-id <id>", "Source mailbox id")
    .option("--from-name <name>", "Source mailbox name")
    .option("--from-role <role>", "Source mailbox role")
    .option("--to-id <id>", "Destination mailbox id")
    .option("--to-name <name>", "Destination mailbox name")
    .option("--to-role <role>", "Destination mailbox role")
    .option("--limit <n>", "Max messages to return")
    .option("--position <n>", "Start position")
    .option("--sort <field:asc|desc>", "Sort (repeat or comma-separated)")
    .option("--from <query>", "Filter by From address")
    .option("--subject-contains <text>", "Filter by subject text")
    .option("--fields <csv>", "Fields to include")
    .option("--unread", "Only unread messages")
    .option("--all", "Fetch all messages (paged)")
    .option("--body", "Include body content")
    .option("--body-type <text|html|both>", "Body type to fetch")
    .option("-n, --dry-run", "Preview changes")
    .option("-f, --force", "Skip confirmation")
    .option("--no-mark-read", "Do not mark as read")
    .option("--stdin", "Read ids from stdin")
    .action(async (action: string, args: unknown, options: Record<string, unknown>) => {
      const global = parseGlobalOptions(options)
      const command = buildMessageCommand(action, normalizeArgs(args), options)
      return executeCommand(command, global, { stdoutIsTty, stdinIsTty })
    })

  cli
    .command("completion <shell>", "Generate shell completions")
    .action(async (shell: string, options: Record<string, unknown>) => {
      if (shell !== "bash" && shell !== "zsh" && shell !== "fish") {
        throw new UsageError("completion requires bash, zsh, or fish")
      }
      const global = parseGlobalOptions(options)
      return executeCommand({ kind: "completion", shell }, global, { stdoutIsTty, stdinIsTty })
    })

  cli.command("help [...path]", "Show help").action((path: unknown) => {
    const segments = normalizeArgs(path)
    console.log(getHelpText(segments))
    return 0
  })

  cli.help()
  cli.version(await getVersion(), "--version")

  const rawArgv = ["node", CLI_NAME, ...argv]
  cli.parse(rawArgv, { run: false })

  if (cli.options.help || cli.options.version) {
    return 0
  }

  if (!cli.matchedCommand && cli.args.length === 0) {
    cli.outputHelp()
    return 0
  }

  if (!cli.matchedCommand && cli.args.length > 0) {
    emitError(`Unknown command: ${cli.args[0]}`)
    emitError(`Run "${CLI_NAME} --help" for usage.`)
    return 2
  }

  let globalOptions = DEFAULT_GLOBAL_OPTIONS
  try {
    globalOptions = parseGlobalOptions(cli.options as Record<string, unknown>)
  } catch (error) {
    return handleCliError(error, DEFAULT_GLOBAL_OPTIONS)
  }

  try {
    const result = cli.runMatchedCommand()
    const resolved = result instanceof Promise ? await result : result
    if (typeof resolved === "number") {
      return resolved
    }
    return 0
  } catch (error) {
    return handleCliError(error, globalOptions)
  }
}
