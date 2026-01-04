import { executeEmailUpdate } from "./shared.ts"

export async function moveMessage(
  emailId: string,
  fromMailboxId: string,
  toMailboxId: string,
): Promise<void> {
  await executeEmailUpdate({
    clientId: "move",
    update: {
      [emailId]: {
        [`mailboxIds/${fromMailboxId}`]: null,
        [`mailboxIds/${toMailboxId}`]: true,
      },
    },
    errorMessage: "Failed to move email",
    emailId,
  })
}

export async function moveMessages(
  emailIds: string[],
  fromMailboxId: string,
  toMailboxId: string,
): Promise<void> {
  if (emailIds.length === 0) return

  const update = Object.fromEntries(
    emailIds.map((emailId) => [
      emailId,
      {
        [`mailboxIds/${fromMailboxId}`]: null,
        [`mailboxIds/${toMailboxId}`]: true,
      },
    ]),
  )

  const result = await executeEmailUpdate({
    clientId: "move",
    update,
    errorMessage: "Failed to move emails",
  })

  if (result?.notUpdated && Object.keys(result.notUpdated).length > 0) {
    const failedIds = Object.keys(result.notUpdated)
    throw new Error(`Failed to move ${failedIds.length} emails`)
  }
}

export async function addToMailbox(emailId: string, mailboxId: string): Promise<void> {
  await executeEmailUpdate({
    clientId: "add",
    update: {
      [emailId]: {
        [`mailboxIds/${mailboxId}`]: true,
      },
    },
    errorMessage: "Failed to add email to mailbox",
    emailId,
  })
}

export async function removeFromMailbox(emailId: string, mailboxId: string): Promise<void> {
  await executeEmailUpdate({
    clientId: "remove",
    update: {
      [emailId]: {
        [`mailboxIds/${mailboxId}`]: null,
      },
    },
    errorMessage: "Failed to remove email from mailbox",
    emailId,
  })
}
