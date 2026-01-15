import type { EmailMessage } from "./shared.ts"
import { getClient } from "./shared.ts"

interface EmailGetResponse {
  accountId: string
  state: string
  list: EmailMessage[]
  notFound: string[]
}

interface MessageQueryFilters {
  from?: string
  subject?: string
}

interface EmailQueryFilter {
  inMailbox: string
  from?: string
  subject?: string
  notKeyword?: string
}

export interface GetMessagesOptions {
  mailboxId: string
  limit?: number
  position?: number
  sort?: Array<{ property: string; isAscending: boolean }>
  filters?: MessageQueryFilters
}

const DEFAULT_EMAIL_PROPERTIES = [
  "id",
  "threadId",
  "mailboxIds",
  "keywords",
  "receivedAt",
  "from",
  "to",
  "subject",
  "preview",
  "hasAttachment",
]

function buildEmailQueryFilter(options: {
  mailboxId: string
  filters?: MessageQueryFilters
  unread?: boolean
}): EmailQueryFilter {
  const filter: EmailQueryFilter = { inMailbox: options.mailboxId }

  if (options.filters?.from) {
    filter.from = options.filters.from
  }

  if (options.filters?.subject) {
    filter.subject = options.filters.subject
  }

  if (options.unread) {
    filter.notKeyword = "$seen"
  }

  return filter
}

export async function getMessages(options: GetMessagesOptions): Promise<EmailMessage[]> {
  const { mailboxId, limit = 50, position = 0, sort, filters } = options

  const client = getClient()
  const accountId = await client.getAccountId()

  const response = await client.execute([
    {
      name: "Email/query",
      args: {
        accountId,
        filter: buildEmailQueryFilter({ mailboxId, filters }),
        sort: sort ?? [{ property: "receivedAt", isAscending: false }],
        position,
        limit,
      },
      clientId: "query",
    },
    {
      name: "Email/get",
      args: {
        accountId,
        "#ids": client.ref("query", "Email/query", "/ids"),
        properties: DEFAULT_EMAIL_PROPERTIES,
      },
      clientId: "get",
    },
  ])

  if (client.isError(response, "query")) {
    const error = client.getError(response, "query")
    throw new Error(`Failed to query emails: ${error?.type} - ${error?.description}`)
  }

  if (client.isError(response, "get")) {
    const error = client.getError(response, "get")
    throw new Error(`Failed to get emails: ${error?.type} - ${error?.description}`)
  }

  const result = client.getResult<EmailGetResponse>(response, "get")
  return result?.list ?? []
}

export async function getUnreadMessages(
  mailboxId: string,
  limit = 50,
  position = 0,
  filters?: MessageQueryFilters,
): Promise<EmailMessage[]> {
  const client = getClient()
  const accountId = await client.getAccountId()

  const response = await client.execute([
    {
      name: "Email/query",
      args: {
        accountId,
        filter: buildEmailQueryFilter({ mailboxId, filters, unread: true }),
        sort: [{ property: "receivedAt", isAscending: false }],
        limit,
        position,
      },
      clientId: "query",
    },
    {
      name: "Email/get",
      args: {
        accountId,
        "#ids": client.ref("query", "Email/query", "/ids"),
        properties: DEFAULT_EMAIL_PROPERTIES,
      },
      clientId: "get",
    },
  ])

  if (client.isError(response, "get")) {
    const error = client.getError(response, "get")
    throw new Error(`Failed to get unread emails: ${error?.type} - ${error?.description}`)
  }

  const result = client.getResult<EmailGetResponse>(response, "get")
  return result?.list ?? []
}
