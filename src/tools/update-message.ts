import { executeEmailUpdate } from "./shared.ts"

export async function markAsRead(emailId: string): Promise<void> {
  await executeEmailUpdate({
    clientId: "markRead",
    update: {
      [emailId]: {
        "keywords/$seen": true,
      },
    },
    errorMessage: "Failed to mark email as read",
    emailId,
  })
}

export async function markAsUnread(emailId: string): Promise<void> {
  await executeEmailUpdate({
    clientId: "markUnread",
    update: {
      [emailId]: {
        "keywords/$seen": null,
      },
    },
    errorMessage: "Failed to mark email as unread",
    emailId,
  })
}

export async function markAsFlagged(emailId: string): Promise<void> {
  await executeEmailUpdate({
    clientId: "flag",
    update: {
      [emailId]: {
        "keywords/$flagged": true,
      },
    },
    errorMessage: "Failed to flag email",
    emailId,
  })
}

export async function removeFlag(emailId: string): Promise<void> {
  await executeEmailUpdate({
    clientId: "unflag",
    update: {
      [emailId]: {
        "keywords/$flagged": null,
      },
    },
    errorMessage: "Failed to unflag email",
    emailId,
  })
}

export async function setKeyword(emailId: string, keyword: string): Promise<void> {
  await executeEmailUpdate({
    clientId: "setKeyword",
    update: {
      [emailId]: {
        [`keywords/${keyword}`]: true,
      },
    },
    errorMessage: "Failed to set keyword",
    emailId,
  })
}

export async function removeKeyword(emailId: string, keyword: string): Promise<void> {
  await executeEmailUpdate({
    clientId: "removeKeyword",
    update: {
      [emailId]: {
        [`keywords/${keyword}`]: null,
      },
    },
    errorMessage: "Failed to remove keyword",
    emailId,
  })
}

export async function markManyAsRead(emailIds: string[]): Promise<void> {
  if (emailIds.length === 0) return

  const update: Record<string, Record<string, boolean>> = {}
  for (const id of emailIds) {
    update[id] = { "keywords/$seen": true }
  }

  await executeEmailUpdate({
    clientId: "markManyRead",
    update,
    errorMessage: "Failed to mark emails as read",
  })
}
