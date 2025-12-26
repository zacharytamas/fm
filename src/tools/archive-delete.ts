import { getMailboxByRole, getMailboxes } from "./get-mailboxes.ts"
import { executeEmailDestroy, executeEmailUpdate } from "./shared.ts"

export async function archiveMessages(emailIds: string[], markRead = true): Promise<void> {
  if (emailIds.length === 0) return

  const archiveMailbox = await getMailboxByRole("archive")
  if (!archiveMailbox) {
    throw new Error("Archive mailbox not found")
  }

  const inboxes = (await getMailboxes()).filter((m) => m.name.toLowerCase().includes("inbox"))

  const update = Object.fromEntries(
    emailIds.map((emailId) => [
      emailId,
      {
        ...(markRead && { "keywords/$seen": true }),
        mailboxIds: {
          // Remove from all inboxes
          ...(inboxes.length > 0 ? Object.fromEntries(inboxes.map((m) => [m.id, null])) : {}),
          [archiveMailbox.id]: true,
        },
      },
    ]),
  )

  const result = await executeEmailUpdate({
    clientId: "archive",
    update,
    errorMessage: "Failed to archive emails",
  })

  if (result?.notUpdated && Object.keys(result.notUpdated).length > 0) {
    const failedIds = Object.keys(result.notUpdated)
    throw new Error(`Failed to archive ${failedIds.length} emails`)
  }
}

export async function trashMessages(emailIds: string[], markRead = true): Promise<void> {
  if (emailIds.length === 0) return

  const trashMailbox = await getMailboxByRole("trash")
  if (!trashMailbox) {
    throw new Error("Trash mailbox not found")
  }

  const update = Object.fromEntries(
    emailIds.map((emailId) => [
      emailId,
      { ...(markRead && { "keywords/$seen": true }), mailboxIds: { [trashMailbox.id]: true } },
    ]),
  )

  const result = await executeEmailUpdate({
    clientId: "trash",
    update,
    errorMessage: "Failed to trash emails",
  })

  if (result?.notUpdated && Object.keys(result.notUpdated).length > 0) {
    const failedIds = Object.keys(result.notUpdated)
    throw new Error(`Failed to trash ${failedIds.length} emails`)
  }
}

export async function deleteMessage(emailId: string): Promise<void> {
  await executeEmailDestroy({
    clientId: "delete",
    destroy: [emailId],
    errorMessage: "Failed to delete email",
    emailId,
  })
}

export async function deleteMessages(emailIds: string[]): Promise<void> {
  if (emailIds.length === 0) return

  const result = await executeEmailDestroy({
    clientId: "delete",
    destroy: emailIds,
    errorMessage: "Failed to delete emails",
  })

  if (result?.notDestroyed && Object.keys(result.notDestroyed).length > 0) {
    const failedIds = Object.keys(result.notDestroyed)
    throw new Error(`Failed to delete ${failedIds.length} emails`)
  }
}
