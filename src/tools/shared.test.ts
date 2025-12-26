import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { JMAPClient } from "./shared.ts"
import {
  createMockFetch,
  createSuccessResponse,
  getMethodCall,
  mockSession,
  TEST_ACCOUNT_ID,
  TEST_API_URL,
} from "./test-utils.ts"

describe("JMAPClient", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe("constructor", () => {
    test("accepts access token as parameter", () => {
      const client = new JMAPClient("test-token")
      expect(client).toBeInstanceOf(JMAPClient)
    })

    test("throws if no token provided and no env var", () => {
      const originalEnv = Bun.env.FASTMAIL_API_TOKEN
      delete Bun.env.FASTMAIL_API_TOKEN

      expect(() => new JMAPClient()).toThrow("FASTMAIL_API_TOKEN")

      if (originalEnv) {
        Bun.env.FASTMAIL_API_TOKEN = originalEnv
      }
    })
  })

  describe("getSession", () => {
    test("fetches session from Fastmail API", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({})
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      const session = await client.getSession()

      expect(session).toEqual(mockSession)
      expect(capturedRequests[0]?.url).toContain("/jmap/session")
      expect(capturedRequests[0]?.headers.Authorization).toBe("Bearer test-token")
    })

    test("caches session after first fetch", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({})
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      await client.getSession()
      await client.getSession()

      const sessionRequests = capturedRequests.filter((r) => r.url.includes("/jmap/session"))
      expect(sessionRequests.length).toBe(1)
    })
  })

  describe("getAccountId", () => {
    test("returns primary mail account ID from session", async () => {
      const { mockFetch } = createMockFetch({})
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      const accountId = await client.getAccountId()

      expect(accountId).toBe(TEST_ACCOUNT_ID)
    })

    test("caches account ID after first fetch", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({})
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      await client.getAccountId()
      await client.getAccountId()

      expect(capturedRequests.length).toBe(1)
    })
  })

  describe("getApiUrl", () => {
    test("returns API URL from session", async () => {
      const { mockFetch } = createMockFetch({})
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      const apiUrl = await client.getApiUrl()

      expect(apiUrl).toBe(TEST_API_URL)
    })
  })

  describe("execute", () => {
    test("sends method calls to API endpoint", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [createSuccessResponse([["Mailbox/get", { list: [] }, "c1"]])],
      })
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      await client.execute([
        {
          name: "Mailbox/get",
          args: { accountId: TEST_ACCOUNT_ID },
          clientId: "c1",
        },
      ])

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[0]).toBe("Mailbox/get")
      expect(methodCall?.[1]).toEqual({ accountId: TEST_ACCOUNT_ID })
      expect(methodCall?.[2]).toBe("c1")
    })

    test("includes required JMAP capabilities", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [createSuccessResponse([])],
      })
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      await client.execute([{ name: "Test/method", args: {}, clientId: "c1" }])

      const body = capturedRequests[1]?.body as { using: string[] }
      expect(body.using).toContain("urn:ietf:params:jmap:core")
      expect(body.using).toContain("urn:ietf:params:jmap:mail")
    })

    test("sends authorization header", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [createSuccessResponse([])],
      })
      globalThis.fetch = mockFetch

      const client = new JMAPClient("my-secret-token")
      await client.execute([{ name: "Test/method", args: {}, clientId: "c1" }])

      const apiRequest = capturedRequests[1]
      expect(apiRequest?.headers.Authorization).toBe("Bearer my-secret-token")
    })

    test("batches multiple method calls in single request", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Email/query", { ids: ["e1"] }, "q1"],
            ["Email/get", { list: [] }, "g1"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      await client.execute([
        { name: "Email/query", args: { filter: {} }, clientId: "q1" },
        { name: "Email/get", args: { ids: ["e1"] }, clientId: "g1" },
      ])

      const body = capturedRequests[1]?.body as { methodCalls: unknown[] }
      expect(body.methodCalls.length).toBe(2)
    })
  })

  describe("ref", () => {
    test("creates back-reference object", () => {
      const client = new JMAPClient("test-token")
      const ref = client.ref("query0", "Email/query", "/ids")

      expect(ref).toEqual({
        resultOf: "query0",
        name: "Email/query",
        path: "/ids",
      })
    })
  })

  describe("getResult", () => {
    test("extracts result for matching clientId", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Mailbox/get", { accountId: TEST_ACCOUNT_ID, list: [{ id: "m1" }] }, "c1"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      const response = await client.execute([{ name: "Mailbox/get", args: {}, clientId: "c1" }])

      const result = client.getResult<{ list: Array<{ id: string }> }>(response, "c1")
      expect(result?.list[0]?.id).toBe("m1")
    })

    test("returns null for non-matching clientId", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [createSuccessResponse([["Mailbox/get", {}, "c1"]])],
      })
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      const response = await client.execute([{ name: "Mailbox/get", args: {}, clientId: "c1" }])

      const result = client.getResult(response, "wrong-id")
      expect(result).toBeNull()
    })
  })

  describe("isError", () => {
    test("returns true for error response", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          {
            methodResponses: [["error", { type: "notFound" }, "c1"]],
            sessionState: "state",
          },
        ],
      })
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      const response = await client.execute([{ name: "Email/get", args: {}, clientId: "c1" }])

      expect(client.isError(response, "c1")).toBe(true)
    })

    test("returns false for success response", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [createSuccessResponse([["Email/get", { list: [] }, "c1"]])],
      })
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      const response = await client.execute([{ name: "Email/get", args: {}, clientId: "c1" }])

      expect(client.isError(response, "c1")).toBe(false)
    })
  })

  describe("getError", () => {
    test("returns error details for error response", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          {
            methodResponses: [["error", { type: "notFound", description: "Not found" }, "c1"]],
            sessionState: "state",
          },
        ],
      })
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      const response = await client.execute([{ name: "Email/get", args: {}, clientId: "c1" }])

      const error = client.getError(response, "c1")
      expect(error?.type).toBe("notFound")
      expect(error?.description).toBe("Not found")
    })

    test("returns null for success response", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [createSuccessResponse([["Email/get", { list: [] }, "c1"]])],
      })
      globalThis.fetch = mockFetch

      const client = new JMAPClient("test-token")
      const response = await client.execute([{ name: "Email/get", args: {}, clientId: "c1" }])

      expect(client.getError(response, "c1")).toBeNull()
    })
  })
})
