import { describe, expect, test } from "bun:test"
import { formatMailboxListPlain, formatMessageListPlain, resolveOutputFormat } from "./cli.ts"
import type { EmailMessage, Mailbox } from "./tools/index.ts"

describe("resolveOutputFormat", () => {
  test("defaults to human for TTY", () => {
    expect(resolveOutputFormat(null, true)).toBe("human")
  })

  test("defaults to plain for non-TTY", () => {
    expect(resolveOutputFormat(null, false)).toBe("plain")
  })

  test("prefers json", () => {
    expect(resolveOutputFormat("json", true)).toBe("json")
  })
})

describe("formatters", () => {
  test("formats mailbox list plain", () => {
    const mailbox: Mailbox = {
      id: "M1",
      name: "Inbox",
      parentId: null,
      role: "inbox",
      sortOrder: 0,
      totalEmails: 10,
      unreadEmails: 2,
      totalThreads: 10,
      unreadThreads: 2,
      isSubscribed: true,
    }

    expect(formatMailboxListPlain([mailbox])).toBe("M1\tInbox\tinbox\t2/10")
  })

  test("formats message list plain", () => {
    const message: EmailMessage = {
      id: "E1",
      blobId: "B1",
      threadId: "T1",
      mailboxIds: { M1: true },
      keywords: { $seen: true, $flagged: true },
      size: 123,
      receivedAt: "2024-01-01T00:00:00Z",
      messageId: null,
      inReplyTo: null,
      references: null,
      sender: null,
      from: [{ name: "Alice", email: "alice@example.com" }],
      to: null,
      cc: null,
      bcc: null,
      replyTo: null,
      subject: "Hello",
      sentAt: null,
      hasAttachment: false,
      preview: "Hi there",
    }

    const expected = "E1\t2024-01-01T00:00:00Z\tAlice <alice@example.com>\tHello\tseen,flagged"
    expect(formatMessageListPlain([message])).toBe(expected)
  })
})
