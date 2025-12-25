import type { Email } from "./shared.ts"
import { getClient } from "./shared.ts"

interface EmailGetResponse {
  accountId: string
  state: string
  list: Email[]
  notFound: string[]
}

export interface GetMessageOptions {
  includeBody?: boolean
  bodyType?: "text" | "html" | "both"
}

const HEADER_PROPERTIES = [
  "id",
  "blobId",
  "threadId",
  "mailboxIds",
  "keywords",
  "size",
  "receivedAt",
  "messageId",
  "inReplyTo",
  "references",
  "sender",
  "from",
  "to",
  "cc",
  "bcc",
  "replyTo",
  "subject",
  "sentAt",
  "hasAttachment",
  "preview",
]

const BODY_PROPERTIES = ["bodyStructure", "bodyValues", "textBody", "htmlBody", "attachments"]

export async function getMessage(
  emailId: string,
  options: GetMessageOptions = {},
): Promise<Email | null> {
  const { includeBody = false, bodyType = "both" } = options

  const client = getClient()
  const accountId = await client.getAccountId()

  const properties = [...HEADER_PROPERTIES]
  if (includeBody) {
    properties.push(...BODY_PROPERTIES)
  }

  const args: Record<string, unknown> = {
    accountId,
    ids: [emailId],
    properties,
  }

  if (includeBody) {
    args.fetchTextBodyValues = bodyType === "text" || bodyType === "both"
    args.fetchHTMLBodyValues = bodyType === "html" || bodyType === "both"
  }

  const response = await client.execute([
    {
      name: "Email/get",
      args,
      clientId: "get",
    },
  ])

  if (client.isError(response, "get")) {
    const error = client.getError(response, "get")
    throw new Error(`Failed to get email: ${error?.type} - ${error?.description}`)
  }

  const result = client.getResult<EmailGetResponse>(response, "get")
  const email = result?.list?.[0]

  if (!email && result?.notFound?.includes(emailId)) {
    return null
  }

  return email ?? null
}

export async function getMessages(
  emailIds: string[],
  options: GetMessageOptions = {},
): Promise<Email[]> {
  const { includeBody = false, bodyType = "both" } = options

  if (emailIds.length === 0) {
    return []
  }

  const client = getClient()
  const accountId = await client.getAccountId()

  const properties = [...HEADER_PROPERTIES]
  if (includeBody) {
    properties.push(...BODY_PROPERTIES)
  }

  const args: Record<string, unknown> = {
    accountId,
    ids: emailIds,
    properties,
  }

  if (includeBody) {
    args.fetchTextBodyValues = bodyType === "text" || bodyType === "both"
    args.fetchHTMLBodyValues = bodyType === "html" || bodyType === "both"
  }

  const response = await client.execute([
    {
      name: "Email/get",
      args,
      clientId: "get",
    },
  ])

  if (client.isError(response, "get")) {
    const error = client.getError(response, "get")
    throw new Error(`Failed to get emails: ${error?.type} - ${error?.description}`)
  }

  const result = client.getResult<EmailGetResponse>(response, "get")
  return result?.list ?? []
}
