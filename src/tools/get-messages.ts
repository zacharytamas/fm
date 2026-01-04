import type { EmailMessage } from "./shared.ts"
import { getClient } from "./shared.ts"

interface EmailGetResponse {
  accountId: string
  state: string
  list: EmailMessage[]
  notFound: string[]
}

export interface GetMessagesOptions {
  mailboxId: string
  limit?: number
  position?: number
  sort?: Array<{ property: string; isAscending: boolean }>
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

export async function getMessages(options: GetMessagesOptions): Promise<EmailMessage[]> {
  const { mailboxId, limit = 50, position = 0, sort } = options

  const client = getClient()
  const accountId = await client.getAccountId()

  const response = await client.execute([
    {
      name: "Email/query",
      args: {
        accountId,
        filter: { inMailbox: mailboxId },
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
): Promise<EmailMessage[]> {
  const client = getClient()
  const accountId = await client.getAccountId()

  const response = await client.execute([
    {
      name: "Email/query",
      args: {
        accountId,
        filter: {
          inMailbox: mailboxId,
          notKeyword: "$seen",
        },
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
