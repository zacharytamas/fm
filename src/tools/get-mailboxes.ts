import type { Mailbox } from "./shared.ts"
import { getClient } from "./shared.ts"

interface MailboxGetResponse {
  accountId: string
  state: string
  list: Mailbox[]
  notFound: string[]
}

export async function getMailboxes(): Promise<Mailbox[]> {
  const client = getClient()
  const accountId = await client.getAccountId()

  const response = await client.execute([
    {
      name: "Mailbox/get",
      args: {
        accountId,
        ids: null,
      },
      clientId: "getMailboxes",
    },
  ])

  if (client.isError(response, "getMailboxes")) {
    const error = client.getError(response, "getMailboxes")
    throw new Error(`Failed to get mailboxes: ${error?.type} - ${error?.description}`)
  }

  const result = client.getResult<MailboxGetResponse>(response, "getMailboxes")
  return result?.list ?? []
}

export async function getMailboxByRole(role: string): Promise<Mailbox | null> {
  const mailboxes = await getMailboxes()
  return mailboxes.find((m) => m.role === role) ?? null
}

export async function getMailboxById(id: string): Promise<Mailbox | null> {
  const mailboxes = await getMailboxes()
  return mailboxes.find((m) => m.id === id) ?? null
}

export async function getMailboxByName(name: string): Promise<Mailbox | null> {
  const mailboxes = await getMailboxes()
  return mailboxes.find((m) => m.name === name) ?? null
}
