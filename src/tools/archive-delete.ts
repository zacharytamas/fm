import { getMailboxByRole } from "./get-mailboxes.ts"
import { getClient } from "./shared.ts"

interface EmailSetResponse {
  accountId: string
  oldState: string | null
  newState: string
  updated?: Record<string, unknown> | null
  destroyed?: string[] | null
  notUpdated?: Record<string, { type: string; description?: string }> | null
  notDestroyed?: Record<string, { type: string; description?: string }> | null
}

export async function archiveMessages(emailIds: string[]): Promise<void> {
  if (emailIds.length === 0) return

  const archiveMailbox = await getMailboxByRole("archive")
  if (!archiveMailbox) {
    throw new Error("Archive mailbox not found")
  }

  const client = getClient()
  const accountId = await client.getAccountId()

  const update = Object.fromEntries(
    emailIds.map((emailId) => [emailId, { mailboxIds: { [archiveMailbox.id]: true } }]),
  )

  const response = await client.execute([
    { name: "Email/set", args: { accountId, update }, clientId: "archive" },
  ])

  if (client.isError(response, "archive")) {
    const error = client.getError(response, "archive")
    throw new Error(`Failed to archive emails: ${error?.type} - ${error?.description}`)
  }

  const result = client.getResult<EmailSetResponse>(response, "archive")
  if (result?.notUpdated && Object.keys(result.notUpdated).length > 0) {
    const failedIds = Object.keys(result.notUpdated)
    throw new Error(`Failed to archive ${failedIds.length} emails`)
  }
}

export async function trashMessage(emailId: string): Promise<void> {
  const trashMailbox = await getMailboxByRole("trash")
  if (!trashMailbox) {
    throw new Error("Trash mailbox not found")
  }

  const client = getClient()
  const accountId = await client.getAccountId()

  const response = await client.execute([
    {
      name: "Email/set",
      args: {
        accountId,
        update: {
          [emailId]: {
            mailboxIds: { [trashMailbox.id]: true },
          },
        },
      },
      clientId: "trash",
    },
  ])

  if (client.isError(response, "trash")) {
    const error = client.getError(response, "trash")
    throw new Error(`Failed to trash email: ${error?.type} - ${error?.description}`)
  }

  const result = client.getResult<EmailSetResponse>(response, "trash")
  if (result?.notUpdated?.[emailId]) {
    const updateError = result.notUpdated[emailId]
    throw new Error(`Failed to trash email: ${updateError.type} - ${updateError.description}`)
  }
}

export async function deleteMessage(emailId: string): Promise<void> {
  const client = getClient()
  const accountId = await client.getAccountId()

  const response = await client.execute([
    {
      name: "Email/set",
      args: {
        accountId,
        destroy: [emailId],
      },
      clientId: "delete",
    },
  ])

  if (client.isError(response, "delete")) {
    const error = client.getError(response, "delete")
    throw new Error(`Failed to delete email: ${error?.type} - ${error?.description}`)
  }

  const result = client.getResult<EmailSetResponse>(response, "delete")
  if (result?.notDestroyed?.[emailId]) {
    const destroyError = result.notDestroyed[emailId]
    throw new Error(`Failed to delete email: ${destroyError.type} - ${destroyError.description}`)
  }
}

export async function deleteMessages(emailIds: string[]): Promise<void> {
  if (emailIds.length === 0) return

  const client = getClient()
  const accountId = await client.getAccountId()

  const response = await client.execute([
    {
      name: "Email/set",
      args: {
        accountId,
        destroy: emailIds,
      },
      clientId: "delete",
    },
  ])

  if (client.isError(response, "delete")) {
    const error = client.getError(response, "delete")
    throw new Error(`Failed to delete emails: ${error?.type} - ${error?.description}`)
  }

  const result = client.getResult<EmailSetResponse>(response, "delete")
  if (result?.notDestroyed && Object.keys(result.notDestroyed).length > 0) {
    const failedIds = Object.keys(result.notDestroyed)
    throw new Error(`Failed to delete ${failedIds.length} emails`)
  }
}
