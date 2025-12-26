import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { getMessage, getMessages } from "./get-message.ts"
import { createMockFetch, createSuccessResponse, getMethodCall } from "./test-utils.ts"

describe("get-message", () => {
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

  describe("getMessage", () => {
    test("calls Email/get with single id", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [createSuccessResponse([["Email/get", { list: [], notFound: [] }, "get"]])],
      })
      globalThis.fetch = mockFetch

      await getMessage("email-123")

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[0]).toBe("Email/get")
      expect(methodCall?.[1].ids).toEqual(["email-123"])
    })

    test("requests header properties by default", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [createSuccessResponse([["Email/get", { list: [], notFound: [] }, "get"]])],
      })
      globalThis.fetch = mockFetch

      await getMessage("email-123")

      const methodCall = getMethodCall(capturedRequests)
      const properties = methodCall?.[1].properties as string[]
      expect(properties).toContain("id")
      expect(properties).toContain("subject")
      expect(properties).toContain("from")
      expect(properties).toContain("receivedAt")
      expect(properties).not.toContain("bodyValues")
    })

    test("includes body properties when includeBody is true", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [createSuccessResponse([["Email/get", { list: [], notFound: [] }, "get"]])],
      })
      globalThis.fetch = mockFetch

      await getMessage("email-123", { includeBody: true })

      const methodCall = getMethodCall(capturedRequests)
      const properties = methodCall?.[1].properties as string[]
      expect(properties).toContain("bodyValues")
      expect(properties).toContain("textBody")
      expect(properties).toContain("htmlBody")
    })

    test("sets fetchTextBodyValues for text body type", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [createSuccessResponse([["Email/get", { list: [], notFound: [] }, "get"]])],
      })
      globalThis.fetch = mockFetch

      await getMessage("email-123", { includeBody: true, bodyType: "text" })

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].fetchTextBodyValues).toBe(true)
      expect(methodCall?.[1].fetchHTMLBodyValues).toBe(false)
    })

    test("sets fetchHTMLBodyValues for html body type", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [createSuccessResponse([["Email/get", { list: [], notFound: [] }, "get"]])],
      })
      globalThis.fetch = mockFetch

      await getMessage("email-123", { includeBody: true, bodyType: "html" })

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].fetchTextBodyValues).toBe(false)
      expect(methodCall?.[1].fetchHTMLBodyValues).toBe(true)
    })

    test("returns email from response", async () => {
      const mockEmail = {
        id: "email-123",
        subject: "Test Subject",
        from: [{ name: "Sender", email: "sender@test.com" }],
      }

      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/get", { list: [mockEmail], notFound: [] }, "get"]]),
        ],
      })
      globalThis.fetch = mockFetch

      const email = await getMessage("email-123")

      expect(email?.id).toBe("email-123")
      expect(email?.subject).toBe("Test Subject")
    })

    test("returns null when email not found", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/get", { list: [], notFound: ["email-123"] }, "get"]]),
        ],
      })
      globalThis.fetch = mockFetch

      const email = await getMessage("email-123")

      expect(email).toBeNull()
    })
  })

  describe("getMessages", () => {
    test("calls Email/get with multiple ids", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [createSuccessResponse([["Email/get", { list: [], notFound: [] }, "get"]])],
      })
      globalThis.fetch = mockFetch

      await getMessages(["e1", "e2", "e3"])

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[1].ids).toEqual(["e1", "e2", "e3"])
    })

    test("returns empty array for empty input", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [],
      })
      globalThis.fetch = mockFetch

      const emails = await getMessages([])

      expect(emails).toEqual([])
      expect(capturedRequests).toHaveLength(0)
    })

    test("returns list of emails", async () => {
      const mockEmails = [
        { id: "e1", subject: "First" },
        { id: "e2", subject: "Second" },
      ]

      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([["Email/get", { list: mockEmails, notFound: [] }, "get"]]),
        ],
      })
      globalThis.fetch = mockFetch

      const emails = await getMessages(["e1", "e2"])

      expect(emails).toHaveLength(2)
      expect(emails[0]?.subject).toBe("First")
    })
  })
})
