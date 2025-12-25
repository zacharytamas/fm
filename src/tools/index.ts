export { archiveMessage, deleteMessage, deleteMessages, trashMessage } from "./archive-delete.ts"
export {
  getMailboxById,
  getMailboxByName,
  getMailboxByRole,
  getMailboxes,
} from "./get-mailboxes.ts"
export type { GetMessageOptions } from "./get-message.ts"
export { getMessage, getMessages as getMessagesById } from "./get-message.ts"
export type { GetMessagesOptions } from "./get-messages.ts"
export { getMessages, getUnreadMessages } from "./get-messages.ts"
export { addToMailbox, moveMessage, removeFromMailbox } from "./move-message.ts"
export type {
  Email,
  EmailAddress,
  EmailBodyPart,
  EmailBodyValue,
  JMAPSession,
  Mailbox,
} from "./shared.ts"
export { createClient, getClient, JMAPClient } from "./shared.ts"

export {
  markAsFlagged,
  markAsRead,
  markAsUnread,
  markManyAsRead,
  removeFlag,
  removeKeyword,
  setKeyword,
} from "./update-message.ts"
