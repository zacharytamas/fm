import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { getMailboxByName, getMailboxByRole, getMailboxes } from "./get-mailboxes.ts"
import {
  createMockFetch,
  createSuccessResponse,
  getMethodCall,
  TEST_ACCOUNT_ID,
} from "./test-utils.ts"

describe("get-mailboxes", () => {
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

  describe("getMailboxes", () => {
    test("calls Mailbox/get with correct parameters", async () => {
      const { mockFetch, capturedRequests } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Mailbox/get", { accountId: TEST_ACCOUNT_ID, list: [], notFound: [] }, "getMailboxes"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      await getMailboxes()

      const methodCall = getMethodCall(capturedRequests)
      expect(methodCall?.[0]).toBe("Mailbox/get")
      expect(methodCall?.[1]).toEqual({ accountId: TEST_ACCOUNT_ID, ids: null })
      expect(methodCall?.[2]).toBe("getMailboxes")
    })

    test("returns list of mailboxes", async () => {
      const mockMailboxes = [
        { id: "m1", name: "Inbox", role: "inbox", parentId: null },
        { id: "m2", name: "Sent", role: "sent", parentId: null },
        { id: "m3", name: "Archive", role: "archive", parentId: null },
      ]

      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            [
              "Mailbox/get",
              { accountId: TEST_ACCOUNT_ID, list: mockMailboxes, notFound: [] },
              "getMailboxes",
            ],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      const mailboxes = await getMailboxes()

      expect(mailboxes).toHaveLength(3)
      expect(mailboxes[0]?.name).toBe("Inbox")
      expect(mailboxes[1]?.role).toBe("sent")
    })

    test("returns empty array when no mailboxes", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            ["Mailbox/get", { accountId: TEST_ACCOUNT_ID, list: [], notFound: [] }, "getMailboxes"],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      const mailboxes = await getMailboxes()

      expect(mailboxes).toEqual([])
    })

    test("throws on error response", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          {
            methodResponses: [
              ["error", { type: "serverFail", description: "Oops" }, "getMailboxes"],
            ],
            sessionState: "state",
          },
        ],
      })
      globalThis.fetch = mockFetch

      await expect(getMailboxes()).rejects.toThrow("Failed to get mailboxes")
    })
  })

  describe("getMailboxByRole", () => {
    test("finds mailbox by role", async () => {
      const mockMailboxes = [
        { id: "m1", name: "Inbox", role: "inbox", parentId: null },
        { id: "m2", name: "Archive", role: "archive", parentId: null },
      ]

      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            [
              "Mailbox/get",
              { accountId: TEST_ACCOUNT_ID, list: mockMailboxes, notFound: [] },
              "getMailboxes",
            ],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      const inbox = await getMailboxByRole("inbox")

      expect(inbox?.id).toBe("m1")
      expect(inbox?.name).toBe("Inbox")
    })

    test("returns null when role not found", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            [
              "Mailbox/get",
              { accountId: TEST_ACCOUNT_ID, list: [{ id: "m1", role: "inbox" }], notFound: [] },
              "getMailboxes",
            ],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      const trash = await getMailboxByRole("trash")

      expect(trash).toBeNull()
    })
  })

  describe("getMailboxByName", () => {
    test("finds mailbox by name", async () => {
      const mockMailboxes = [
        { id: "m1", name: "Inbox", role: "inbox", parentId: null },
        { id: "m2", name: "My Folder", role: null, parentId: null },
      ]

      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            [
              "Mailbox/get",
              { accountId: TEST_ACCOUNT_ID, list: mockMailboxes, notFound: [] },
              "getMailboxes",
            ],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      const folder = await getMailboxByName("My Folder")

      expect(folder?.id).toBe("m2")
    })

    test("returns null when name not found", async () => {
      const { mockFetch } = createMockFetch({
        apiResponses: [
          createSuccessResponse([
            [
              "Mailbox/get",
              { accountId: TEST_ACCOUNT_ID, list: [{ id: "m1", name: "Inbox" }], notFound: [] },
              "getMailboxes",
            ],
          ]),
        ],
      })
      globalThis.fetch = mockFetch

      const folder = await getMailboxByName("Nonexistent")

      expect(folder).toBeNull()
    })
  })
})
