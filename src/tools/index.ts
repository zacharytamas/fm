export { archiveMessages, deleteMessage, deleteMessages, trashMessages } from "./archive-delete.ts"
export { downloadAttachment } from "./download-attachment.ts"
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
export { addToMailbox, moveMessage, moveMessages, removeFromMailbox } from "./move-message.ts"
export type {
  EmailAddress,
  EmailBodyPart,
  EmailBodyValue,
  EmailMessage,
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
