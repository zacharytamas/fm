import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createMockFetch, createSuccessResponse, getMethodCall } from "./test-utils.ts"
import {
  markAsFlagged,
  markAsRead,
  markAsUnread,
  markManyAsRead,
  removeFlag,
  removeKeyword,
  setKeyword,
} from "./update-message.ts"

describe("update-message", () => {
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

  describe("markAsRead", () => {
    test("sets $seen keyword to true", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/set", { updated: { "email-123": null } }, "markRead"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await markAsRead("email-123")

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].update).toEqual({
        "email-123": { "keywords/$seen": true },
      })
    })
  })

  describe("markAsUnread", () => {
    test("sets $seen keyword to null", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/set", { updated: { "email-123": null } }, "markUnread"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await markAsUnread("email-123")

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].update).toEqual({
        "email-123": { "keywords/$seen": null },
      })
    })
  })

  describe("markAsFlagged", () => {
    test("sets $flagged keyword to true", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/set", { updated: { "email-123": null } }, "flag"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await markAsFlagged("email-123")

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].update).toEqual({
        "email-123": { "keywords/$flagged": true },
      })
    })
  })

  describe("removeFlag", () => {
    test("sets $flagged keyword to null", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/set", { updated: { "email-123": null } }, "unflag"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await removeFlag("email-123")

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].update).toEqual({
        "email-123": { "keywords/$flagged": null },
      })
    })
  })

  describe("setKeyword", () => {
    test("sets custom keyword to true", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/set", { updated: { "email-123": null } }, "setKeyword"]]),
        ],
      })
      globalThis.fetch = mockFetch

      await setKeyword("email-123", "$important")

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].update).toEqual({
        "email-123": { "keywords/$important": true },
      })
    })
  })

  describe("removeKeyword", () => {
    test("sets custom keyword to null", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/set", { updated: { "email-123": null } }, "removeKeyword"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await removeKeyword("email-123", "$important")

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].update).toEqual({
        "email-123": { "keywords/$important": null },
      })
    })
  })

  describe("markManyAsRead", () => {
    test("updates multiple emails in single request", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/set", { updated: { e1: null, e2: null, e3: null } }, "markManyRead"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await markManyAsRead(["e1", "e2", "e3"])

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].update).toEqual({
        e1: { "keywords/$seen": true },
        e2: { "keywords/$seen": true },
        e3: { "keywords/$seen": true },
      })
    })

    test("does nothing for empty array", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [],
      })
      globalThis.fetch = mockFetch

      await markManyAsRead([])

      expect(capturedRequests).toHaveLength(0)
    })
  })
})
