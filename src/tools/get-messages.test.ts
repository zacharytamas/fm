import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { getMessages, getUnreadMessages } from "./get-messages.ts"
import {
  createMockFetch,
  createSuccessResponse,
  getMethodCall,
  getRequestBody,
} from "./test-utils.ts"

describe("get-messages", () => {
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

  describe("getMessages", () => {
    test("batches Email/query and Email/get in single request", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/query", { ids: ["e1", "e2"] }, "query"],
            ["Email/get", { list: [] }, "get"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await getMessages({ mailboxId: "inbox-123" })

      const body = getRequestBody(capturedRequests)
      expect(body?.methodCalls).toHaveLength(2)
      expect(body?.methodCalls[0]?.[0]).toBe("Email/query")
      expect(body?.methodCalls[1]?.[0]).toBe("Email/get")
    })

    test("Email/query uses correct filter for mailbox", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/query", { ids: [] }, "query"],
            ["Email/get", { list: [] }, "get"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await getMessages({ mailboxId: "inbox-123" })

      const queryCall = getMethodCall(capturedRequests, -1, 0)
      expect(queryCall?.[1].filter).toEqual({ inMailbox: "inbox-123" })
    })

    test("applies from and subject filters", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/query", { ids: [] }, "query"],
            ["Email/get", { list: [] }, "get"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await getMessages({
        mailboxId: "inbox-123",
        filters: { from: "billing@example.com", subject: "invoice" },
      })

      const queryCall = getMethodCall(capturedRequests, -1, 0)
      expect(queryCall?.[1].filter).toEqual({
        inMailbox: "inbox-123",
        from: "billing@example.com",
        subject: "invoice",
      })
    })

    test("uses back-reference for Email/get ids", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/query", { ids: ["e1"] }, "query"],
            ["Email/get", { list: [] }, "get"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await getMessages({ mailboxId: "inbox-123" })

      const getCall = getMethodCall(capturedRequests, -1, 1)
      expect(getCall?.[1]["#ids"]).toEqual({
        resultOf: "query",
        name: "Email/query",
        path: "/ids",
      })
    })

    test("applies default sort by receivedAt descending", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/query", { ids: [] }, "query"],
            ["Email/get", { list: [] }, "get"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await getMessages({ mailboxId: "inbox-123" })

      const queryCall = getMethodCall(capturedRequests, -1, 0)
      expect(queryCall?.[1].sort).toEqual([{ property: "receivedAt", isAscending: false }])
    })

    test("respects limit option", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/query", { ids: [] }, "query"],
            ["Email/get", { list: [] }, "get"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await getMessages({ mailboxId: "inbox-123", limit: 25 })

      const queryCall = getMethodCall(capturedRequests, -1, 0)
      expect(queryCall?.[1].limit).toBe(25)
    })

    test("respects position option", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/query", { ids: [] }, "query"],
            ["Email/get", { list: [] }, "get"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await getMessages({ mailboxId: "inbox-123", position: 50 })

      const queryCall = getMethodCall(capturedRequests, -1, 0)
      expect(queryCall?.[1].position).toBe(50)
    })

    test("returns email list from response", async () => {
      const mockEmails = [
        { id: "e1", subject: "Hello", from: [{ email: "a@test.com" }] },
        { id: "e2", subject: "World", from: [{ email: "b@test.com" }] },
      ]

      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/query", { ids: ["e1", "e2"] }, "query"],
            ["Email/get", { list: mockEmails }, "get"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      const emails = await getMessages({ mailboxId: "inbox-123" })

      expect(emails).toHaveLength(2)
      expect(emails[0]?.subject).toBe("Hello")
      expect(emails[1]?.id).toBe("e2")
    })
  })

  describe("getUnreadMessages", () => {
    test("filters by notKeyword $seen", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/query", { ids: [] }, "query"],
            ["Email/get", { list: [] }, "get"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await getUnreadMessages("inbox-123")

      const queryCall = getMethodCall(capturedRequests, -1, 0)
      expect(queryCall?.[1].filter).toEqual({
        inMailbox: "inbox-123",
        notKeyword: "$seen",
      })
    })

    test("supports from and subject filters", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/query", { ids: [] }, "query"],
            ["Email/get", { list: [] }, "get"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await getUnreadMessages("inbox-123", 50, 0, {
        from: "billing@example.com",
        subject: "invoice",
      })

      const queryCall = getMethodCall(capturedRequests, -1, 0)
      expect(queryCall?.[1].filter).toEqual({
        inMailbox: "inbox-123",
        from: "billing@example.com",
        subject: "invoice",
        notKeyword: "$seen",
      })
    })

    test("applies limit parameter", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/query", { ids: [] }, "query"],
            ["Email/get", { list: [] }, "get"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await getUnreadMessages("inbox-123", 10)

      const queryCall = getMethodCall(capturedRequests, -1, 0)
      expect(queryCall?.[1].limit).toBe(10)
    })
  })
})
