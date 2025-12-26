import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { archiveMessages, deleteMessage, deleteMessages, trashMessage } from "./archive-delete.ts"
import { createMockFetch, createSuccessResponse, getMethodCall } from "./test-utils.ts"

describe("archive-delete", () => {
  let originalFetch: typeof globalThis.fetch
  let originalToken: string | undefined

  beforeEach(() => {
    originalFetch = globalThis.fetch
    originalToken = Bun.env.FASTMAIL_API_TOKEN
    Bun.env.FASTMAIL_API_TOKEN = "test-token"
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    if (originalToken) {
      Bun.env.FASTMAIL_API_TOKEN = originalToken
    } else {
      delete Bun.env.FASTMAIL_API_TOKEN
    }
  })

  describe("archiveMessages", () => {
    test("moves multiple emails to archive mailbox in single request", async () => {
      const archiveMailbox = { id: "archive-id", name: "Archive", role: "archive" }
      const inboxMailbox = { id: "inbox-id", name: "Inbox", role: "inbox" }

      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Mailbox/get", { list: [archiveMailbox, inboxMailbox], notFound: [] }, "getMailboxes"],
          ]),
          createSuccessResponse([
            ["Email/set", { updated: { "email-1": null, "email-2": null } }, "archive"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await archiveMessages(["email-1", "email-2"])

      const setCall = getMethodCall(capturedRequests, -1, 0)
      expect(setCall?.[0]).toBe("Email/set")
      expect(setCall?.[1].update).toEqual({
        "email-1": { mailboxIds: { "archive-id": true } },
        "email-2": { mailboxIds: { "archive-id": true } },
      })
    })

    test("does nothing for empty array", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [],
      })
      globalThis.fetch = mockFetch

      await archiveMessages([])

      expect(capturedRequests).toHaveLength(0)
    })

    test("throws if archive mailbox not found", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Mailbox/get", { list: [], notFound: [] }, "getMailboxes"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await expect(archiveMessages(["email-123"])).rejects.toThrow("Archive mailbox not found")
    })

    test("throws if inbox mailbox not found", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Mailbox/get", { list: [], notFound: [] }, "getMailboxes"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await expect(archiveMessages(["email-123"])).rejects.toThrow("Archive mailbox not found")
    })

    test("throws when some emails not updated", async () => {
      const archiveMailbox = { id: "archive-id", name: "Archive", role: "archive" }
      const inboxMailbox = { id: "inbox-id", name: "Inbox", role: "inbox" }
      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Mailbox/get", { list: [archiveMailbox, inboxMailbox], notFound: [] }, "getMailboxes"],
          ]),
          createSuccessResponse([
            [
              "Email/set",
              {
                updated: { "email-1": null },
                notUpdated: { "email-2": { type: "notFound" } },
              },
              "archive",
            ],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await expect(archiveMessages(["email-1", "email-2"])).rejects.toThrow(
        "Failed to archive 1 emails",
      )
    })
  })

  describe("trashMessage", () => {
    test("moves email to trash mailbox", async () => {
      const trashMailbox = { id: "trash-id", name: "Trash", role: "trash" }

      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Mailbox/get", { list: [trashMailbox], notFound: [] }, "getMailboxes"],
          ]),
          createSuccessResponse([["Email/set", { updated: { "email-123": null } }, "trash"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await trashMessage("email-123")

      const setCall = getMethodCall(capturedRequests, -1, 0)
      expect(setCall?.[1].update).toEqual({
        "email-123": {
          mailboxIds: { "trash-id": true },
        },
      })
    })
  })

  describe("deleteMessage", () => {
    test("calls Email/set with destroy", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/set", { destroyed: ["email-123"] }, "delete"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await deleteMessage("email-123")

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[0]).toBe("Email/set")
      expect(methodCall?.[1].destroy).toEqual(["email-123"])
    })

    test("throws when email not destroyed", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            [
              "Email/set",
              {
                notDestroyed: {
                  "email-123": { type: "notFound", description: "Not found" },
                },
              },
              "delete",
            ],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await expect(deleteMessage("email-123")).rejects.toThrow("Failed to delete email")
    })
  })

  describe("deleteMessages", () => {
    test("deletes multiple emails in single request", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/set", { destroyed: ["e1", "e2", "e3"] }, "delete"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await deleteMessages(["e1", "e2", "e3"])

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].destroy).toEqual(["e1", "e2", "e3"])
    })

    test("does nothing for empty array", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [],
      })
      globalThis.fetch = mockFetch

      await deleteMessages([])

      expect(capturedRequests).toHaveLength(0)
    })

    test("throws when some emails not destroyed", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            [
              "Email/set",
              {
                destroyed: ["e1"],
                notDestroyed: { e2: { type: "notFound" } },
              },
              "delete",
            ],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await expect(deleteMessages(["e1", "e2"])).rejects.toThrow("Failed to delete 1 emails")
    })
  })
})
