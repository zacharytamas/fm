import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { addToMailbox, moveMessage, removeFromMailbox } from "./move-message.ts"
import { createMockFetch, createSuccessResponse, getMethodCall } from "./test-utils.ts"

describe("move-message", () => {
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

  describe("moveMessage", () => {
    test("calls Email/set with mailboxIds update", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/set", { updated: { "email-123": null } }, "move"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await moveMessage("email-123", "inbox-id", "archive-id")

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[0]).toBe("Email/set")
      expect(methodCall?.[1].update).toEqual({
        "email-123": {
          "mailboxIds/inbox-id": null,
          "mailboxIds/archive-id": true,
        },
      })
    })

    test("throws on error response", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          {
            methodResponses: [["error", { type: "serverFail" }, "move"]],
            sessionState: "state",
          },
        ],
      })
      globalThis.fetch = mockFetch

      await expect(moveMessage("email-123", "from", "to")).rejects.toThrow("Failed to move email")
    })

    test("throws when email not updated", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            [
              "Email/set",
              {
                notUpdated: {
                  "email-123": { type: "notFound", description: "Email not found" },
                },
              },
              "move",
            ],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await expect(moveMessage("email-123", "from", "to")).rejects.toThrow("Failed to move email")
    })
  })

  describe("addToMailbox", () => {
    test("sets mailbox to true without removing from others", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/set", { updated: { "email-123": null } }, "add"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await addToMailbox("email-123", "label-id")

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].update).toEqual({
        "email-123": {
          "mailboxIds/label-id": true,
        },
      })
    })
  })

  describe("removeFromMailbox", () => {
    test("sets mailbox to null", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/set", { updated: { "email-123": null } }, "remove"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await removeFromMailbox("email-123", "label-id")

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].update).toEqual({
        "email-123": {
          "mailboxIds/label-id": null,
        },
      })
    })
  })
})
